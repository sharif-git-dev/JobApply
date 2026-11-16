import Anthropic from "@anthropic-ai/sdk";
import { getSettings, saveSettings } from "../store";
import type { PublicSettings, Settings } from "../types";

/** USD per million tokens. Used to estimate spend and enforce the budget cap. */
export const MODELS: Record<string, { label: string; note: string; input: number; output: number }> = {
  "claude-opus-5-5": { label: "Claude Opus 5.5", note: "Best writing quality", input: 4, output: 20 },
  "claude-sonnet-5-5": { label: "Claude Sonnet 5.5", note: "Balanced", input: 2, output: 10 },
  "claude-haiku-5-5": { label: "Claude Haiku 5.5", note: "Cheapest — about 40× less than Opus", input: 0.1, output: 0.5 },
};
export const DEFAULT_MODEL = "claude-opus-5-5";

export const MAX_OUTPUT_TOKENS = 16_000;

/** The user-facing failure for anything AI-related. `status` becomes the HTTP status. */
export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code: "no_key" | "budget" | "auth" | "rate_limit" | "refusal" | "api" = "api",
  ) {
    super(message);
  }
}

export function resolveKey(settings: Settings): { key: string; fromEnv: boolean } {
  if (settings.anthropicApiKey) return { key: settings.anthropicApiKey, fromEnv: false };
  const env = process.env.ANTHROPIC_API_KEY ?? "";
  return { key: env, fromEnv: Boolean(env) };
}

export function resolveModel(settings: Settings): string {
  return MODELS[settings.model] ? settings.model : DEFAULT_MODEL;
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const { key, fromEnv } = resolveKey(settings);
  return {
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `…${key.slice(-4)}` : "",
    apiKeyFromEnv: fromEnv,
    model: resolveModel(settings),
    budgetUsd: settings.budgetUsd,
    spentUsd: settings.spentUsd,
    usage: settings.usage.slice(-25).reverse(),
    adzunaAppId: settings.adzunaAppId,
    hasAdzunaKey: Boolean(settings.adzunaAppKey),
    adzunaCountry: settings.adzunaCountry,
    watchlist: settings.watchlist,
  };
}

export async function aiAvailable(): Promise<boolean> {
  return Boolean(resolveKey(await getSettings()).key);
}

function costOf(model: string, usage: Anthropic.Beta.BetaUsage): number {
  const price = MODELS[model] ?? MODELS[DEFAULT_MODEL];
  const input =
    usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) * 1.25 + (usage.cache_read_input_tokens ?? 0) * 0.1;
  return (input * price.input + usage.output_tokens * price.output) / 1_000_000;
}

/**
 * Spend guard. Before every request we assume the worst case (the prompt plus a
 * full-length reply) and refuse if that could push the running total over the
 * user's cap, so the estimate can never cross it.
 */
function assertWithinBudget(settings: Settings, model: string, promptChars: number) {
  const price = MODELS[model];
  const worstCase = ((promptChars / 3) * price.input * 1.25 + MAX_OUTPUT_TOKENS * price.output) / 1_000_000;
  if (settings.spentUsd + worstCase > settings.budgetUsd) {
    throw new AiError(
      `This request could take AI spending past your $${settings.budgetUsd.toFixed(2)} cap (about $${settings.spentUsd.toFixed(2)} used so far), so it wasn't sent. ` +
        "Raise the cap or switch to a cheaper model in Settings — everything else keeps working without AI.",
      402,
      "budget",
    );
  }
}

async function recordUsage(task: string, model: string, usage: Anthropic.Beta.BetaUsage) {
  const costUsd = costOf(model, usage);
  await saveSettings((s) => ({
    ...s,
    spentUsd: s.spentUsd + costUsd,
    usage: [
      ...s.usage,
      {
        at: new Date().toISOString(),
        task,
        model,
        inputTokens: usage.input_tokens + (usage.cache_creation_input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0),
        outputTokens: usage.output_tokens,
        costUsd,
      },
    ].slice(-200),
  }));
}

function translate(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) {
    return new AiError("Anthropic rejected the API key. Check it in Settings.", 401, "auth");
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new AiError(`Your Anthropic account can't use this model: ${err.message}`, 403, "auth");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new AiError("Anthropic is rate-limiting requests. Wait a minute and try again.", 429, "rate_limit");
  }
  if (err instanceof Anthropic.BadRequestError) {
    // Includes "credit balance is too low" — pass Anthropic's own wording through.
    return new AiError(`Anthropic rejected the request: ${err.message}`, 400);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return new AiError("Couldn't reach Anthropic. Check your internet connection.", 503);
  }
  if (err instanceof Anthropic.APIError) {
    return new AiError(`Anthropic API error ${err.status ?? ""}: ${err.message}`.trim(), 502);
  }
  return new AiError((err as Error)?.message ?? "Unexpected AI error.");
}

export type Effort = "low" | "medium" | "high";

export interface AiRequest {
  task: string;
  /** Stable across a session (instructions + candidate profile) — cached by the API. */
  system: Anthropic.Beta.BetaTextBlockParam[];
  user: string;
  effort: Effort;
}

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;

/**
 * One place for everything every request shares: key lookup, the budget guard,
 * the refusal fallback, usage accounting, and error translation.
 */
export async function runAi<T>(
  req: AiRequest,
  call: (client: Anthropic, params: CreateParams) => Promise<{ message: Anthropic.Beta.BetaMessage; value: T | null }>,
): Promise<T> {
  const settings = await getSettings();
  const { key } = resolveKey(settings);
  if (!key) throw new AiError("Add an Anthropic API key in Settings to use AI features.", 400, "no_key");
  const model = resolveModel(settings);
  const promptChars = req.user.length + req.system.reduce((n, b) => n + b.text.length, 0);
  assertWithinBudget(settings, model, promptChars);

  const client = new Anthropic({ apiKey: key });
  try {
    const { message, value } = await call(client, {
      model,
      max_tokens: MAX_OUTPUT_TOKENS,
      output_config: { effort: req.effort },
      // If a safety classifier declines, Anthropic re-runs the request on the
      // model's default fallback inside the same call (no-op on models without one).
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: req.system,
      messages: [{ role: "user", content: req.user }],
    });
    await recordUsage(req.task, message.model in MODELS ? message.model : model, message.usage);
    if (message.stop_reason === "refusal") {
      throw new AiError("Claude declined this request. Try rephrasing, or edit the text by hand.", 422, "refusal");
    }
    if (message.stop_reason === "max_tokens") {
      throw new AiError("The response was cut off before it finished. Try again.", 502);
    }
    if (value === null || value === "") throw new AiError("Claude returned an empty response. Try again.", 502);
    return value;
  } catch (err) {
    throw translate(err);
  }
}

export function textOf(message: Anthropic.Beta.BetaMessage): string {
  return message.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}

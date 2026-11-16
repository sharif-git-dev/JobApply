import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getSettings, saveSettings } from "../store";
import type { PublicSettings, Settings } from "../types";
import { DEFAULT_MODEL, MODELS, PROVIDERS, type Provider } from "./models";

export const MAX_OUTPUT_TOKENS = 16_000;

/** The user-facing failure for anything AI-related. `status` becomes the HTTP status. */
export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code: "no_key" | "budget" | "auth" | "balance" | "rate_limit" | "refusal" | "api" = "api",
  ) {
    super(message);
  }
}

// ---- Settings → which model, which key ---------------------------------------

export function resolveModel(settings: Settings): string {
  return MODELS[settings.model] ? settings.model : DEFAULT_MODEL;
}

function resolveKey(settings: Settings, provider: Provider): { key: string; fromEnv: boolean } {
  const saved = provider === "deepseek" ? settings.deepseekApiKey : settings.anthropicApiKey;
  if (saved) return { key: saved, fromEnv: false };
  const env = process.env[PROVIDERS[provider].env] ?? "";
  return { key: env, fromEnv: Boolean(env) };
}

export function toPublicSettings(settings: Settings): PublicSettings {
  const model = resolveModel(settings);
  const provider = MODELS[model].provider;
  const { key, fromEnv } = resolveKey(settings, provider);
  return {
    provider,
    hasApiKey: Boolean(key),
    apiKeyHint: key ? `…${key.slice(-4)}` : "",
    apiKeyFromEnv: fromEnv,
    model,
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
  const settings = await getSettings();
  return Boolean(resolveKey(settings, MODELS[resolveModel(settings)].provider).key);
}

// ---- Spend tracking -----------------------------------------------------------

interface Usage {
  /** Prompt tokens billed at the full rate. */
  input: number;
  cacheRead: number;
  cacheWrite: number;
  output: number;
}

const NO_USAGE: Usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };

function costOf(model: string, u: Usage): number {
  const price = MODELS[model];
  return (u.input * price.input + u.cacheWrite * price.input * 1.25 + u.cacheRead * price.cachedInput + u.output * price.output) / 1_000_000;
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

async function recordUsage(task: string, model: string, u: Usage) {
  if (!u.input && !u.cacheRead && !u.cacheWrite && !u.output) return;
  const costUsd = costOf(model, u);
  await saveSettings((s) => ({
    ...s,
    spentUsd: s.spentUsd + costUsd,
    usage: [
      ...s.usage,
      { at: new Date().toISOString(), task, model, inputTokens: u.input + u.cacheRead + u.cacheWrite, outputTokens: u.output, costUsd },
    ].slice(-200),
  }));
}

// ---- The request every task makes ---------------------------------------------

export type Effort = "low" | "medium" | "high";

export interface AiRequest {
  task: string;
  /** Stable text first (rules, then the candidate profile) so providers can cache the prefix. */
  system: string[];
  user: string;
  /** How hard the model should think: "low" for transcription-like work, "medium" for writing and judgment. */
  effort: Effort;
}

/** What a provider hands back: the value if it got one, what it cost, and why not if it didn't. */
interface Outcome<T> {
  value: T | null;
  usage: Usage;
  failure?: AiError;
}

const CUT_OFF = new AiError("The response was cut off before it finished. Try again.", 502);
const DECLINED = new AiError("The AI declined this request. Try rephrasing, or edit the text by hand.", 422, "refusal");

// ---- DeepSeek (OpenAI-style chat completions) ---------------------------------

interface DeepSeekResponse {
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_cache_hit_tokens?: number; prompt_cache_miss_tokens?: number };
  error?: { message?: string };
}

function deepseekHttpError(status: number, detail: string): AiError {
  if (status === 401) return new AiError("DeepSeek rejected the API key. Check it in Settings.", 401, "auth");
  if (status === 402) {
    return new AiError("Your DeepSeek balance has run out. Top up at platform.deepseek.com/top_up, then try again.", 402, "balance");
  }
  if (status === 429) return new AiError("DeepSeek is rate-limiting requests. Wait a minute and try again.", 429, "rate_limit");
  if (status === 400 || status === 422) return new AiError(`DeepSeek rejected the request: ${detail || `HTTP ${status}`}`, 400);
  if (status >= 500) return new AiError("DeepSeek's servers are busy or having trouble. Try again in a moment.", 503);
  return new AiError(`DeepSeek API error ${status}${detail ? `: ${detail}` : ""}`, 502);
}

async function deepseek<T>(key: string, model: string, req: AiRequest, schema?: z.ZodType<T>): Promise<Outcome<T | string>> {
  const thinking = req.effort !== "low";
  // DeepSeek's JSON mode guarantees valid JSON but not a shape, so the shape goes in the prompt and is checked on return.
  const user = schema
    ? `${req.user}\n\nReply with a single JSON object and nothing else — no prose and no markdown fences. Include every property the schema lists, with exactly the type it gives (use "" or [] where there is nothing to put). It must conform to this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`
    : req.user;
  const body = {
    model,
    messages: [
      { role: "system", content: req.system.join("\n\n") },
      { role: "user", content: user },
    ],
    max_tokens: MAX_OUTPUT_TOKENS,
    stream: false,
    thinking: { type: thinking ? "enabled" : "disabled" },
    ...(thinking ? { reasoning_effort: req.effort === "high" ? "high" : "low" } : {}),
    ...(schema ? { response_format: { type: "json_object" } } : {}),
  };

  const usage = { ...NO_USAGE };
  // JSON mode can come back blank or off-shape; that's worth exactly one more try.
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      });
    } catch {
      return { value: null, usage, failure: new AiError("Couldn't reach DeepSeek. Check your internet connection and try again.", 503) };
    }
    const data = (await res.json().catch(() => ({}))) as DeepSeekResponse;
    if (!res.ok) return { value: null, usage, failure: deepseekHttpError(res.status, data.error?.message ?? "") };

    const hit = data.usage?.prompt_cache_hit_tokens ?? 0;
    usage.cacheRead += hit;
    usage.input += data.usage?.prompt_cache_miss_tokens ?? Math.max(0, (data.usage?.prompt_tokens ?? 0) - hit);
    usage.output += data.usage?.completion_tokens ?? 0;

    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") return { value: null, usage, failure: CUT_OFF };
    if (choice?.finish_reason === "content_filter") return { value: null, usage, failure: DECLINED };
    const content = (choice?.message?.content ?? "").trim();

    if (!schema) return { value: content, usage };
    try {
      return { value: schema.parse(JSON.parse(content)), usage };
    } catch {
      if (attempt >= 1) {
        return { value: null, usage, failure: new AiError("DeepSeek returned a response in the wrong format twice. Try again.", 502) };
      }
    }
  }
}

// ---- Anthropic (Claude) -------------------------------------------------------

function anthropicError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError) return new AiError("Anthropic rejected the API key. Check it in Settings.", 401, "auth");
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError(`Your Anthropic account can't use this model: ${err.message}`, 403, "auth");
  if (err instanceof Anthropic.RateLimitError) return new AiError("Anthropic is rate-limiting requests. Wait a minute and try again.", 429, "rate_limit");
  // Includes "credit balance is too low" — pass Anthropic's own wording through.
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Anthropic rejected the request: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach Anthropic. Check your internet connection.", 503);
  if (err instanceof Anthropic.APIError) return new AiError(`Anthropic API error ${err.status ?? ""}: ${err.message}`.trim(), 502);
  return new AiError((err as Error)?.message ?? "Unexpected AI error.");
}

async function anthropic<T>(key: string, model: string, req: AiRequest, schema?: z.ZodType<T>): Promise<Outcome<T | string>> {
  const client = new Anthropic({ apiKey: key });
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model,
    max_tokens: MAX_OUTPUT_TOKENS,
    output_config: { effort: req.effort },
    // If a safety classifier declines, Anthropic re-runs the request on the
    // model's default fallback inside the same call (no-op on models without one).
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system: req.system.map((text, i) => ({
      type: "text" as const,
      text,
      ...(i === req.system.length - 1 ? { cache_control: { type: "ephemeral" as const } } : {}),
    })),
    messages: [{ role: "user", content: req.user }],
  };

  let message: Anthropic.Beta.BetaMessage;
  let value: T | string | null;
  try {
    if (schema) {
      const parsed = await client.beta.messages.parse({ ...params, output_config: { ...params.output_config, format: betaZodOutputFormat(schema) } });
      message = parsed;
      value = parsed.parsed_output;
    } else {
      message = await client.beta.messages.create(params);
      value = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim();
    }
  } catch (err) {
    return { value: null, usage: NO_USAGE, failure: anthropicError(err) };
  }

  const usage: Usage = {
    input: message.usage.input_tokens,
    cacheRead: message.usage.cache_read_input_tokens ?? 0,
    cacheWrite: message.usage.cache_creation_input_tokens ?? 0,
    output: message.usage.output_tokens,
  };
  if (message.stop_reason === "refusal") return { value: null, usage, failure: DECLINED };
  if (message.stop_reason === "max_tokens") return { value: null, usage, failure: CUT_OFF };
  return { value, usage };
}

// ---- Public entry points ------------------------------------------------------

/**
 * One place for everything every request shares: picking the provider and key,
 * the budget guard, usage accounting, and turning failures into messages.
 */
async function run<T>(req: AiRequest, schema?: z.ZodType<T>): Promise<T | string> {
  const settings = await getSettings();
  const model = resolveModel(settings);
  const provider = MODELS[model].provider;
  const { key } = resolveKey(settings, provider);
  if (!key) throw new AiError(`Add a ${PROVIDERS[provider].label} API key in Settings to use AI features.`, 400, "no_key");
  assertWithinBudget(settings, model, req.user.length + req.system.reduce((n, s) => n + s.length, 0));

  const outcome = await (provider === "deepseek" ? deepseek(key, model, req, schema) : anthropic(key, model, req, schema));
  await recordUsage(req.task, model, outcome.usage);
  if (outcome.failure) throw outcome.failure;
  if (outcome.value === null || outcome.value === "") throw new AiError("The AI returned an empty response. Try again.", 502);
  return outcome.value;
}

export async function generateText(req: AiRequest): Promise<string> {
  return (await run(req)) as string;
}

export async function generateJson<S extends z.ZodType>(req: AiRequest, schema: S): Promise<z.infer<S>> {
  return (await run(req, schema)) as z.infer<S>;
}

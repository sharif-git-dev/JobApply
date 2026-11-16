import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { getSettings, saveSettings } from "../store";
import type { PublicProvider, Settings } from "../types";
import { DEFAULT_PROVIDER, PROVIDERS, PROVIDER_BY_ID, priceFor, type ModelPrice, type ProviderInfo } from "./providers";

export const MAX_OUTPUT_TOKENS = 16_000;

/** The user-facing failure for anything AI-related. `status` becomes the HTTP status. */
export class AiError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code: "not_ready" | "budget" | "auth" | "balance" | "rate_limit" | "refusal" | "unreachable" | "api" = "api",
  ) {
    super(message);
  }
}

// ---- Settings → which provider, key, model and address ------------------------

export interface Resolved {
  provider: ProviderInfo;
  key: string;
  keyFromEnv: boolean;
  model: string;
  baseUrl: string;
  price: ModelPrice | null;
}

export function resolve(settings: Settings, providerId = settings.aiProvider): Resolved {
  const provider = PROVIDER_BY_ID[providerId] ?? PROVIDER_BY_ID[DEFAULT_PROVIDER];
  const saved = settings.aiKeys[provider.id] ?? "";
  const env = provider.env ? (process.env[provider.env] ?? "") : "";
  const model = (settings.aiModels[provider.id] || provider.defaultModel).trim();
  const baseUrl = ((provider.baseUrlEditable && settings.aiBaseUrls[provider.id]) || provider.baseUrl).trim().replace(/\/+$/, "");
  return { provider, key: saved || env, keyFromEnv: !saved && Boolean(env), model, baseUrl, price: priceFor(provider, model) };
}

/** Why this provider can't be used yet, or "" if it can. */
function missing(r: Resolved): string {
  if (r.provider.needsKey && !r.key) return `Add a ${r.provider.label} API key in Settings to use AI features.`;
  if (!r.baseUrl) return `Enter the address of your ${r.provider.label} in Settings.`;
  if (!r.model) return `Choose a ${r.provider.label} model in Settings.`;
  return "";
}

export function publicProviders(settings: Settings): PublicProvider[] {
  return PROVIDERS.map((p) => {
    const r = resolve(settings, p.id);
    return {
      id: p.id,
      hasKey: !p.needsKey || Boolean(r.key),
      keyHint: r.key ? `…${r.key.slice(-4)}` : "",
      keyFromEnv: r.keyFromEnv,
      model: r.model,
      baseUrl: r.baseUrl,
      ready: !missing(r),
    };
  });
}

export async function aiAvailable(): Promise<boolean> {
  return !missing(resolve(await getSettings()));
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

function costOf(price: ModelPrice | null, u: Usage): number {
  if (!price) return 0;
  return (u.input * price.input + u.cacheWrite * price.input * 1.25 + u.cacheRead * price.cachedInput + u.output * price.output) / 1_000_000;
}

/**
 * Spend guard for providers that charge. Before every request we assume the
 * worst case (the prompt plus a full-length reply) and refuse if that could
 * push the running total over the user's cap, so the estimate can never cross it.
 */
function assertWithinBudget(settings: Settings, price: ModelPrice | null, promptChars: number) {
  if (!price) return;
  const worstCase = ((promptChars / 3) * price.input * 1.25 + MAX_OUTPUT_TOKENS * price.output) / 1_000_000;
  if (settings.spentUsd + worstCase > settings.budgetUsd) {
    throw new AiError(
      `This request could take AI spending past your $${settings.budgetUsd.toFixed(2)} cap (about $${settings.spentUsd.toFixed(2)} used so far), so it wasn't sent. ` +
        "Raise the cap or switch to a free provider in Settings — everything else keeps working without AI.",
      402,
      "budget",
    );
  }
}

async function recordUsage(task: string, r: Resolved, u: Usage) {
  if (!u.input && !u.cacheRead && !u.cacheWrite && !u.output) return;
  const costUsd = costOf(r.price, u);
  await saveSettings((s) => ({
    ...s,
    spentUsd: s.spentUsd + costUsd,
    usage: [
      ...s.usage,
      { at: new Date().toISOString(), task, model: r.model, inputTokens: u.input + u.cacheRead + u.cacheWrite, outputTokens: u.output, costUsd },
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

const jsonInstruction = (schema: z.ZodType) =>
  `Reply with a single JSON object and nothing else — no prose and no markdown fences. Include every property the schema lists, with exactly the type it gives (use "" or [] where there is nothing to put). It must conform to this JSON Schema:\n${JSON.stringify(z.toJSONSchema(schema))}`;

/** Models wrap JSON in fences, preambles, or leaked reasoning. Dig the object out and check its shape. */
function parseJson<T>(raw: string, schema: z.ZodType<T>): T | null {
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const candidates = [text, text.replace(/^```(?:json)?\s*|\s*```$/gi, ""), text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1)];
  for (const candidate of candidates) {
    try {
      const parsed = schema.safeParse(JSON.parse(candidate));
      if (parsed.success) return parsed.data;
    } catch {
      // try the next way of reading it
    }
  }
  return null;
}

const cleanText = (raw: string) => raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

function unreachable(r: Resolved): AiError {
  const local = r.provider.tier === "local";
  return new AiError(
    local
      ? `Couldn't reach ${r.provider.label} at ${r.baseUrl}. Start it, then try again.`
      : `Couldn't reach ${r.provider.label}. Check your internet connection and try again.`,
    503,
    "unreachable",
  );
}

/** Providers disagree on the error envelope: an object, a bare string, or (Gemini) an array holding one. */
function errorDetail(data: unknown): string {
  const body = (Array.isArray(data) ? data[0] : data) as { error?: { message?: string } | string; message?: string } | undefined;
  if (!body) return "";
  if (typeof body.error === "string") return body.error;
  return body.error?.message ?? body.message ?? "";
}

function httpError(r: Resolved, status: number, detail: string): AiError {
  const name = r.provider.label;
  const free = r.provider.tier === "free";
  // Some services answer a bad key with a plain 400.
  const badKey = status === 400 && /api.?key|unauthori[sz]ed|credential/i.test(detail);
  if (status === 401 || status === 403 || badKey) return new AiError(`${name} rejected the API key. Check it in Settings.`, 401, "auth");
  if (status === 402) return new AiError(`Your ${name} balance has run out. Top it up, or switch to a free provider in Settings.`, 402, "balance");
  if (status === 404) return new AiError(`${name} doesn't have a model called "${r.model}". Pick another in Settings.`, 400);
  if (status === 413) {
    return new AiError(`That request is too large for ${name}${free ? "'s free limits" : ""}. Try a model with higher limits, or shorten the job description.`, 400);
  }
  if (status === 429) {
    return new AiError(
      free
        ? `You've hit ${name}'s free limit for now. Wait a bit, or switch to another provider in Settings.`
        : `${name} is rate-limiting requests. Wait a minute and try again.`,
      429,
      "rate_limit",
    );
  }
  if (status >= 500) return new AiError(`${name} is busy or having trouble. Try again in a moment.`, 503);
  return new AiError(`${name} rejected the request: ${detail || `HTTP ${status}`}`, 400);
}

// ---- OpenAI-style chat completions (Gemini, Groq, OpenRouter, DeepSeek, LM Studio, custom) ----

interface ChatResponse {
  choices?: { finish_reason?: string; message?: { content?: string | null } }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
  };
  error?: { message?: string } | string;
}

/** The knobs each provider uses to keep reasoning short. Sent on the first try only. */
function reasoningParams(r: Resolved, effort: Effort): Record<string, unknown> {
  switch (r.provider.id) {
    case "deepseek":
      return effort === "low"
        ? { thinking: { type: "disabled" } }
        : { thinking: { type: "enabled" }, reasoning_effort: effort === "high" ? "high" : "low" };
    case "gemini":
      return { reasoning_effort: effort === "low" ? "minimal" : effort === "medium" ? "low" : "medium" };
    case "groq":
      return r.model.includes("gpt-oss") ? { reasoning_effort: effort === "high" ? "medium" : "low" } : {};
    default:
      return {};
  }
}

async function openAiStyle<T>(r: Resolved, req: AiRequest, schema?: z.ZodType<T>): Promise<Outcome<T | string>> {
  const messages = [
    { role: "system", content: req.system.join("\n\n") },
    // JSON mode guarantees valid JSON at best, never a shape — so the shape goes in the prompt and is checked on return.
    { role: "user", content: schema ? `${req.user}\n\n${jsonInstruction(schema)}` : req.user },
  ];
  const plain = { model: r.model, messages, stream: false };
  const full = {
    ...plain,
    [r.provider.maxTokensParam]: r.provider.id === "deepseek" ? MAX_OUTPUT_TOKENS : 8000,
    ...reasoningParams(r, req.effort),
    ...(schema ? { response_format: { type: "json_object" } } : {}),
  };
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (r.key) headers.Authorization = `Bearer ${r.key}`;

  const usage = { ...NO_USAGE };
  // Not every model accepts every option. If the full request is rejected as
  // malformed, fall back to the bare minimum every compatible server takes.
  let body: Record<string, unknown> = full;
  let offShape = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(`${r.baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(r.provider.tier === "local" ? 600_000 : 180_000),
      });
    } catch {
      return { value: null, usage, failure: unreachable(r) };
    }
    const data = (await res.json().catch(() => ({}))) as ChatResponse;
    if (!res.ok) {
      const detail = errorDetail(data);
      const failure = httpError(r, res.status, detail);
      if ((res.status === 400 || res.status === 422) && body === full && failure.code !== "auth") {
        body = plain;
        continue;
      }
      return { value: null, usage, failure };
    }

    const cached = data.usage?.prompt_cache_hit_tokens ?? data.usage?.prompt_tokens_details?.cached_tokens ?? 0;
    usage.cacheRead += cached;
    usage.input += data.usage?.prompt_cache_miss_tokens ?? Math.max(0, (data.usage?.prompt_tokens ?? 0) - cached);
    usage.output += data.usage?.completion_tokens ?? 0;

    const choice = data.choices?.[0];
    if (choice?.finish_reason === "length") return { value: null, usage, failure: CUT_OFF };
    if (choice?.finish_reason === "content_filter") return { value: null, usage, failure: DECLINED };
    const content = choice?.message?.content ?? "";

    if (!schema) return { value: cleanText(content), usage };
    const parsed = parseJson(content, schema);
    if (parsed !== null) return { value: parsed, usage };
    // A blank or off-shape reply is worth exactly one more try.
    if (++offShape > 1) {
      return { value: null, usage, failure: new AiError(`${r.provider.label} (${r.model}) didn't return the structure asked for. Try again, or pick a stronger model.`, 502) };
    }
  }
}

// ---- Ollama (its own API, so the context window and output schema can be set) ----

interface OllamaResponse {
  message?: { content?: string };
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
  error?: string;
}

async function ollama<T>(r: Resolved, req: AiRequest, schema?: z.ZodType<T>): Promise<Outcome<T | string>> {
  const body = {
    model: r.model,
    stream: false,
    messages: [
      { role: "system", content: req.system.join("\n\n") },
      { role: "user", content: schema ? `${req.user}\n\n${jsonInstruction(schema)}` : req.user },
    ],
    // Ollama's default context is too small for a resume plus a job posting and would silently drop the start.
    options: { num_ctx: 16_384 },
    ...(schema ? { format: z.toJSONSchema(schema) } : {}),
  };
  const usage = { ...NO_USAGE };
  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await fetch(`${r.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(900_000),
      });
    } catch {
      return { value: null, usage, failure: unreachable(r) };
    }
    const data = (await res.json().catch(() => ({}))) as OllamaResponse;
    if (!res.ok) {
      const failure =
        res.status === 404
          ? new AiError(`Ollama doesn't have a model called "${r.model}". Pick an installed one in Settings, or run "ollama pull ${r.model}".`, 400)
          : new AiError(`Ollama couldn't run ${r.model}: ${data.error ?? `HTTP ${res.status}`}`, 502);
      return { value: null, usage, failure };
    }
    usage.input += data.prompt_eval_count ?? 0;
    usage.output += data.eval_count ?? 0;
    if (data.done_reason === "length") return { value: null, usage, failure: CUT_OFF };
    const content = data.message?.content ?? "";
    if (!schema) return { value: cleanText(content), usage };
    const parsed = parseJson(content, schema);
    if (parsed !== null) return { value: parsed, usage };
    if (attempt >= 1) {
      return { value: null, usage, failure: new AiError(`${r.model} didn't return the structure asked for. Try again, or pick a larger model.`, 502) };
    }
  }
}

// ---- Anthropic (Claude) -------------------------------------------------------

function anthropicError(err: unknown): AiError {
  if (err instanceof Anthropic.AuthenticationError) return new AiError("Anthropic rejected the API key. Check it in Settings.", 401, "auth");
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError(`Your Anthropic account can't use this model: ${err.message}`, 403, "auth");
  if (err instanceof Anthropic.NotFoundError) return new AiError("Anthropic doesn't have that model. Pick another in Settings.", 400);
  if (err instanceof Anthropic.RateLimitError) return new AiError("Anthropic is rate-limiting requests. Wait a minute and try again.", 429, "rate_limit");
  // Includes "credit balance is too low" — pass Anthropic's own wording through.
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Anthropic rejected the request: ${err.message}`, 400);
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach Anthropic. Check your internet connection.", 503, "unreachable");
  if (err instanceof Anthropic.APIError) return new AiError(`Anthropic API error ${err.status ?? ""}: ${err.message}`.trim(), 502);
  return new AiError((err as Error)?.message ?? "Unexpected AI error.");
}

async function anthropic<T>(r: Resolved, req: AiRequest, schema?: z.ZodType<T>): Promise<Outcome<T | string>> {
  const client = new Anthropic({ apiKey: r.key });
  const params: Anthropic.Beta.MessageCreateParamsNonStreaming = {
    model: r.model,
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
async function run<T>(req: AiRequest, schema?: z.ZodType<T>, providerId?: string): Promise<T | string> {
  const settings = await getSettings();
  const r = resolve(settings, providerId);
  const problem = missing(r);
  if (problem) throw new AiError(problem, 400, "not_ready");
  assertWithinBudget(settings, r.price, req.user.length + req.system.reduce((n, s) => n + s.length, 0));

  const call = r.provider.kind === "anthropic" ? anthropic : r.provider.kind === "ollama" ? ollama : openAiStyle;
  const outcome = await call(r, req, schema);
  await recordUsage(req.task, r, outcome.usage);
  if (outcome.failure) throw outcome.failure;
  if (outcome.value === null || outcome.value === "") throw new AiError("The AI returned an empty response. Try again.", 502);
  return outcome.value;
}

export async function generateText(req: AiRequest, providerId?: string): Promise<string> {
  return (await run(req, undefined, providerId)) as string;
}

export async function generateJson<S extends z.ZodType>(req: AiRequest, schema: S): Promise<z.infer<S>> {
  return (await run(req, schema)) as z.infer<S>;
}

/** Ask a provider which models it offers right now. Doubles as a key and connection check. */
export async function listModels(providerId: string): Promise<string[]> {
  const r = resolve(await getSettings(), providerId);
  if (r.provider.kind === "anthropic") return r.provider.models.map((m) => m.id);
  if (r.provider.needsKey && !r.key) throw new AiError(`Add a ${r.provider.label} API key first.`, 400, "not_ready");
  if (!r.baseUrl) throw new AiError(`Enter the address of your ${r.provider.label} first.`, 400, "not_ready");

  let res: Response;
  try {
    res = await fetch(r.provider.kind === "ollama" ? `${r.baseUrl}/api/tags` : `${r.baseUrl}/models`, {
      headers: r.key ? { Authorization: `Bearer ${r.key}` } : {},
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw unreachable(r);
  }
  const data = (await res.json().catch(() => ({}))) as {
    data?: { id?: string; pricing?: { prompt?: string; completion?: string } }[];
    models?: { name?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) throw httpError(r, res.status, errorDetail(data));

  if (r.provider.kind === "ollama") return (data.models ?? []).map((m) => m.name ?? "").filter(Boolean);
  let rows = data.data ?? [];
  // OpenRouter lists hundreds of paid models; here it's offered as a free provider.
  if (r.provider.id === "openrouter") rows = rows.filter((m) => Number(m.pricing?.prompt) === 0 && Number(m.pricing?.completion) === 0);
  return rows
    .map((m) => (m.id ?? "").replace(/^models\//, ""))
    .filter((id) => id && !/embed|whisper|tts|image|imagen|veo|lyria|guard|moderation|rerank/i.test(id))
    .sort();
}

/**
 * Every AI service JobApply can write with. Shared by the server and the
 * Settings page — plain data, no SDK imports.
 *
 * Facts here (endpoints, model ids, free allowances) were checked against each
 * provider's own documentation in November 2026. Free tiers change often, which
 * is why Settings can also load the current model list straight from a provider.
 */

export type Tier = "free" | "local" | "paid" | "custom";

export const TIER_LABEL: Record<Tier, string> = {
  free: "Free",
  local: "Free · runs on your computer",
  paid: "Paid",
  custom: "Bring your own",
};

/** USD per million tokens. */
export interface ModelPrice {
  input: number;
  cachedInput: number;
  output: number;
}

export interface ProviderInfo {
  id: string;
  label: string;
  tier: Tier;
  /** How we talk to it: OpenAI-style chat completions, Ollama's own API, or the Anthropic SDK. */
  kind: "openai" | "ollama" | "anthropic";
  /** One line: what it is. */
  summary: string;
  /** One line: what it costs or how much you get for free. */
  cost: string;
  /** Something worth knowing before sending a resume through it. */
  caveat?: string;
  baseUrl: string;
  /** Local and custom providers let the address be changed. */
  baseUrlEditable?: boolean;
  needsKey: boolean;
  /** Environment variable that can supply the key instead of Settings. */
  env?: string;
  keysUrl?: string;
  keysSite?: string;
  keyPlaceholder?: string;
  /** Empty means "pick one from the list the provider returns". */
  defaultModel: string;
  /** Suggestions shown before the live list is loaded. Prices only where the provider charges. */
  models: { id: string; note?: string; price?: ModelPrice }[];
  maxTokensParam: "max_tokens" | "max_completion_tokens";
}

export const PROVIDERS: ProviderInfo[] = [
  // ---- Free hosted ------------------------------------------------------------
  {
    id: "gemini",
    label: "Google Gemini",
    tier: "free",
    kind: "openai",
    summary: "Google's models through AI Studio. The strongest writing of the free options.",
    cost: "Free tier with daily limits per model. Your current limits are shown in AI Studio.",
    caveat: "On the free tier Google uses what you send, including your resume, to improve its products.",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    needsKey: true,
    env: "GEMINI_API_KEY",
    keysUrl: "https://aistudio.google.com/apikey",
    keysSite: "aistudio.google.com",
    keyPlaceholder: "AIza…",
    defaultModel: "gemini-4-hydrogen",
    models: [
      { id: "gemini-4-hydrogen", note: "newest free model" },
      { id: "gemini-3.8-flash" },
      { id: "gemini-3.5-flash-lite", note: "lightest, highest limits" },
    ],
    maxTokensParam: "max_tokens",
  },
  {
    id: "groq",
    label: "Groq",
    tier: "free",
    kind: "openai",
    summary: "Open models (GPT-OSS, Llama) served very fast.",
    cost: "Free plan with per-minute and per-day limits. Your limits are shown in the Groq console.",
    caveat: "The free plan's tokens-per-minute limit is small, so a long resume plus a long posting can be turned away. Wait a minute or use a lighter model.",
    baseUrl: "https://api.groq.com/openai/v1",
    needsKey: true,
    env: "GROQ_API_KEY",
    keysUrl: "https://console.groq.com/keys",
    keysSite: "console.groq.com",
    keyPlaceholder: "gsk_…",
    defaultModel: "openai/gpt-oss-120b",
    models: [
      { id: "openai/gpt-oss-120b", note: "best quality" },
      { id: "llama-3.3-70b-versatile" },
      { id: "openai/gpt-oss-20b", note: "lighter" },
      { id: "llama-3.1-8b-instant", note: "lightest" },
    ],
    maxTokensParam: "max_completion_tokens",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    tier: "free",
    kind: "openai",
    summary: "One key for many providers' models, including a rotating set of free ones.",
    cost: "Free models: 50 requests a day and 20 a minute (1,000 a day once you have ever bought $10 of credit).",
    caveat: "Free models come and go and vary in quality. The \"openrouter/free\" choice picks an available one for you.",
    baseUrl: "https://openrouter.ai/api/v1",
    needsKey: true,
    env: "OPENROUTER_API_KEY",
    keysUrl: "https://openrouter.ai/settings/keys",
    keysSite: "openrouter.ai",
    keyPlaceholder: "sk-or-…",
    defaultModel: "openrouter/free",
    models: [{ id: "openrouter/free", note: "automatic: any available free model" }, { id: "google/gemma-4-31b-it:free" }],
    maxTokensParam: "max_tokens",
  },

  // ---- On this computer -------------------------------------------------------
  {
    id: "ollama",
    label: "Ollama",
    tier: "local",
    kind: "ollama",
    summary: "Models you have downloaded with Ollama, running on your own machine.",
    cost: "Free and unlimited. Speed and quality depend on your hardware and the model.",
    caveat: "Nothing leaves your computer. Ollama has to be running.",
    baseUrl: "http://localhost:11434",
    baseUrlEditable: true,
    needsKey: false,
    defaultModel: "",
    models: [],
    maxTokensParam: "max_tokens",
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    tier: "local",
    kind: "openai",
    summary: "Models loaded in LM Studio, running on your own machine.",
    cost: "Free and unlimited. Speed and quality depend on your hardware and the model.",
    caveat: "Nothing leaves your computer. Start LM Studio's local server first.",
    baseUrl: "http://localhost:1234/v1",
    baseUrlEditable: true,
    needsKey: false,
    defaultModel: "",
    models: [],
    maxTokensParam: "max_tokens",
  },

  // ---- Paid -------------------------------------------------------------------
  {
    id: "deepseek",
    label: "DeepSeek",
    tier: "paid",
    kind: "openai",
    summary: "Low-cost paid models with strong writing.",
    cost: "Prepaid. Roughly 1–2¢ per tailored application on Flash, 4–6¢ on V4 Pro.",
    baseUrl: "https://api.deepseek.com",
    needsKey: true,
    env: "DEEPSEEK_API_KEY",
    keysUrl: "https://platform.deepseek.com/api_keys",
    keysSite: "platform.deepseek.com",
    keyPlaceholder: "sk-…",
    defaultModel: "deepseek-flash",
    // Peak-hour rates (off-peak is half), so estimates err high.
    models: [
      { id: "deepseek-flash", note: "fast and cheap", price: { input: 0.3, cachedInput: 0.006, output: 1.2 } },
      { id: "deepseek-v4-pro", note: "stronger writing", price: { input: 1.32, cachedInput: 0.044, output: 3.96 } },
    ],
    maxTokensParam: "max_tokens",
  },
  {
    id: "anthropic",
    label: "Anthropic (Claude)",
    tier: "paid",
    kind: "anthropic",
    summary: "Claude models. The best writing quality available here.",
    cost: "Prepaid, $5 minimum. Under 1¢ per tailored application on Haiku, 15–25¢ on Opus.",
    baseUrl: "https://api.anthropic.com",
    needsKey: true,
    env: "ANTHROPIC_API_KEY",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keysSite: "console.anthropic.com",
    keyPlaceholder: "sk-ant-…",
    defaultModel: "claude-haiku-5-5",
    models: [
      { id: "claude-haiku-5-5", note: "cheapest", price: { input: 0.1, cachedInput: 0.01, output: 0.5 } },
      { id: "claude-sonnet-5-5", note: "balanced", price: { input: 2, cachedInput: 0.1, output: 10 } },
      { id: "claude-opus-5-5", note: "best writing", price: { input: 4, cachedInput: 0.2, output: 20 } },
    ],
    maxTokensParam: "max_tokens",
  },

  // ---- Anything else ----------------------------------------------------------
  {
    id: "custom",
    label: "Custom endpoint",
    tier: "custom",
    kind: "openai",
    summary: "Any other service or server that speaks the OpenAI chat format: Mistral, Together, Cerebras, a model on your network.",
    cost: "Whatever that service charges. JobApply can't estimate its cost, so the spending cap doesn't apply.",
    baseUrl: "",
    baseUrlEditable: true,
    needsKey: false,
    defaultModel: "",
    models: [],
    maxTokensParam: "max_tokens",
  },
];

export const PROVIDER_BY_ID: Record<string, ProviderInfo> = Object.fromEntries(PROVIDERS.map((p) => [p.id, p]));

/** Chosen by the user. */
export const DEFAULT_PROVIDER = "deepseek";

/**
 * What a model costs, if the provider charges and we know its rates. An
 * unlisted model on a paid provider is assumed to cost as much as that
 * provider's dearest listed one, so the spending cap stays conservative.
 */
export function priceFor(provider: ProviderInfo, model: string): ModelPrice | null {
  const listed = provider.models.find((m) => m.id === model)?.price;
  if (listed) return listed;
  if (provider.tier !== "paid") return null;
  return provider.models.reduce<ModelPrice | null>(
    (max, m) => (m.price && (!max || m.price.output > max.output) ? m.price : max),
    null,
  );
}

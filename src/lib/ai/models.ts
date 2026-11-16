/** Shared by the server and the Settings page — plain data, no SDK imports. */

export type Provider = "deepseek" | "anthropic";

export const PROVIDERS: Record<Provider, { label: string; env: string; keysUrl: string; keysSite: string; placeholder: string }> = {
  deepseek: {
    label: "DeepSeek",
    env: "DEEPSEEK_API_KEY",
    keysUrl: "https://platform.deepseek.com/api_keys",
    keysSite: "platform.deepseek.com",
    placeholder: "sk-…",
  },
  anthropic: {
    label: "Anthropic",
    env: "ANTHROPIC_API_KEY",
    keysUrl: "https://console.anthropic.com/settings/keys",
    keysSite: "console.anthropic.com",
    placeholder: "sk-ant-…",
  },
};

export interface ModelInfo {
  provider: Provider;
  label: string;
  /** Shown in the model picker: what it's like and roughly what one tailored application costs. */
  blurb: string;
  /** USD per million tokens. DeepSeek figures are its peak rates (off-peak is half), so estimates err high. */
  input: number;
  cachedInput: number;
  output: number;
}

export const MODELS: Record<string, ModelInfo> = {
  "deepseek-flash": {
    provider: "deepseek",
    label: "DeepSeek Flash",
    blurb: "fast and cheap, roughly 1–2¢ per tailored application",
    input: 0.3,
    cachedInput: 0.006,
    output: 1.2,
  },
  "deepseek-v4-pro": {
    provider: "deepseek",
    label: "DeepSeek V4 Pro",
    blurb: "stronger writing, roughly 4–6¢ per tailored application",
    input: 1.32,
    cachedInput: 0.044,
    output: 3.96,
  },
  "claude-haiku-5-5": {
    provider: "anthropic",
    label: "Claude Haiku 5.5",
    blurb: "cheapest, under 1¢ per tailored application",
    input: 0.1,
    cachedInput: 0.01,
    output: 0.5,
  },
  "claude-sonnet-5-5": {
    provider: "anthropic",
    label: "Claude Sonnet 5.5",
    blurb: "balanced, roughly 8–12¢ per tailored application",
    input: 2,
    cachedInput: 0.1,
    output: 10,
  },
  "claude-opus-5-5": {
    provider: "anthropic",
    label: "Claude Opus 5.5",
    blurb: "best writing, roughly 15–25¢ per tailored application",
    input: 4,
    cachedInput: 0.2,
    output: 20,
  },
};

/** Chosen by the user. */
export const DEFAULT_MODEL = "deepseek-flash";

"use client";

import { Check, ChevronDown, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { PROVIDERS, TIER_LABEL, type ProviderInfo, type Tier } from "@/lib/ai/providers";
import { api } from "@/lib/client";
import type { PublicProvider, PublicSettings } from "@/lib/types";
import { Button, Chip, Field, Input, Notice, cx } from "../ui";

const GROUPS: { tier: Tier; blurb: string }[] = [
  { tier: "free", blurb: "Hosted services with a free allowance. Sign up, paste a key, done." },
  { tier: "local", blurb: "Models running on this machine. Unlimited and private; slower than hosted ones." },
  { tier: "paid", blurb: "Pay for what you use. Counted against your spending cap." },
  { tier: "custom", blurb: "Anything else that speaks the same protocol." },
];

interface Props {
  settings: PublicSettings;
  /** Send a settings patch; resolves true on success. */
  save: (tag: string, patch: Record<string, unknown>, message?: string) => Promise<boolean>;
  saving: string;
  onSettings: (next: PublicSettings) => void;
}

function ProviderRow({ info, state, active, save, saving, onSettings }: { info: ProviderInfo; state: PublicProvider; active: boolean } & Omit<Props, "settings">) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [model, setModel] = useState<string | null>(null);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [models, setModels] = useState<string[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const tag = `ai:${info.id}`;
  const currentModel = model ?? state.model;
  const currentUrl = baseUrl ?? state.baseUrl;
  const dirty = Boolean(key) || model !== null || baseUrl !== null;
  const suggestions = [...new Set([...info.models.map((m) => m.id), ...(models ?? [])])];

  /** Save whatever has been typed. Returns false if the save failed. */
  async function commit(extra: Record<string, unknown> = {}, message = "Saved") {
    const patch: Record<string, unknown> = { provider: info.id };
    if (key) patch.key = key;
    if (model !== null) patch.model = model;
    if (baseUrl !== null) patch.baseUrl = baseUrl;
    const ok = await save(tag, { ai: patch, ...extra }, message);
    if (ok) {
      setKey("");
      setModel(null);
      setBaseUrl(null);
    }
    return ok;
  }

  async function loadModels() {
    setLoading(true);
    setResult(null);
    try {
      if (dirty && !(await commit({}, "Saved"))) return;
      const { models: found } = await api<{ models: string[] }>(`/api/ai/models?provider=${info.id}`);
      setModels(found);
      if (!found.length) {
        setResult({ ok: false, text: info.tier === "local" ? `${info.label} is running but has no models yet. Download one first.` : "No models were returned." });
      } else if (!state.model && model === null) {
        // Nothing chosen yet: start with the first one so the provider is usable straight away.
        setModel(found[0]);
      }
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      if (dirty && !(await commit())) return;
      const { reply, settings } = await api<{ reply: string; settings: PublicSettings }>("/api/ai/test", { json: { provider: info.id } });
      onSettings(settings);
      setResult({ ok: true, text: `It works. The model replied: “${reply}”` });
    } catch (err) {
      setResult({ ok: false, text: (err as Error).message });
    } finally {
      setTesting(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    // Local servers need no key, so show what's installed as soon as the panel opens.
    if (next && !info.needsKey && info.tier === "local" && models === null) void loadModels();
  }

  return (
    <li className={cx("rounded-lg border", active ? "border-accent/60 bg-accent-soft/40" : "border-line")}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold">{info.label}</h4>
            {active && state.ready && (
              <Chip tone="match">
                <Check className="mr-1 size-3" aria-hidden />
                In use
              </Chip>
            )}
            {!active && state.ready && <Chip>Ready</Chip>}
            {active && !state.ready && <Chip tone="gap">Selected, not set up</Chip>}
          </div>
          <p className="mt-1 text-sm">{info.summary}</p>
          <p className="mt-1 text-sm text-muted">{info.cost}</p>
          {info.caveat && <p className="mt-1 text-sm text-muted">{info.caveat}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state.ready && !active && (
            <Button size="sm" variant="primary" loading={saving === tag} onClick={() => void save(tag, { aiProvider: info.id }, `Now using ${info.label}`)}>
              Use this
            </Button>
          )}
          <Button size="sm" aria-expanded={open} onClick={toggle} icon={<ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />}>
            {state.ready ? "Edit" : "Set up"}
          </Button>
        </div>
      </div>

      {open && (
        <div className="flex flex-col gap-4 border-t border-line p-4">
          {info.needsKey &&
            (state.hasKey && !key ? (
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span>
                  Key saved <span className="font-mono">{state.keyHint}</span>
                  {state.keyFromEnv && ` (from the ${info.env} environment variable)`}
                </span>
                {!state.keyFromEnv && (
                  <Button size="sm" variant="danger" loading={saving === tag} onClick={() => void save(tag, { ai: { provider: info.id, key: "" } }, "Key removed")}>
                    Remove key
                  </Button>
                )}
              </div>
            ) : (
              <Field
                label={`${info.label} API key`}
                hint={
                  info.keysUrl && (
                    <>
                      Get one at{" "}
                      <a href={info.keysUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                        {info.keysSite}
                        <ExternalLink className="size-3" aria-hidden />
                      </a>
                      . It is stored only in the data folder on this computer.
                    </>
                  )
                }
              >
                <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={info.keyPlaceholder} />
              </Field>
            ))}

          {info.baseUrlEditable && (
            <Field
              label="Address"
              hint={info.id === "custom" ? "The base address ending before /chat/completions, for example https://api.mistral.ai/v1" : "Change this only if you moved it from the default."}
            >
              <Input value={currentUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder={info.baseUrl || "https://…/v1"} spellCheck={false} />
            </Field>
          )}

          {info.id === "custom" && (
            <Field label="API key (if it needs one)">
              <Input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder={state.keyHint ? `Saved ${state.keyHint}` : ""} />
            </Field>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <Field label="Model" className="flex-1" hint={models ? `${models.length} available right now. Pick one or type its name.` : "Type a model name, or load the current list from the provider."}>
              <Input list={`models-${info.id}`} value={currentModel} onChange={(e) => setModel(e.target.value)} placeholder={info.defaultModel || "Choose a model"} spellCheck={false} />
              <datalist id={`models-${info.id}`}>
                {suggestions.map((id) => (
                  <option key={id} value={id}>
                    {info.models.find((m) => m.id === id)?.note}
                  </option>
                ))}
              </datalist>
            </Field>
            <Button loading={loading} onClick={() => void loadModels()} icon={<RefreshCw className="size-4" aria-hidden />} className="sm:mb-[26px]">
              Load models
            </Button>
          </div>

          {result && <Notice tone={result.ok ? "success" : "danger"}>{result.text}</Notice>}

          <div className="flex flex-wrap gap-2">
            <Button variant="primary" loading={saving === tag} disabled={!dirty} onClick={() => void commit()}>
              Save
            </Button>
            <Button loading={testing} onClick={() => void test()}>
              Test it
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}

export function AiProviders({ settings, save, saving, onSettings }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map(({ tier, blurb }) => (
        <div key={tier}>
          <h3 className="text-sm font-semibold">{TIER_LABEL[tier]}</h3>
          <p className="mb-3 text-sm text-muted">{blurb}</p>
          <ul className="flex flex-col gap-2">
            {PROVIDERS.filter((p) => p.tier === tier).map((info) => {
              const state = settings.providers.find((p) => p.id === info.id);
              if (!state) return null;
              return (
                <ProviderRow key={info.id} info={info} state={state} active={settings.aiProvider === info.id} save={save} saving={saving} onSettings={onSettings} />
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

"use client";

import { ChevronDown, ExternalLink } from "lucide-react";
import { useState } from "react";
import { SOURCES, SOURCE_TIER_LABEL, type SourceInfo, type SourceTier } from "@/lib/jobs/catalog";
import type { PublicSettings, PublicSource } from "@/lib/types";
import { Button, Chip, Field, Input, Select, cx } from "../ui";

const GROUPS: { tier: SourceTier; blurb: string }[] = [
  { tier: "free", blurb: "Public feeds. On by default; switch off any you don't want." },
  { tier: "free-key", blurb: "Free, but each needs a key from its own site. They add local, government and non-remote jobs." },
  { tier: "freemium", blurb: "A monthly free allowance with paid plans above it." },
  { tier: "premium", blurb: "Listed so you know where they stand. None of these are connected." },
];

interface Props {
  settings: PublicSettings;
  save: (tag: string, patch: Record<string, unknown>, message?: string) => Promise<boolean>;
  saving: string;
}

function Switch({ on, label, disabled, onChange }: { on: boolean; label: string; disabled?: boolean; onChange: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={cx("relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-40", on ? "bg-accent" : "bg-line")}
    >
      <span className={cx("absolute top-0.5 size-5 rounded-full bg-surface shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

function SourceRow({ info, state, save, saving }: { info: SourceInfo; state?: PublicSource } & Omit<Props, "settings">) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const tag = `source:${info.id}`;
  const fields = info.fields ?? [];
  const needsSetup = info.integrated && fields.length > 0;
  const dirty = Object.keys(draft).length > 0;

  async function connect() {
    if (await save(tag, { source: { id: info.id, values: draft, enabled: true } }, `${info.name} saved`)) setDraft({});
  }

  return (
    <li className="rounded-lg border border-line">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2 p-4">
        <div className="min-w-0 flex-1 basis-64">
          <div className="flex flex-wrap items-center gap-2">
            <a href={info.site} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold hover:text-accent">
              {info.name}
              <ExternalLink className="size-3 text-muted" aria-hidden />
            </a>
            {!info.integrated && <Chip>Not connected</Chip>}
            {needsSetup && state?.configured && <Chip tone="match">Connected</Chip>}
            {needsSetup && !state?.configured && <Chip tone="gap">Needs a key</Chip>}
          </div>
          <p className="mt-1 text-sm">{info.coverage}</p>
          <p className="mt-1 text-sm text-muted">{info.cost}</p>
          {info.note && <p className="mt-1 text-sm text-muted">{info.note}</p>}
        </div>
        {info.integrated && state && (
          <div className="flex shrink-0 items-center gap-3">
            {needsSetup && (
              <Button size="sm" aria-expanded={open} onClick={() => setOpen(!open)} icon={<ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />}>
                {state.configured ? "Edit" : "Set up"}
              </Button>
            )}
            <Switch
              on={state.enabled && state.configured}
              label={`Search ${info.name}`}
              disabled={!state.configured || saving === tag}
              onChange={(enabled) => void save(tag, { source: { id: info.id, enabled } }, enabled ? `${info.name} on` : `${info.name} off`)}
            />
          </div>
        )}
      </div>

      {open && needsSetup && state && (
        <form
          className="flex flex-col gap-3 border-t border-line p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void connect();
          }}
        >
          {info.signupUrl && (
            <p className="text-sm">
              <a href={info.signupUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
                Get a {info.tier === "freemium" ? "" : "free "}key from {info.name}
                <ExternalLink className="size-3" aria-hidden />
              </a>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            {fields.map((f) => {
              const saved = f.secret ? "" : (state.values[f.name] ?? "");
              const value = draft[f.name] ?? saved;
              const set = (v: string) => setDraft({ ...draft, [f.name]: v });
              return (
                <Field key={f.name} label={f.label}>
                  {f.options ? (
                    <Select value={value || f.defaultValue} onChange={(e) => set(e.target.value)}>
                      {f.options.map((o) => (
                        <option key={o} value={o}>
                          {o.toUpperCase()}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <Input
                      type={f.secret ? "password" : "text"}
                      autoComplete="off"
                      required={!(f.secret && state.secretsSet[f.name])}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      placeholder={f.secret && state.secretsSet[f.name] ? "Saved — type to replace" : f.placeholder}
                    />
                  )}
                </Field>
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="primary" loading={saving === tag} disabled={!dirty}>
              {state.configured ? "Save" : "Connect"}
            </Button>
            {state.configured && (
              <Button variant="danger" onClick={() => void save(tag, { source: { id: info.id, clear: true } }, `${info.name} disconnected`)}>
                Disconnect
              </Button>
            )}
          </div>
        </form>
      )}
    </li>
  );
}

export function JobSources({ settings, save, saving }: Props) {
  return (
    <div className="flex flex-col gap-6">
      {GROUPS.map(({ tier, blurb }) => (
        <div key={tier}>
          <h3 className="text-sm font-semibold">{SOURCE_TIER_LABEL[tier]}</h3>
          <p className="mb-3 text-sm text-muted">{blurb}</p>
          <ul className="flex flex-col gap-2">
            {SOURCES.filter((s) => s.tier === tier).map((info) => (
              <SourceRow key={info.id} info={info} state={settings.sources.find((s) => s.id === info.id)} save={save} saving={saving} />
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

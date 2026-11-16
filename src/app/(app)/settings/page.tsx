"use client";

import { ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Spinner } from "@/components/ui";
import { api, usd, useData } from "@/lib/client";
import type { PublicSettings, WatchlistEntry } from "@/lib/types";

const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5 — best writing, roughly 15–25¢ per tailored application" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5 — balanced, roughly 8–12¢ per tailored application" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5 — cheapest, under 1¢ per tailored application" },
];

function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Card className="p-5 sm:p-6">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mt-1 max-w-prose text-sm text-muted">{hint}</p>}
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

const ExtLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <a href={href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
    {children}
    <ExternalLink className="size-3" aria-hidden />
  </a>
);

export default function SettingsPage() {
  const { data, error, loading, setData } = useData<PublicSettings>("/api/settings");
  const toast = useToast();
  const [apiKey, setApiKey] = useState("");
  const [budget, setBudget] = useState<string | null>(null);
  const [adzuna, setAdzuna] = useState<{ id: string; key: string; country: string } | null>(null);
  const [company, setCompany] = useState<WatchlistEntry>({ ats: "greenhouse", slug: "" });
  const [saving, setSaving] = useState("");

  if (loading) return <Spinner />;
  if (error || !data) return <Notice tone="danger">{error || "Couldn't load settings."}</Notice>;
  const s = data;

  async function save(tag: string, patch: Record<string, unknown>, message = "Saved") {
    setSaving(tag);
    try {
      setData(await api<PublicSettings>("/api/settings", { method: "PUT", json: patch }));
      toast(message);
      return true;
    } catch (err) {
      toast((err as Error).message, "danger");
      return false;
    } finally {
      setSaving("");
    }
  }

  const used = s.budgetUsd > 0 ? Math.min(100, (s.spentUsd / s.budgetUsd) * 100) : 100;
  const az = adzuna ?? { id: s.adzunaAppId, key: "", country: s.adzunaCountry };

  return (
    <>
      <PageHeader title="Settings" lede="JobApply works without any accounts or keys. These unlock better writing and more job sources." />

      <div className="flex flex-col gap-4">
        <Section
          title="AI writing"
          hint={
            <>
              Tailored cover letters, resume rewrites, fit analysis and application answers use Claude through your own Anthropic account.
              You pay Anthropic directly for what you use — create a key at{" "}
              <ExtLink href="https://console.anthropic.com/settings/keys">console.anthropic.com</ExtLink>. Buy the minimum $5 of credit and
              leave auto-reload off, and it can never cost more than that.
            </>
          }
        >
          {s.hasApiKey ? (
            <Notice tone="success" className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Key connected <span className="font-mono">{s.apiKeyHint}</span>
                {s.apiKeyFromEnv && " (from the ANTHROPIC_API_KEY environment variable)"}
              </span>
              {!s.apiKeyFromEnv && (
                <Button size="sm" variant="danger" loading={saving === "key"} onClick={() => void save("key", { anthropicApiKey: "" }, "Key removed")}>
                  Remove
                </Button>
              )}
            </Notice>
          ) : (
            <form
              className="flex flex-col gap-2 sm:flex-row sm:items-end"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await save("key", { anthropicApiKey: apiKey }, "Key saved")) setApiKey("");
              }}
            >
              <Field label="Anthropic API key" hint="Stored only in the data folder on this computer." className="flex-1">
                <Input type="password" required autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="sk-ant-…" />
              </Field>
              <Button type="submit" variant="primary" loading={saving === "key"} className="sm:mb-[26px]">
                Save key
              </Button>
            </form>
          )}

          <Field label="Model">
            <Select value={s.model} onChange={(e) => void save("model", { model: e.target.value }, "Model updated")}>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </Select>
          </Field>

          <div>
            <div className="mb-1.5 flex items-baseline justify-between text-sm">
              <span className="font-medium">Spending cap</span>
              <span className="tabular-nums text-muted">
                {usd(s.spentUsd)} of {usd(s.budgetUsd)} used
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100} aria-label="AI budget used">
              <div className={used >= 90 ? "h-full bg-danger" : "h-full bg-accent"} style={{ width: `${used}%` }} />
            </div>
            <p className="mt-2 text-xs text-muted">
              JobApply estimates the cost of every AI request and refuses any that could take the total past your cap. It&apos;s an estimate
              from token counts — your Anthropic console has the exact figure.
            </p>
            <form
              className="mt-3 flex flex-wrap items-end gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                const value = Number(budget);
                if (!Number.isFinite(value) || value < 0) return toast("Enter a dollar amount.", "danger");
                if (await save("budget", { budgetUsd: value }, "Cap updated")) setBudget(null);
              }}
            >
              <Field label="Cap (USD)">
                <Input inputMode="decimal" className="w-28" value={budget ?? String(s.budgetUsd)} onChange={(e) => setBudget(e.target.value)} />
              </Field>
              <Button type="submit" loading={saving === "budget"} disabled={budget === null}>
                Update cap
              </Button>
              <Button
                variant="ghost"
                loading={saving === "reset"}
                onClick={() => window.confirm("Reset the spend counter to $0? Do this after you top up your Anthropic credit.") && void save("reset", { resetSpend: true }, "Counter reset")}
              >
                Reset counter
              </Button>
            </form>
          </div>

          {s.usage.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">Recent AI requests</summary>
              <table className="mt-2 w-full text-left text-xs">
                <thead className="text-muted">
                  <tr>
                    <th className="py-1 font-medium">When</th>
                    <th className="py-1 font-medium">What</th>
                    <th className="py-1 font-medium">Model</th>
                    <th className="py-1 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {s.usage.map((u) => (
                    <tr key={u.at} className="border-t border-line">
                      <td className="py-1.5">{new Date(u.at).toLocaleString()}</td>
                      <td className="py-1.5">{u.task}</td>
                      <td className="py-1.5">{u.model.replace("claude-", "")}</td>
                      <td className="py-1.5 text-right tabular-nums">${u.costUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          )}
        </Section>

        <Section
          title="Company watchlist"
          hint="Follow specific companies' career pages. Their open roles are included in every search. Most tech companies use one of these three systems — the name you need is in the career page's address, e.g. boards.greenhouse.io/stripe → stripe."
        >
          {s.watchlist.length > 0 && (
            <ul className="flex flex-wrap gap-2">
              {s.watchlist.map((w) => (
                <li key={`${w.ats}:${w.slug}`} className="flex items-center gap-1.5 rounded-lg border border-line py-1 pl-3 pr-1 text-sm">
                  <span className="font-medium">{w.slug}</span>
                  <span className="text-muted">{w.ats}</span>
                  <Button
                    size="sm"
                    variant="danger"
                    aria-label={`Stop following ${w.slug}`}
                    className="!h-7 !px-1.5"
                    icon={<Trash2 className="size-3.5" aria-hidden />}
                    onClick={() => void save("watch", { watchlist: s.watchlist.filter((x) => x !== w) }, "Removed")}
                  />
                </li>
              ))}
            </ul>
          )}
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              const slug = company.slug.trim().toLowerCase();
              if (s.watchlist.some((w) => w.ats === company.ats && w.slug === slug)) return toast("Already following that company.", "danger");
              if (await save("watch", { watchlist: [...s.watchlist, { ...company, slug }] }, "Company added")) setCompany({ ...company, slug: "" });
            }}
          >
            <Field label="Hiring system">
              <Select value={company.ats} onChange={(e) => setCompany({ ...company, ats: e.target.value as WatchlistEntry["ats"] })} className="sm:w-40">
                <option value="greenhouse">Greenhouse</option>
                <option value="lever">Lever</option>
                <option value="ashby">Ashby</option>
              </Select>
            </Field>
            <Field label="Company name in the address" className="flex-1">
              <Input required value={company.slug} onChange={(e) => setCompany({ ...company, slug: e.target.value })} placeholder="e.g. stripe" />
            </Field>
            <Button type="submit" loading={saving === "watch"} icon={<Plus className="size-4" aria-hidden />}>
              Follow
            </Button>
          </form>
        </Section>

        <Section
          title="Local and on-site jobs (Adzuna)"
          hint={
            <>
              The built-in boards lean remote. Adzuna adds millions of local listings with real location search, and its developer key is
              free — sign up at <ExtLink href="https://developer.adzuna.com/">developer.adzuna.com</ExtLink> and paste the two values here.
            </>
          }
        >
          {s.hasAdzunaKey && <Notice tone="success">Adzuna is connected (app ID {s.adzunaAppId}). Enter new values to replace it.</Notice>}
          <form
            className="grid gap-3 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await save("adzuna", { adzunaAppId: az.id.trim(), adzunaAppKey: az.key.trim(), adzunaCountry: az.country }, "Adzuna connected")) setAdzuna(null);
            }}
          >
            <Field label="App ID">
              <Input required value={az.id} onChange={(e) => setAdzuna({ ...az, id: e.target.value })} />
            </Field>
            <Field label="App key">
              <Input type="password" required autoComplete="off" value={az.key} onChange={(e) => setAdzuna({ ...az, key: e.target.value })} />
            </Field>
            <Field label="Country">
              <Select value={az.country} onChange={(e) => setAdzuna({ ...az, country: e.target.value })}>
                {["us", "gb", "ca", "au", "de", "fr", "nl", "in", "sg", "nz", "za", "br", "mx", "it", "es", "pl", "at", "be", "ch"].map((c) => (
                  <option key={c} value={c}>
                    {c.toUpperCase()}
                  </option>
                ))}
              </Select>
            </Field>
            <Button type="submit" loading={saving === "adzuna"}>
              Connect
            </Button>
          </form>
          {s.hasAdzunaKey && (
            <Button variant="danger" size="sm" className="self-start" onClick={() => void save("adzuna", { adzunaAppId: "", adzunaAppKey: "" }, "Adzuna disconnected")}>
              Disconnect Adzuna
            </Button>
          )}
        </Section>

        <Section
          title="Form-filling browser extension"
          hint="Fills in your name, contact details, links and cover letter on application forms with one click. You review and press submit yourself."
        >
          <ol className="ml-5 list-decimal space-y-1.5 text-sm">
            <li>
              Open <span className="font-mono">chrome://extensions</span> in Chrome, Edge or Brave and switch on <strong>Developer mode</strong>.
            </li>
            <li>
              Click <strong>Load unpacked</strong> and choose the <span className="font-mono">extension</span> folder inside the JobApply project.
            </li>
            <li>On any application form, click the JobApply icon, pick the job, then <strong>Fill this page</strong>.</li>
          </ol>
          <p className="text-xs text-muted">Keep JobApply running while you use it — the extension reads your profile from this app.</p>
        </Section>

        <Section title="Your data">
          <p className="text-sm text-muted">
            Your resume, profile, applications and keys are plain files in the <span className="font-mono">data</span> folder of the project.
            Nothing is uploaded anywhere, with one exception you control: when AI writing is on, your profile and the job description are
            sent to Anthropic to produce the text. Back up that folder to keep your history; delete it to start over.
          </p>
        </Section>
      </div>
    </>
  );
}

"use client";

import { Plus, Trash2 } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { AiProviders } from "@/components/settings/AiProviders";
import { JobSources } from "@/components/settings/JobSources";
import { useToast } from "@/components/Toast";
import { Button, Card, Field, Input, Notice, PageHeader, Select, Spinner } from "@/components/ui";
import { PROVIDER_BY_ID } from "@/lib/ai/providers";
import { api, usd, useData } from "@/lib/client";
import { eraseData, exportData, importData, importBrowserData } from "@/lib/hosted";
import { HOSTED } from "@/lib/mode";
import { useAccount } from "@/components/AccountGate";
import type { PublicSettings, WatchlistEntry } from "@/lib/types";

const SECTIONS = [
  { id: "ai", label: "AI models" },
  { id: "spending", label: "Spending cap" },
  { id: "sources", label: "Job sources" },
  { id: "watchlist", label: "Company watchlist" },
  // The form filler reads from an app running on the visitor's own computer, which the website isn't.
  ...(HOSTED ? [] : [{ id: "extension", label: "Form filler" }]),
  { id: "data", label: "Your data" },
];

function Section({ id, title, hint, children }: { id: string; title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Card className="scroll-mt-6 p-5 sm:p-6">
      <h2 id={id} className="scroll-mt-6 text-lg font-semibold">
        {title}
      </h2>
      {hint && <p className="mt-1 max-w-prose text-sm text-muted">{hint}</p>}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </Card>
  );
}

export default function SettingsPage() {
  const { signedIn } = useAccount();
  const { data, error, loading, setData } = useData<PublicSettings>("/api/settings");
  const toast = useToast();
  const [budget, setBudget] = useState<string | null>(null);
  const [company, setCompany] = useState<WatchlistEntry>({ ats: "greenhouse", slug: "" });
  const [saving, setSaving] = useState("");
  const restoreInput = useRef<HTMLInputElement>(null);

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

  async function downloadBackup() {
    try {
    const url = URL.createObjectURL(new Blob([await exportData()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `jobapply-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    } catch (err) { toast((err as Error).message, "danger"); }
  }

  async function restoreBackup(file: File | undefined) {
    if (!file) return;
    try {
      if (!window.confirm(signedIn ? "Replace the data in your signed-in account with this backup?" : "Replace everything in this browser with the contents of that backup?")) return;
      await importData(await file.text());
      window.location.reload();
    } catch (err) {
      toast((err as Error).message, "danger");
    } finally {
      if (restoreInput.current) restoreInput.current.value = "";
    }
  }

  async function eraseEverything() {
    if (!window.confirm(signedIn ? "Erase your saved account data, including your profile, applications and provider keys? Your sign-in remains. This can't be undone." : "Erase your profile, applications and keys from this browser? This can't be undone.")) return;
    try { await eraseData(); window.location.reload(); }
    catch (err) { toast((err as Error).message, "danger"); }
  }

  async function migrateBrowserData() {
    if (!window.confirm("Import the older information saved in this browser into your signed-in account? Only continue if it belongs to you. This replaces your current account data.")) return;
    try { await importBrowserData(); window.location.reload(); }
    catch (err) { toast((err as Error).message, "danger"); }
  }

  const active = PROVIDER_BY_ID[s.aiProvider];
  const charged = active?.tier === "paid";
  const used = s.budgetUsd > 0 ? Math.min(100, (s.spentUsd / s.budgetUsd) * 100) : 100;
  const sourcesOn = s.sources.filter((x) => x.enabled && x.configured).length;

  return (
    <>
      <PageHeader
        title="Settings"
        lede="JobApply works with nothing set up. Everything here is optional, and each option says plainly whether it is free or paid."
      />

      <div className="lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-8">
        <nav aria-label="Settings sections" className="mb-4 flex gap-1 overflow-x-auto lg:sticky lg:top-6 lg:mb-0 lg:flex-col lg:self-start">
          {SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-muted transition-colors hover:bg-sunken hover:text-ink"
            >
              {section.label}
            </a>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <Section
            id="ai"
            title="AI models"
            hint={
              <>
                Tailored cover letters, resume rewrites, fit analysis and form answers are written by an AI model. Pick any one of these.
                {s.aiReady ? ` You're using ${active?.label}.` : " None is set up yet, so you're getting the built-in drafts."} When a model
                is in use, your profile and the job description are sent to it; nothing is sent otherwise.
              </>
            }
          >
            <AiProviders settings={s} save={save} saving={saving} onSettings={setData} />
          </Section>

          <Section
            id="spending"
            title="Spending cap"
            hint="Applies only to paid providers. JobApply estimates the cost of every request and refuses any that could take the total past your cap. Free and local models never count towards it."
          >
            <div>
              <div className="mb-1.5 flex items-baseline justify-between text-sm">
                <span className="font-medium">{charged ? `${active.label} spend` : "Paid spend so far"}</span>
                <span className="tabular-nums text-muted">
                  {usd(s.spentUsd)} of {usd(s.budgetUsd)} used
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={Math.round(used)} aria-valuemin={0} aria-valuemax={100} aria-label="AI budget used">
                <div className={used >= 90 ? "h-full bg-danger" : "h-full bg-accent"} style={{ width: `${used}%` }} />
              </div>
              <p className="mt-2 text-xs text-muted">This is an estimate from token counts. The provider&apos;s own account page has the exact figure.</p>
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
                  onClick={() => window.confirm("Reset the spend counter to $0? Do this after you top up your credit.") && void save("reset", { resetSpend: true }, "Counter reset")}
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
                        <td className="py-1.5">{u.model}</td>
                        <td className="py-1.5 text-right tabular-nums">{u.costUsd > 0 ? `$${u.costUsd.toFixed(4)}` : "free"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            )}
          </Section>

          <Section
            id="sources"
            title="Job sources"
            hint={`Every search goes to all the sources that are switched on (${sourcesOn} right now). Results are limited to live postings, and by default to remote roles open to the US and Europe.`}
          >
            <JobSources settings={s} save={save} saving={saving} />
          </Section>

          <Section
            id="watchlist"
            title="Company watchlist"
            hint="Follow specific companies' career pages. Their open roles are included in every search, free. Most tech companies use one of these three systems. The name you need is in the career page's address, e.g. boards.greenhouse.io/stripe → stripe."
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
                <div className="sm:w-40">
                  <Select value={company.ats} onChange={(e) => setCompany({ ...company, ats: e.target.value as WatchlistEntry["ats"] })}>
                    <option value="greenhouse">Greenhouse</option>
                    <option value="lever">Lever</option>
                    <option value="ashby">Ashby</option>
                  </Select>
                </div>
              </Field>
              <Field label="Company name in the address" className="flex-1">
                <Input required value={company.slug} onChange={(e) => setCompany({ ...company, slug: e.target.value })} placeholder="e.g. stripe" />
              </Field>
              <Button type="submit" loading={saving === "watch"} icon={<Plus className="size-4" aria-hidden />}>
                Follow
              </Button>
            </form>
          </Section>

          {!HOSTED && (
          <Section
            id="extension"
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
              <li>
                On any application form, click the JobApply icon, pick the job, then <strong>Fill this page</strong>.
              </li>
            </ol>
            <p className="text-xs text-muted">Keep JobApply running while you use it. The extension reads your profile from this app.</p>
          </Section>
          )}

          {HOSTED ? (
            <Section
              id="data"
              title="Your data"
              hint={signedIn ? "Your profile, resume text, applications and settings are saved privately to your account. Sign in on any device to access them. Account data is encrypted before being stored. Backups let you keep your own copy." : "Guest information is saved in this browser, on this device. It is not saved to an account. Clearing browser data removes it, so keep a backup. Sign in to use private account storage across devices; guest data can be imported from here after signing in."}
            >
              <div className="flex flex-wrap gap-2">
                <Button variant="primary" onClick={() => void downloadBackup()}>
                  Download a backup
                </Button>
                <input ref={restoreInput} type="file" accept="application/json,.json" className="sr-only" aria-label="Backup file" onChange={(e) => void restoreBackup(e.target.files?.[0])} />
                <Button onClick={() => restoreInput.current?.click()}>Restore from a backup</Button>
                {signedIn && <Button onClick={() => void migrateBrowserData()}>Import guest or older browser data</Button>}
                <Button variant="danger" onClick={() => void eraseEverything()}>
                  {signedIn ? "Erase account data" : "Erase everything"}
                </Button>
              </div>
              <p className="text-xs text-muted">
                {signedIn ? "Account backups contain your resume and applications, but exclude provider credentials. Reconnect providers after restoring. " : "The backup file contains your resume and any API keys you entered, so keep it somewhere private. Restoring it on another device moves everything across. "}Searches send your search words to the job sources that are switched on, and when an AI
                model is in use your profile and the job description are sent to it.
              </p>
            </Section>
          ) : (
          <Section id="data" title="Your data">
            <p className="text-sm text-muted">
              Your resume, profile, applications and keys are plain files in the <span className="font-mono">data</span> folder of the project.
              Nothing is uploaded anywhere, with two exceptions you control: searches send your search words to the job sources that are
              switched on, and when an AI model is in use your profile and the job description are sent to it. A model on your own computer
              keeps even that local. Back up the folder to keep your history; delete it to start over.
            </p>
          </Section>
          )}
        </div>
      </div>
    </>
  );
}

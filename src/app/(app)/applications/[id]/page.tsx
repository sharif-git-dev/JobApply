"use client";

import { ArrowLeft, BookmarkPlus, Check, Copy, Download, ExternalLink, Printer, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { useToast } from "@/components/Toast";
import { Button, Card, Chip, Input, Notice, ScoreRing, Select, Spinner, Textarea, buttonClass, cx } from "@/components/ui";
import { api, timeAgo, useData } from "@/lib/client";
import { STATUSES, type Application, type ApplicationStatus, type Profile, type PublicSettings } from "@/lib/types";

type Kind = "fit" | "cover" | "resume" | "answer";
type Tab = "fit" | "cover" | "resume" | "questions" | "notes";

const TABS: { id: Tab; label: string }[] = [
  { id: "fit", label: "Fit" },
  { id: "cover", label: "Cover letter" },
  { id: "resume", label: "Resume" },
  { id: "questions", label: "Questions" },
  { id: "notes", label: "Notes" },
];

const STATUS_LABEL: Record<ApplicationStatus, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interviewing",
  offer: "Offer",
  rejected: "Closed",
};

function SourceTag({ ai }: { ai: boolean }) {
  return <Chip tone={ai ? "match" : "neutral"}>{ai ? "Written by AI" : "Built-in draft"}</Chip>;
}

function Bullets({ items }: { items: string[] }) {
  return (
    <ul className="flex flex-col gap-1.5 text-sm leading-relaxed">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-2 size-1 shrink-0 rounded-full bg-muted" aria-hidden />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function Empty({ title, body, action }: { title: string; body: string; action: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 py-2">
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mt-1 max-w-prose text-sm text-muted">{body}</p>
      </div>
      {action}
    </div>
  );
}

export default function ApplicationPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const { data: app, error, loading, setData } = useData<Application>(`/api/applications/${id}`);
  const settings = useData<PublicSettings>("/api/settings");
  const [tab, setTab] = useState<Tab>("fit");
  const [busy, setBusy] = useState<Kind | "">("");
  const [genError, setGenError] = useState("");
  const [guidance, setGuidance] = useState("");
  const [question, setQuestion] = useState("");
  const [opened, setOpened] = useState(false);

  if (loading) return <Spinner />;
  if (error || !app) {
    return (
      <Notice tone="danger">
        {error || "Application not found."}{" "}
        <Link href="/applications" className="font-medium underline">
          Back to applications
        </Link>
      </Notice>
    );
  }

  const ai = settings.data?.aiReady ?? false;
  const { job } = app;
  const applyUrl = job.applyUrl || job.url;
  const score = app.fit?.score ?? app.match.score;

  async function patch(changes: Partial<Application>, message?: string) {
    try {
      setData(await api<Application>(`/api/applications/${id}`, { method: "PATCH", json: changes }));
      if (message) toast(message);
    } catch (err) {
      toast((err as Error).message, "danger");
    }
  }

  async function generate(kind: Kind, extra: Record<string, string> = {}) {
    setBusy(kind);
    setGenError("");
    try {
      setData(await api<Application>(`/api/applications/${id}/generate`, { json: { kind, ...extra } }));
      settings.reload();
      return true;
    } catch (err) {
      setGenError((err as Error).message);
      return false;
    } finally {
      setBusy("");
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      toast("Copied");
    } catch {
      toast("Couldn't copy — select the text and copy it manually.", "danger");
    }
  }

  function download(name: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!window.confirm(`Remove "${job.title}" and everything written for it? This can't be undone.`)) return;
    try {
      await api(`/api/applications/${id}`, { method: "DELETE" });
      router.push("/applications");
    } catch (err) {
      toast((err as Error).message, "danger");
    }
  }

  async function reuseAnswer(q: string, a: string) {
    try {
      const profile = await api<Profile>("/api/profile");
      const savedAnswers = [...profile.savedAnswers.filter((s) => s.question !== q), { question: q, answer: a }];
      await api("/api/profile", { method: "PUT", json: { savedAnswers } });
      toast("Saved — future answers will build on it");
    } catch (err) {
      toast((err as Error).message, "danger");
    }
  }

  const aiLabel = (verb: string) => (
    <>
      <Sparkles className="size-4" aria-hidden />
      {verb}
    </>
  );
  const fileBase = `${job.company || "application"} - ${job.title}`.replace(/[\\/:*?"<>|]+/g, " ").slice(0, 80);

  return (
    <>
      <Link href="/applications" className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
        <ArrowLeft className="size-4" aria-hidden />
        Applications
      </Link>

      <header className="mb-6 flex flex-wrap items-start gap-4">
        <ScoreRing score={score} size={56} />
        <div className="min-w-0 flex-1 basis-64">
          <h1 className="text-xl font-semibold leading-tight tracking-tight sm:text-2xl">{job.title}</h1>
          <p className="mt-1 text-sm text-muted">
            <span className="font-medium text-ink">{job.company || "Company not listed"}</span>
            {[job.location, job.salary, job.jobType].filter(Boolean).map((f) => (
              <span key={f}> · {f}</span>
            ))}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-40">
            <Select aria-label="Stage" value={app.status} onChange={(e) => void patch({ status: e.target.value as ApplicationStatus }, "Stage updated")}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </Select>
          </div>
          {applyUrl && (
            <a href={applyUrl} target="_blank" rel="noopener noreferrer" onClick={() => setOpened(true)} className={buttonClass("primary")}>
              Open application
              <ExternalLink className="size-4" aria-hidden />
            </a>
          )}
          <Button variant="danger" aria-label="Remove application" onClick={remove} icon={<Trash2 className="size-4" aria-hidden />} />
        </div>
      </header>

      {opened && app.status === "saved" && (
        <Notice tone="success" className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <span>Submitted it? Mark it as applied so your tracker stays accurate.</span>
          <Button size="sm" variant="primary" icon={<Check className="size-3.5" aria-hidden />} onClick={() => void patch({ status: "applied" }, "Marked as applied")}>
            I applied
          </Button>
        </Notice>
      )}

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <Card className="order-2 lg:sticky lg:top-6 lg:order-1">
          <h2 className="border-b border-line px-5 py-3 text-sm font-semibold">Job description</h2>
          <div className="max-h-[70vh] overflow-y-auto whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed">
            {job.description || "No description was captured for this job. Open the posting to read it."}
          </div>
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 border-t border-line px-5 py-3 text-sm font-medium text-accent hover:underline">
              View original posting
              <ExternalLink className="size-3.5" aria-hidden />
            </a>
          )}
        </Card>

        <Card className="order-1 lg:order-2">
          <div role="tablist" aria-label="Application materials" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-line px-3 pt-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => {
                  setTab(t.id);
                  setGenError("");
                }}
                className={cx(
                  "-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors",
                  tab === t.id ? "border-accent text-accent" : "border-transparent text-muted hover:text-ink",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-5" role="tabpanel">
            {!settings.loading && !ai && tab !== "notes" && (
              <Notice className="mb-4">
                You&apos;re using the built-in drafts.{" "}
                <Link href="/settings" className="font-medium text-accent hover:underline">
                  Set up an AI model
                </Link>{" "}
                for writing that&apos;s properly tailored to this job.
              </Notice>
            )}
            {genError && (
              <Notice tone="danger" className="mb-4">
                {genError}
              </Notice>
            )}

            {tab === "fit" &&
              (app.fit ? (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SourceTag ai={app.fit.source === "ai"} />
                    <Button size="sm" loading={busy === "fit"} onClick={() => void generate("fit")}>
                      Re-analyze
                    </Button>
                  </div>
                  <p className="text-sm leading-relaxed">{app.fit.summary}</p>
                  {app.fit.strengths.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">What works in your favor</h3>
                      <Bullets items={app.fit.strengths} />
                    </div>
                  )}
                  {app.fit.gaps.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Gaps to be ready for</h3>
                      <Bullets items={app.fit.gaps} />
                    </div>
                  )}
                  {app.fit.keywords.length > 0 && (
                    <div>
                      <h3 className="mb-2 text-sm font-semibold">Keywords to mirror</h3>
                      <div className="flex flex-wrap gap-1.5">
                        {app.fit.keywords.map((k) => (
                          <Chip key={k} tone="match">
                            {k}
                          </Chip>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex flex-col gap-5">
                  <Empty
                    title="Is this one worth applying to?"
                    body={
                      ai
                        ? "The AI reads the posting against your profile like a recruiter on a first screen: an honest score, what's working for you, and the gaps to be ready for."
                        : "Compares the skills this posting names against your profile."
                    }
                    action={
                      <Button variant="primary" loading={busy === "fit"} onClick={() => void generate("fit")}>
                        {ai ? aiLabel("Analyze my fit") : "Analyze my fit"}
                      </Button>
                    }
                  />
                  {(app.match.matched.length > 0 || app.match.missing.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 border-t border-line pt-4">
                      {app.match.matched.map((s) => (
                        <Chip key={s} tone="match">
                          {s}
                        </Chip>
                      ))}
                      {app.match.missing.map((s) => (
                        <Chip key={s} tone="gap">
                          {s}
                        </Chip>
                      ))}
                    </div>
                  )}
                </div>
              ))}

            {tab === "cover" &&
              (app.coverLetter ? (
                <div className="flex flex-col gap-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SourceTag ai={app.coverLetterSource === "ai"} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" icon={<Copy className="size-3.5" aria-hidden />} onClick={() => void copy(app.coverLetter)}>
                        Copy
                      </Button>
                      <Button size="sm" icon={<Download className="size-3.5" aria-hidden />} onClick={() => download(`${fileBase} - cover letter.txt`, app.coverLetter)}>
                        .txt
                      </Button>
                      <Link href={`/print/${id}/cover`} target="_blank" className={buttonClass("secondary", "sm")}>
                        <Printer className="size-3.5" aria-hidden />
                        PDF
                      </Link>
                    </div>
                  </div>
                  <Textarea
                    key={app.updatedAt}
                    aria-label="Cover letter"
                    rows={16}
                    defaultValue={app.coverLetter}
                    onBlur={(e) => e.target.value !== app.coverLetter && void patch({ coverLetter: e.target.value }, "Cover letter saved")}
                  />
                  <p className="text-xs text-muted">Edit freely — changes save when you click away. Read it once before sending; it goes out under your name.</p>
                  <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row">
                    {ai && (
                      <Input
                        aria-label="Guidance for the rewrite"
                        value={guidance}
                        onChange={(e) => setGuidance(e.target.value)}
                        placeholder="Optional: “shorter”, “mention my startup experience”…"
                      />
                    )}
                    <Button loading={busy === "cover"} onClick={() => void generate("cover", { guidance })}>
                      {ai ? "Rewrite" : "Rebuild draft"}
                    </Button>
                  </div>
                </div>
              ) : (
                <Empty
                  title="Cover letter"
                  body={
                    ai
                      ? "The AI writes a letter for this specific job from your real experience — no invented facts, no filler."
                      : "Builds a simple draft from your profile and the skills this job asks for. You'll want to personalize it."
                  }
                  action={
                    <Button variant="primary" loading={busy === "cover"} onClick={() => void generate("cover")}>
                      {ai ? aiLabel("Write cover letter") : "Draft cover letter"}
                    </Button>
                  }
                />
              ))}

            {tab === "resume" &&
              (app.tailoredResume ? (
                <div className="flex flex-col gap-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <SourceTag ai={app.tailoredResume.source === "ai"} />
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" loading={busy === "resume"} onClick={() => void generate("resume")}>
                        Redo
                      </Button>
                      <Link href={`/print/${id}/resume`} target="_blank" className={buttonClass("primary", "sm")}>
                        <Printer className="size-3.5" aria-hidden />
                        Open as PDF
                      </Link>
                    </div>
                  </div>
                  {app.tailoredResume.headline && <p className="font-semibold">{app.tailoredResume.headline}</p>}
                  {app.tailoredResume.summary && <p className="text-sm leading-relaxed">{app.tailoredResume.summary}</p>}
                  {app.tailoredResume.skills.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {app.tailoredResume.skills.map((s) => (
                        <Chip key={s}>{s}</Chip>
                      ))}
                    </div>
                  )}
                  {app.tailoredResume.experience.map((role, i) => (
                    <div key={i}>
                      <h3 className="text-sm font-semibold">
                        {role.title}
                        {role.company && <span className="font-normal text-muted"> · {role.company}</span>}
                      </h3>
                      {role.dates && <p className="mb-2 text-xs text-muted">{role.dates}</p>}
                      <Bullets items={role.bullets} />
                    </div>
                  ))}
                </div>
              ) : (
                <Empty
                  title="A resume aimed at this job"
                  body={
                    ai
                      ? "The AI reorders and rewrites your real bullets to speak this posting's language, then gives you a clean one-page layout to save as a PDF. Nothing is invented."
                      : "Puts your most relevant skills and bullets first and gives you a clean layout to save as a PDF."
                  }
                  action={
                    <Button variant="primary" loading={busy === "resume"} onClick={() => void generate("resume")}>
                      {ai ? aiLabel("Tailor my resume") : "Tailor my resume"}
                    </Button>
                  }
                />
              ))}

            {tab === "questions" && (
              <div className="flex flex-col gap-4">
                <div>
                  <h3 className="font-semibold">Application questions</h3>
                  <p className="mt-1 text-sm text-muted">Paste a question from the form — “Why do you want to work here?” — and get an answer drawn from your background.</p>
                </div>
                <form
                  className="flex flex-col gap-2"
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await generate("answer", { question })) setQuestion("");
                  }}
                >
                  <Textarea aria-label="Question from the application" rows={2} required value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Paste the question here" />
                  <Button type="submit" variant="primary" loading={busy === "answer"} disabled={!ai} className="self-start">
                    {aiLabel("Write answer")}
                  </Button>
                  {!ai && <p className="text-xs text-muted">This one needs an AI model set up in Settings — there&apos;s no sensible template for open questions.</p>}
                </form>
                {[...app.answers].reverse().map((qa, reversed) => {
                  const index = app.answers.length - 1 - reversed;
                  return (
                    <div key={`${index}-${qa.question}`} className="rounded-lg border border-line p-4">
                      <p className="text-sm font-medium">{qa.question}</p>
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{qa.answer}</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button size="sm" icon={<Copy className="size-3.5" aria-hidden />} onClick={() => void copy(qa.answer)}>
                          Copy
                        </Button>
                        <Button size="sm" variant="ghost" icon={<BookmarkPlus className="size-3.5" aria-hidden />} onClick={() => void reuseAnswer(qa.question, qa.answer)}>
                          Reuse for other jobs
                        </Button>
                        <Button
                          size="sm"
                          variant="danger"
                          className="ml-auto"
                          aria-label="Delete answer"
                          icon={<Trash2 className="size-3.5" aria-hidden />}
                          onClick={() => void patch({ answers: app.answers.filter((_, i) => i !== index) })}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "notes" && (
              <div className="flex flex-col gap-2">
                <Textarea
                  key={app.updatedAt}
                  aria-label="Notes"
                  rows={12}
                  defaultValue={app.notes}
                  placeholder="Recruiter name, interview dates, salary discussed, follow-ups…"
                  onBlur={(e) => e.target.value !== app.notes && void patch({ notes: e.target.value }, "Notes saved")}
                />
                <p className="text-xs text-muted">
                  Saved {timeAgo(app.createdAt)}
                  {app.appliedAt && ` · applied ${timeAgo(app.appliedAt)}`}. Notes save when you click away.
                </p>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}

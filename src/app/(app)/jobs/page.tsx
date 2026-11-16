"use client";

import { Bookmark, BookmarkCheck, ChevronDown, ExternalLink, Link2, MapPin, Plus, Search, Wand2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useToast } from "@/components/Toast";
import { Button, Card, Chip, Field, Input, Notice, PageHeader, ScoreRing, Spinner, Textarea, buttonClass, cx } from "@/components/ui";
import { api, sourceName, timeAgo } from "@/lib/client";
import type { Application, Profile, ScoredJob, SourceStatus } from "@/lib/types";

interface SearchResult {
  jobs: ScoredJob[];
  sources: SourceStatus[];
}

function AddJob({ onDone }: { onDone: (app: Application) => void }) {
  const [mode, setMode] = useState<"link" | "paste">("link");
  const [url, setUrl] = useState("");
  const [pasted, setPasted] = useState({ title: "", company: "", location: "", url: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const { application } = await api<{ application: Application }>("/api/jobs/import", {
        json: mode === "link" ? { url } : pasted,
      });
      onDone(application);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mb-4 p-5">
      <div className="mb-4 flex gap-1 rounded-lg bg-sunken p-1 text-sm font-medium sm:w-fit" role="tablist">
        {(["link", "paste"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={cx("flex-1 rounded-md px-4 py-1.5 sm:flex-none", mode === m ? "bg-surface shadow-sm" : "text-muted hover:text-ink")}
          >
            {m === "link" ? "From a link" : "Paste a job"}
          </button>
        ))}
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {mode === "link" ? (
          <Field label="Job posting link" hint="Works best with company career pages (Greenhouse, Lever, Ashby and most others). LinkedIn and Indeed block this — paste those instead.">
            <Input type="url" required value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
          </Field>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Job title">
                <Input required value={pasted.title} onChange={(e) => setPasted({ ...pasted, title: e.target.value })} />
              </Field>
              <Field label="Company">
                <Input value={pasted.company} onChange={(e) => setPasted({ ...pasted, company: e.target.value })} />
              </Field>
              <Field label="Location">
                <Input value={pasted.location} onChange={(e) => setPasted({ ...pasted, location: e.target.value })} />
              </Field>
            </div>
            <Field label="Link to apply (optional)">
              <Input type="url" value={pasted.url} onChange={(e) => setPasted({ ...pasted, url: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="Job description">
              <Textarea required rows={8} value={pasted.description} onChange={(e) => setPasted({ ...pasted, description: e.target.value })} />
            </Field>
          </>
        )}
        {error && <Notice tone="danger">{error}</Notice>}
        <Button type="submit" variant="primary" loading={busy} className="self-start">
          Add to my applications
        </Button>
      </form>
    </Card>
  );
}

function JobCard({ job, onSave }: { job: ScoredJob; onSave: (job: ScoredJob, open: boolean) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<"" | "save" | "tailor">("");
  const act = async (kind: "save" | "tailor") => {
    setBusy(kind);
    await onSave(job, kind === "tailor");
    setBusy("");
  };
  const facts = [job.location, job.salary, job.jobType, timeAgo(job.postedAt)].filter(Boolean);

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex gap-4">
        <ScoreRing score={job.match.score} />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold leading-snug">{job.title}</h3>
          <p className="mt-0.5 text-sm text-muted">
            <span className="font-medium text-ink">{job.company || "Company not listed"}</span>
            {facts.length > 0 && <> · {facts.join(" · ")}</>}
          </p>
          {(job.match.matched.length > 0 || job.match.missing.length > 0) && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {job.match.matched.slice(0, 6).map((s) => (
                <Chip key={s} tone="match">
                  {s}
                </Chip>
              ))}
              {job.match.missing.slice(0, 3).map((s) => (
                <Chip key={s} tone="gap">
                  {s}
                </Chip>
              ))}
            </div>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-4 max-h-96 overflow-y-auto whitespace-pre-wrap rounded-lg bg-sunken p-4 text-sm leading-relaxed">
          {job.description || "This board didn't include a description. Open the posting to read it."}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" loading={busy === "tailor"} icon={<Wand2 className="size-3.5" aria-hidden />} onClick={() => act("tailor")}>
          Tailor my application
        </Button>
        <Button
          size="sm"
          loading={busy === "save"}
          disabled={job.saved}
          icon={job.saved ? <BookmarkCheck className="size-3.5" aria-hidden /> : <Bookmark className="size-3.5" aria-hidden />}
          onClick={() => act("save")}
        >
          {job.saved ? "Saved" : "Save"}
        </Button>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)} icon={<ChevronDown className={cx("size-3.5 transition-transform", open && "rotate-180")} aria-hidden />}>
          {open ? "Hide details" : "Details"}
        </Button>
        <a href={job.url} target="_blank" rel="noopener noreferrer" className={cx(buttonClass("ghost", "sm"), "ml-auto")}>
          {sourceName(job.source)}
          <ExternalLink className="size-3.5" aria-hidden />
        </a>
      </div>
    </Card>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [location, setLocation] = useState("");
  const [remoteOnly, setRemoteOnly] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [adding, setAdding] = useState(false);
  const [hasProfile, setHasProfile] = useState(true);

  async function search(query: string, where: string, remote: boolean) {
    setSearching(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: query, location: where, remote: remote ? "1" : "0" });
      setResult(await api<SearchResult>(`/api/jobs/search?${params}`));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSearching(false);
    }
  }

  // First visit: search for the role the profile says the user wants.
  useEffect(() => {
    let alive = true;
    api<Profile>("/api/profile")
      .then((p) => {
        if (!alive) return;
        const role = p.targetRoles[0] || p.headline || p.experience[0]?.title || "";
        const remote = p.remotePreference === "remote";
        setHasProfile(Boolean(p.resumeText || p.skills.length));
        setQ(role);
        setRemoteOnly(remote);
        if (role) void search(role, "", remote);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  async function save(job: ScoredJob, open: boolean) {
    try {
      const { application } = await api<{ application: Application }>("/api/applications", { json: job });
      if (open) return router.push(`/applications/${application.id}`);
      setResult((r) => r && { ...r, jobs: r.jobs.map((j) => (j.id === job.id ? { ...j, saved: true } : j)) });
      toast("Saved to your applications");
    } catch (err) {
      toast((err as Error).message, "danger");
    }
  }

  const failed = result?.sources.filter((s) => !s.ok) ?? [];

  return (
    <>
      <PageHeader
        title="Find jobs"
        lede="Searches several job boards at once and ranks results by how well they match your profile."
        actions={
          <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(!adding)} aria-expanded={adding}>
            Add a job yourself
          </Button>
        }
      />

      {adding && <AddJob onDone={(app) => router.push(`/applications/${app.id}`)} />}

      {!hasProfile && (
        <Notice tone="warn" className="mb-4">
          Match scores need your resume.{" "}
          <Link href="/profile" className="font-medium underline">
            Upload it on the Profile page
          </Link>{" "}
          and results will be ranked for you.
        </Notice>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void search(q, location, remoteOnly);
        }}
        className="mb-5 flex flex-col gap-2 rounded-xl border border-line bg-surface p-3 sm:flex-row sm:items-center"
      >
        <div className="relative flex-[2]">
          <Search className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden />
          <Input aria-label="Job title or keywords" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Job title or keywords" className="pl-9" />
        </div>
        <div className="relative flex-1">
          <MapPin className="pointer-events-none absolute left-3 top-3 size-4 text-muted" aria-hidden />
          <Input aria-label="Location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="pl-9" />
        </div>
        <label className="flex cursor-pointer items-center gap-2 px-2 text-sm">
          <input type="checkbox" checked={remoteOnly} onChange={(e) => setRemoteOnly(e.target.checked)} className="size-4 accent-[var(--accent)]" />
          Remote only
        </label>
        <Button type="submit" variant="primary" loading={searching}>
          Search
        </Button>
      </form>

      {error && <Notice tone="danger">{error}</Notice>}
      {searching && !result && <Spinner label="Searching job boards…" />}

      {!searching && !result && !error && (
        <Card className="px-6 py-12 text-center">
          <Link2 className="mx-auto mb-3 size-6 text-muted" aria-hidden />
          <p className="font-medium">Search by title or skill to get started</p>
          <p className="mt-1 text-sm text-muted">Or add a posting you already found with “Add a job yourself”.</p>
        </Card>
      )}

      {result && (
        <div className={cx("flex flex-col gap-3", searching && "opacity-60")}>
          <p className="text-sm text-muted">
            {result.jobs.length === 0
              ? "No matches."
              : `${result.jobs.length} ${result.jobs.length === 1 ? "job" : "jobs"} from ${result.sources.filter((s) => s.ok && s.count).length} sources, best match first.`}
            {failed.length > 0 && ` Couldn't reach ${failed.map((s) => s.source).join(", ")} just now.`}
          </p>
          {result.jobs.length === 0 && (
            <Card className="px-6 py-10 text-center text-sm text-muted">
              Try a broader title, fewer words, or clear the location. The free boards lean remote and tech — for local on-site roles, add
              a free Adzuna key in{" "}
              <Link href="/settings" className="font-medium text-accent hover:underline">
                Settings
              </Link>
              , or add postings yourself.
            </Card>
          )}
          {result.jobs.map((job) => (
            <JobCard key={job.id} job={job} onSave={save} />
          ))}
        </div>
      )}
    </>
  );
}

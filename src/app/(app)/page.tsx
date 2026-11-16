"use client";

import { ArrowRight, Check, FileUp, KeyRound, Search } from "lucide-react";
import Link from "next/link";
import { timeAgo, usd, useData } from "@/lib/client";
import { STATUSES, type Application, type Profile, type PublicSettings } from "@/lib/types";
import { Card, Notice, PageHeader, ScoreRing, Spinner, buttonClass, cx } from "@/components/ui";

const STATUS_LABEL: Record<string, string> = {
  saved: "Saved",
  applied: "Applied",
  interview: "Interviewing",
  offer: "Offers",
  rejected: "Closed",
};

export default function Home() {
  const profile = useData<Profile>("/api/profile");
  const apps = useData<Application[]>("/api/applications");
  const settings = useData<PublicSettings>("/api/settings");

  if (profile.loading || apps.loading || settings.loading) return <Spinner />;
  const error = profile.error || apps.error || settings.error;
  if (error || !profile.data || !apps.data || !settings.data) return <Notice tone="danger">{error || "Couldn't load your data."}</Notice>;

  const p = profile.data;
  const list = apps.data;
  const s = settings.data;
  const hasResume = Boolean(p.resumeText);
  const firstName = p.fullName.split(" ")[0];

  const steps = [
    {
      done: hasResume,
      icon: FileUp,
      title: "Upload your resume",
      body: hasResume ? `${p.resumeFileName} · ${p.skills.length} skills found` : "PDF or Word. JobApply reads it and fills in your profile.",
      href: "/profile",
      cta: hasResume ? "Review profile" : "Upload resume",
    },
    {
      done: list.length > 0,
      icon: Search,
      title: "Find jobs that fit",
      body: list.length ? `${list.length} saved so far` : "Search several job boards at once, ranked by how well they match you.",
      href: "/jobs",
      cta: "Find jobs",
    },
    {
      done: s.hasApiKey,
      icon: KeyRound,
      title: "Turn on AI writing (optional)",
      body: s.hasApiKey
        ? `${usd(s.spentUsd)} of your ${usd(s.budgetUsd)} cap used`
        : "Add a DeepSeek (or Anthropic) key for tailored cover letters and answers. Without it you still get search, matching, and templates.",
      href: "/settings",
      cta: s.hasApiKey ? "Settings" : "Add key",
    },
  ];
  const next = steps.find((step) => !step.done);

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Welcome to JobApply"}
        lede="Give it your resume once. It finds matching jobs, tailors each application, and keeps track of where you stand."
      />

      <div className="grid gap-3 md:grid-cols-3">
        {steps.map((step, i) => (
          <Card key={step.title} className={cx("flex flex-col p-5", step === next && "border-accent/50 ring-1 ring-accent/20")}>
            <div className="mb-3 flex items-center gap-3">
              <span
                className={cx(
                  "grid size-8 place-items-center rounded-full text-sm font-semibold",
                  step.done ? "bg-accent text-on-accent" : "bg-sunken text-muted",
                )}
              >
                {step.done ? <Check className="size-4" aria-label="Done" /> : i + 1}
              </span>
              <h2 className="font-semibold">{step.title}</h2>
            </div>
            <p className="mb-4 flex-1 text-sm text-muted">{step.body}</p>
            <Link href={step.href} className={cx(buttonClass(step === next ? "primary" : "secondary", "sm"), "self-start")}>
              {step.cta}
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </Card>
        ))}
      </div>

      <h2 className="mb-3 mt-10 text-sm font-semibold uppercase tracking-wide text-muted">Your pipeline</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUSES.map((status) => (
          <Card key={status} className="px-4 py-3.5">
            <div className="text-2xl font-semibold tabular-nums">{list.filter((a) => a.status === status).length}</div>
            <div className="text-sm text-muted">{STATUS_LABEL[status]}</div>
          </Card>
        ))}
      </div>

      <div className="mb-3 mt-10 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted">Recently touched</h2>
        {list.length > 0 && (
          <Link href="/applications" className="text-sm font-medium text-accent hover:underline">
            All applications
          </Link>
        )}
      </div>
      {list.length === 0 ? (
        <Card className="px-5 py-8 text-center text-sm text-muted">
          Nothing saved yet. Jobs you save from{" "}
          <Link href="/jobs" className="font-medium text-accent hover:underline">
            Find jobs
          </Link>{" "}
          show up here.
        </Card>
      ) : (
        <Card className="divide-y divide-line">
          {list.slice(0, 6).map((a) => (
            <Link key={a.id} href={`/applications/${a.id}`} className="flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-sunken">
              <ScoreRing score={a.fit?.score ?? a.match.score} size={40} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{a.job.title}</div>
                <div className="truncate text-sm text-muted">
                  {[a.job.company, a.job.location].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="hidden text-right text-sm sm:block">
                <div className="font-medium capitalize">{a.status}</div>
                <div className="text-muted">{timeAgo(a.updatedAt)}</div>
              </div>
            </Link>
          ))}
        </Card>
      )}
    </>
  );
}

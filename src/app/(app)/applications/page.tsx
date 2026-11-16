"use client";

import Link from "next/link";
import { useToast } from "@/components/Toast";
import { Card, Notice, PageHeader, Spinner, buttonClass, cx, scoreTone } from "@/components/ui";
import { api, timeAgo, useData } from "@/lib/client";
import { STATUSES, type Application, type ApplicationStatus } from "@/lib/types";

const COLUMNS: Record<ApplicationStatus, { label: string; empty: string }> = {
  saved: { label: "Saved", empty: "Jobs you're considering" },
  applied: { label: "Applied", empty: "Sent and waiting" },
  interview: { label: "Interviewing", empty: "In conversation" },
  offer: { label: "Offer", empty: "Offers received" },
  rejected: { label: "Closed", empty: "Didn't work out" },
};

export default function ApplicationsPage() {
  const { data, error, loading, setData } = useData<Application[]>("/api/applications");
  const toast = useToast();

  if (loading) return <Spinner />;
  if (error || !data) return <Notice tone="danger">{error || "Couldn't load applications."}</Notice>;

  async function move(app: Application, status: ApplicationStatus) {
    const before = data!;
    setData(before.map((a) => (a.id === app.id ? { ...a, status } : a)));
    try {
      const saved = await api<Application>(`/api/applications/${app.id}`, { method: "PATCH", json: { status } });
      setData(before.map((a) => (a.id === app.id ? saved : a)));
    } catch (err) {
      setData(before);
      toast((err as Error).message, "danger");
    }
  }

  return (
    <>
      <PageHeader
        title="Applications"
        lede="Every job you've saved, by stage. Open one to tailor your materials; change its stage as things progress."
        actions={
          <Link href="/jobs" className={buttonClass("primary")}>
            Find more jobs
          </Link>
        }
      />

      {data.length === 0 ? (
        <Card className="px-6 py-14 text-center">
          <p className="font-medium">No applications yet</p>
          <p className="mt-1 text-sm text-muted">Save a job from the search and it lands here.</p>
        </Card>
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:px-6 md:-mx-8 md:px-8">
          <div className="grid min-w-[880px] grid-cols-5 gap-3">
            {STATUSES.map((status) => {
              const items = data.filter((a) => a.status === status);
              return (
                <section key={status} aria-label={COLUMNS[status].label} className="flex flex-col rounded-xl bg-sunken p-2">
                  <h2 className="flex items-center justify-between px-2 py-1.5 text-sm font-semibold">
                    {COLUMNS[status].label}
                    <span className="font-normal tabular-nums text-muted">{items.length}</span>
                  </h2>
                  <div className="flex flex-col gap-2">
                    {items.length === 0 && <p className="px-2 pb-3 pt-1 text-xs text-muted">{COLUMNS[status].empty}</p>}
                    {items.map((a) => {
                      const score = a.fit?.score ?? a.match.score;
                      return (
                        <Card key={a.id} className="p-3">
                          <Link href={`/applications/${a.id}`} className="block rounded-md">
                            <div className="text-sm font-medium leading-snug hover:text-accent">{a.job.title}</div>
                            <div className="mt-0.5 truncate text-xs text-muted">{a.job.company || "—"}</div>
                          </Link>
                          <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted">
                            <span>
                              <span className={cx("font-semibold tabular-nums", scoreTone(score))}>{score}</span> match ·{" "}
                              {timeAgo(a.appliedAt || a.updatedAt)}
                            </span>
                          </div>
                          <select
                            aria-label={`Stage for ${a.job.title}`}
                            value={a.status}
                            onChange={(e) => void move(a, e.target.value as ApplicationStatus)}
                            className="mt-2 h-7 w-full rounded-md border border-line bg-surface px-1.5 text-xs text-ink"
                          >
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {COLUMNS[s].label}
                              </option>
                            ))}
                          </select>
                        </Card>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}

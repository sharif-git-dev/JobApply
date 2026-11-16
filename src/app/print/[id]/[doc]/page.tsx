"use client";

import { ArrowLeft, Printer } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button, Notice, Spinner } from "@/components/ui";
import { useData } from "@/lib/client";
import type { Application, Profile } from "@/lib/types";

/**
 * A clean, single-column, ATS-friendly page. "Save as PDF" in the browser's
 * print dialog turns it into the file you upload to the application.
 */
export default function PrintPage() {
  const { id, doc } = useParams<{ id: string; doc: string }>();
  const app = useData<Application>(`/api/applications/${id}`);
  const profile = useData<Profile>("/api/profile");

  if (app.loading || profile.loading) return <div className="p-8"><Spinner /></div>;
  if (!app.data || !profile.data) {
    return <div className="p-8"><Notice tone="danger">{app.error || profile.error || "Couldn't load this document."}</Notice></div>;
  }

  const p = profile.data;
  const a = app.data;
  const tailored = a.tailoredResume;
  const contact = [p.email, p.phone, p.location, p.links.linkedin, p.links.github, p.links.portfolio].filter(Boolean);
  const roles =
    tailored?.experience ??
    p.experience.map((e) => ({ title: e.title, company: e.company, dates: [e.start, e.end].filter(Boolean).join(" – "), bullets: e.bullets }));
  const skills = tailored?.skills.length ? tailored.skills : p.skills;
  const summary = tailored?.summary || p.summary;
  const heading = "mb-1.5 mt-5 border-b border-neutral-400 pb-0.5 text-[11pt] font-bold uppercase tracking-wider";

  return (
    <div className="min-h-dvh bg-bg py-6">
      <div className="no-print mx-auto mb-4 flex max-w-[8.5in] flex-wrap items-center justify-between gap-3 px-4">
        <Link href={`/applications/${id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-muted hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden />
          Back to application
        </Link>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted sm:inline">In the print dialog, choose “Save as PDF”.</span>
          <Button variant="primary" icon={<Printer className="size-4" aria-hidden />} onClick={() => window.print()}>
            Print / Save as PDF
          </Button>
        </div>
      </div>

      <article className="sheet mx-auto max-w-[8.5in] px-[0.7in] py-[0.6in] text-[10.5pt] leading-snug shadow-lg">
        {doc === "cover" ? (
          <>
            <p className="text-[15pt] font-bold">{p.fullName}</p>
            <p className="mb-8 text-[9.5pt] text-neutral-700">{contact.join("  |  ")}</p>
            <div className="whitespace-pre-wrap text-[11pt] leading-relaxed">{a.coverLetter || "No cover letter has been written for this application yet."}</div>
          </>
        ) : (
          <>
            <h1 className="text-center text-[20pt] font-bold leading-tight">{p.fullName || "Your name"}</h1>
            {(tailored?.headline || p.headline) && <p className="text-center text-[11pt]">{tailored?.headline || p.headline}</p>}
            <p className="mt-1 text-center text-[9.5pt] text-neutral-700">{contact.join("  |  ")}</p>

            {summary && (
              <>
                <h2 className={heading}>Summary</h2>
                <p>{summary}</p>
              </>
            )}

            {skills.length > 0 && (
              <>
                <h2 className={heading}>Skills</h2>
                <p>{skills.join(", ")}</p>
              </>
            )}

            {roles.length > 0 && (
              <>
                <h2 className={heading}>Experience</h2>
                {roles.map((role, i) => (
                  <section key={i} className="mb-2.5 break-inside-avoid">
                    <div className="flex items-baseline justify-between gap-4">
                      <h3 className="font-bold">
                        {role.title}
                        {role.company && <span className="font-normal">, {role.company}</span>}
                      </h3>
                      <span className="shrink-0 text-[9.5pt] text-neutral-700">{role.dates}</span>
                    </div>
                    <ul className="ml-4 mt-0.5 list-disc">
                      {role.bullets.map((b, j) => (
                        <li key={j}>{b}</li>
                      ))}
                    </ul>
                  </section>
                ))}
              </>
            )}

            {p.education.length > 0 && (
              <>
                <h2 className={heading}>Education</h2>
                {p.education.map((e, i) => (
                  <div key={i} className="flex items-baseline justify-between gap-4">
                    <p>
                      <span className="font-bold">{e.degree}</span>
                      {e.school && `, ${e.school}`}
                      {e.details && ` — ${e.details}`}
                    </p>
                    <span className="shrink-0 text-[9.5pt] text-neutral-700">{e.year}</span>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </article>
    </div>
  );
}

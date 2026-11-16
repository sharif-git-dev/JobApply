import { NextResponse } from "next/server";
import { route } from "@/lib/api";
import { getApplications, getProfile } from "@/lib/store";

/** What the browser extension needs to fill an application form. */
export const GET = route(async () => {
  const [p, apps] = await Promise.all([getProfile(), getApplications()]);
  const [firstName, ...rest] = p.fullName.trim().split(/\s+/);
  const current = p.experience[0];
  const school = p.education[0];
  return NextResponse.json({
    fields: {
      fullName: p.fullName,
      firstName: firstName ?? "",
      lastName: rest.join(" "),
      email: p.email,
      phone: p.phone,
      location: p.location,
      city: p.location.split(",")[0]?.trim() ?? "",
      linkedin: p.links.linkedin,
      github: p.links.github,
      portfolio: p.links.portfolio || p.links.other,
      headline: p.headline,
      currentTitle: current?.title ?? p.headline,
      currentCompany: current?.company ?? "",
      school: school?.school ?? "",
      degree: school?.degree ?? "",
      yearsExperience: p.yearsExperience,
      salaryExpectation: p.salaryExpectation,
      noticePeriod: p.noticePeriod,
      workAuthorization: p.workAuthorization,
      requiresSponsorship: p.requiresSponsorship,
      summary: p.summary,
    },
    applications: apps
      .filter((a) => a.status === "saved" || a.status === "applied")
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 30)
      .map((a) => ({
        id: a.id,
        title: a.job.title,
        company: a.job.company,
        url: a.job.applyUrl || a.job.url,
        coverLetter: a.coverLetter,
        answers: a.answers,
      })),
  });
});

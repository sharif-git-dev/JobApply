import { z } from "zod";
import { STATUSES } from "./types";

const text = (max: number) => z.string().max(max);
const strings = (maxItems: number, maxLen = 200) => z.array(text(maxLen)).max(maxItems);

export const ProfilePatch = z
  .object({
    fullName: text(200),
    email: text(200),
    phone: text(60),
    location: text(200),
    headline: text(200),
    summary: text(4000),
    links: z.object({ linkedin: text(300), github: text(300), portfolio: text(300), other: text(300) }).partial(),
    skills: strings(200, 80),
    experience: z
      .array(
        z.object({
          title: text(200),
          company: text(200),
          location: text(200),
          start: text(40),
          end: text(40),
          bullets: strings(40, 1000),
        }),
      )
      .max(40),
    education: z.array(z.object({ degree: text(300), school: text(300), year: text(40), details: text(1000) })).max(20),
    targetRoles: strings(30),
    preferredLocations: strings(30),
    remotePreference: z.enum(["any", "remote", "hybrid", "onsite"]),
    workAuthorization: text(300),
    requiresSponsorship: z.enum(["", "yes", "no"]),
    salaryExpectation: text(200),
    noticePeriod: text(200),
    yearsExperience: text(20),
    extraInfo: text(8000),
    savedAnswers: z.array(z.object({ question: text(1000), answer: text(6000) })).max(100),
  })
  .partial();

export const JobInput = z.object({
  id: text(300).min(1),
  source: text(100),
  title: text(300).min(1),
  company: text(300),
  location: text(300),
  remote: z.boolean(),
  url: text(2000),
  applyUrl: text(2000),
  description: text(60_000),
  tags: strings(40, 100),
  salary: text(200),
  jobType: text(200),
  postedAt: text(40),
});

export const ImportInput = z.union([
  z.object({ url: text(2000).min(1) }),
  z.object({
    title: text(300),
    company: text(300),
    location: text(300).default(""),
    url: text(2000).default(""),
    description: text(60_000),
  }),
]);

export const ApplicationPatch = z
  .object({
    status: z.enum(STATUSES),
    notes: text(20_000),
    coverLetter: text(20_000),
    answers: z.array(z.object({ question: text(1000), answer: text(6000) })).max(100),
    tailoredResume: z
      .object({
        headline: text(300),
        summary: text(4000),
        skills: strings(200, 80),
        experience: z
          .array(z.object({ title: text(200), company: text(200), dates: text(100), bullets: strings(40, 1000) }))
          .max(40),
        source: z.enum(["ai", "keyword"]),
      })
      .nullable(),
  })
  .partial();

export const GenerateInput = z.object({
  kind: z.enum(["fit", "cover", "resume", "answer"]),
  question: text(1000).optional(),
  guidance: text(1000).optional(),
});

export const SettingsPatch = z
  .object({
    /** Switch which provider writes for you. */
    aiProvider: text(40),
    /** Update one provider's key, model or address. */
    ai: z.object({
      provider: text(40),
      key: text(400).optional(),
      model: text(200).optional(),
      baseUrl: text(300).optional(),
    }),
    budgetUsd: z.number().min(0).max(1000),
    resetSpend: z.boolean(),
    /** Switch one job source on or off, fill in its fields, or clear them. */
    source: z.object({
      id: text(40),
      enabled: z.boolean().optional(),
      values: z.record(z.string().max(40), text(400)).optional(),
      clear: z.boolean().optional(),
    }),
    watchlist: z.array(z.object({ ats: z.enum(["greenhouse", "lever", "ashby"]), slug: text(100).min(1) })).max(40),
  })
  .partial();

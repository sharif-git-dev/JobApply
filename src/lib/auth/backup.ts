import { z } from "zod";
import { ApplicationPatch, JobInput, ProfilePatch, SettingsPatch } from "../schemas";
import { STATUSES } from "../types";

const text = (max: number) => z.string().max(max);
const strings = z.array(text(1000)).max(200);
const backupSettings = z.object({
  aiProvider: text(40).optional(),
  aiModels: z.record(text(40), text(200)).optional(),
  aiKeys: z.record(text(40), text(400)).optional(),
  // Address overrides are never imported onto the hosted server.
  budgetUsd: z.number().min(0).max(1000).optional(),
  spentUsd: z.number().min(0).optional(),
  disabledSources: z.array(text(40)).max(100).optional(),
  sourceConfig: z.record(text(40), z.record(text(40), text(400))).optional(),
  watchlist: SettingsPatch.shape.watchlist,
});

const backupApplication = z.object({
  id: text(300).min(1), job: JobInput, status: z.enum(STATUSES),
  createdAt: text(40), updatedAt: text(40), appliedAt: text(40), notes: text(20_000),
  match: z.object({ score: z.number().min(0).max(100), matched: strings, missing: strings }),
  fit: z.object({ score: z.number().min(0).max(100), summary: text(8000), strengths: strings, gaps: strings, keywords: strings, source: z.enum(["ai", "keyword"]) }).nullable(),
  coverLetter: text(20_000), coverLetterSource: z.enum(["", "ai", "template"]),
  tailoredResume: ApplicationPatch.shape.tailoredResume,
  answers: z.array(z.object({ question: text(1000), answer: text(6000) })).max(100),
});

export const AccountBackup = z.object({
  app: z.literal("JobApply"),
  profile: ProfilePatch.extend({ resumeText: text(200_000).optional(), resumeFileName: text(300).optional(), resumeUpdatedAt: text(40).optional() }).default({}),
  settings: backupSettings.default({}),
  applications: z.array(backupApplication).max(5000),
});

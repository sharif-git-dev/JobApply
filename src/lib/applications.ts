import { randomUUID } from "node:crypto";
import { scoreJob } from "./match";
import { getProfile, update } from "./store";
import type { Application, Job } from "./types";

/** Save a job to the tracker. Saving the same posting twice returns the existing entry. */
export async function createApplication(job: Job): Promise<{ application: Application; created: boolean }> {
  const profile = await getProfile();
  let application: Application | undefined;
  let created = false;
  await update<Application[]>("applications", [], (apps) => {
    application = apps.find((a) => a.job.id === job.id);
    if (application) return apps;
    const now = new Date().toISOString();
    application = {
      id: randomUUID(),
      job,
      status: "saved",
      createdAt: now,
      updatedAt: now,
      appliedAt: "",
      notes: "",
      match: scoreJob(profile, job),
      fit: null,
      coverLetter: "",
      coverLetterSource: "",
      tailoredResume: null,
      answers: [],
    };
    created = true;
    return [application, ...apps];
  });
  return { application: application!, created };
}

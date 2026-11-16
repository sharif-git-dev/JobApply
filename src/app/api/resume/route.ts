import { NextResponse } from "next/server";
import { AiError, aiAvailable } from "@/lib/ai/client";
import { parseResumeWithAi } from "@/lib/ai/tasks";
import { HttpError, route } from "@/lib/api";
import { resumeToText } from "@/lib/resume/extract";
import { parseResumeHeuristically } from "@/lib/resume/heuristics";
import { getProfile, saveProfile } from "@/lib/store";
import type { Profile } from "@/lib/types";

/** Upload a resume: extract its text, structure it, and fill in the profile. */
export const POST = route(async (request: Request) => {
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError("Attach a resume file.");

  const resumeText = await resumeToText(file.name, new Uint8Array(await file.arrayBuffer()));

  let parsed: Partial<Profile>;
  let parsedWith: "ai" | "rules" = "rules";
  let warning = "";
  if (await aiAvailable()) {
    try {
      parsed = await parseResumeWithAi(resumeText);
      parsedWith = "ai";
    } catch (err) {
      // The upload shouldn't fail just because the AI call did.
      parsed = parseResumeHeuristically(resumeText);
      warning = err instanceof AiError ? err.message : "AI parsing failed, so the built-in parser was used instead.";
    }
  } else {
    parsed = parseResumeHeuristically(resumeText);
  }

  // A new resume replaces what the old one told us, but never blanks a field the
  // parser couldn't find, and never touches the preferences the user typed in.
  const current = await getProfile();
  const patch: Partial<Profile> = {};
  for (const [key, value] of Object.entries(parsed) as [keyof Profile, unknown][]) {
    if (key === "links") continue;
    const empty = value === "" || value === undefined || (Array.isArray(value) && value.length === 0);
    if (!empty) (patch as Record<string, unknown>)[key] = value;
  }
  const links = { ...current.links };
  for (const [key, value] of Object.entries(parsed.links ?? {}) as [keyof Profile["links"], string][]) {
    if (value) links[key] = value;
  }

  const profile = await saveProfile({
    ...patch,
    links,
    resumeText,
    resumeFileName: file.name,
    resumeUpdatedAt: new Date().toISOString(),
  });
  return NextResponse.json({ profile, parsedWith, warning });
});

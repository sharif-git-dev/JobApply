import { NextResponse } from "next/server";
import { aiAvailable } from "@/lib/ai/client";
import { analyzeFit, answerQuestion, tailorResume, writeCoverLetter } from "@/lib/ai/tasks";
import { HttpError, body, route } from "@/lib/api";
import { GenerateInput } from "@/lib/schemas";
import { getApplication, getProfile, updateApplication } from "@/lib/store";
import { keywordFit, keywordTailoredResume, templateCoverLetter } from "@/lib/templates";

/**
 * Produce one piece of an application. With an Anthropic key this is Claude;
 * without one, fit / cover letter / resume fall back to the built-in versions.
 */
export const POST = route(async (request: Request, ctx: RouteContext<"/api/applications/[id]/generate">) => {
  const { id } = await ctx.params;
  const input = await body(request, GenerateInput);
  const [app, profile, ai] = await Promise.all([getApplication(id), getProfile(), aiAvailable()]);
  if (!app) throw new HttpError("That application no longer exists.", 404);
  if (!profile.resumeText && !profile.experience.length && !profile.skills.length) {
    throw new HttpError("Upload your resume on the Profile page first — there's nothing to tailor yet.", 409);
  }
  const { job } = app;

  if (input.kind === "fit") {
    const fit = ai ? await analyzeFit(profile, job) : keywordFit(profile, job);
    return NextResponse.json(await updateApplication(id, (a) => ({ ...a, fit })));
  }

  if (input.kind === "cover") {
    const coverLetter = ai ? await writeCoverLetter(profile, job, input.guidance ?? "") : templateCoverLetter(profile, job);
    return NextResponse.json(
      await updateApplication(id, (a) => ({ ...a, coverLetter, coverLetterSource: ai ? "ai" : "template" })),
    );
  }

  if (input.kind === "resume") {
    const tailoredResume = ai ? await tailorResume(profile, job) : keywordTailoredResume(profile, job);
    return NextResponse.json(await updateApplication(id, (a) => ({ ...a, tailoredResume })));
  }

  const question = input.question?.trim();
  if (!question) throw new HttpError("Type the question from the application form.");
  if (!ai) {
    throw new HttpError("Answering application questions needs an Anthropic API key. Add one in Settings.", 400);
  }
  const answer = await answerQuestion(profile, job, question);
  return NextResponse.json(await updateApplication(id, (a) => ({ ...a, answers: [...a.answers, { question, answer }] })));
});

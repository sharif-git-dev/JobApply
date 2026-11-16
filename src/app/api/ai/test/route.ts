import { NextResponse } from "next/server";
import { z } from "zod";
import { generateText } from "@/lib/ai/client";
import { PROVIDER_BY_ID } from "@/lib/ai/providers";
import { HttpError, body, route } from "@/lib/api";
import { toPublicSettings } from "@/lib/settings";
import { getSettings } from "@/lib/store";

/** Send one tiny real request through a provider, so "it works" means the whole path works. */
export const POST = route(async (request: Request) => {
  const { provider } = await body(request, z.object({ provider: z.string().max(40) }));
  if (!PROVIDER_BY_ID[provider]) throw new HttpError("Unknown AI provider.");
  const reply = await generateText(
    {
      task: "Connection test",
      system: ["You are being used to check that a connection works."],
      user: "Reply with one short sentence saying you are ready to help with job applications.",
      effort: "low",
    },
    provider,
  );
  return NextResponse.json({ reply: reply.slice(0, 300), settings: toPublicSettings(await getSettings()) });
});

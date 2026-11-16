import { NextResponse } from "next/server";
import { listModels } from "@/lib/ai/client";
import { PROVIDER_BY_ID } from "@/lib/ai/providers";
import { HttpError, route } from "@/lib/api";

/** The models a provider offers right now. Costs nothing, and proves the key and address work. */
export const GET = route(async (request: Request) => {
  const provider = new URL(request.url).searchParams.get("provider") ?? "";
  if (!PROVIDER_BY_ID[provider]) throw new HttpError("Unknown AI provider.");
  return NextResponse.json({ models: await listModels(provider) });
});

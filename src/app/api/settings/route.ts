import { NextResponse } from "next/server";
import { MODELS, toPublicSettings } from "@/lib/ai/client";
import { HttpError, body, route } from "@/lib/api";
import { SettingsPatch } from "@/lib/schemas";
import { getSettings, saveSettings } from "@/lib/store";

/** Keys go in, but never come back out — the browser only sees a "…last4" hint. */
export const GET = route(async () => NextResponse.json(toPublicSettings(await getSettings())));

export const PUT = route(async (request: Request) => {
  const { resetSpend, ...patch } = await body(request, SettingsPatch);
  if (patch.model && !MODELS[patch.model]) throw new HttpError("Unknown model.");
  if (patch.anthropicApiKey !== undefined) patch.anthropicApiKey = patch.anthropicApiKey.trim();
  if (patch.adzunaCountry) patch.adzunaCountry = patch.adzunaCountry.toLowerCase();
  if (patch.watchlist) {
    patch.watchlist = patch.watchlist.map((w) => ({ ats: w.ats, slug: w.slug.trim().toLowerCase() }));
  }
  const saved = await saveSettings((s) => ({
    ...s,
    ...patch,
    ...(resetSpend ? { spentUsd: 0, usage: [] } : {}),
  }));
  return NextResponse.json(toPublicSettings(saved));
});

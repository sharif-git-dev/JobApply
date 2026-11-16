import { NextResponse } from "next/server";
import { PROVIDER_BY_ID } from "@/lib/ai/providers";
import { HttpError, body, route } from "@/lib/api";
import { SOURCE_BY_ID } from "@/lib/jobs/catalog";
import { SettingsPatch } from "@/lib/schemas";
import { toPublicSettings } from "@/lib/settings";
import { getSettings, saveSettings } from "@/lib/store";

/** Keys go in, but never come back out — the browser only sees a "…last4" hint. */
export const GET = route(async () => NextResponse.json(toPublicSettings(await getSettings())));

export const PUT = route(async (request: Request) => {
  const patch = await body(request, SettingsPatch);
  if (patch.aiProvider && !PROVIDER_BY_ID[patch.aiProvider]) throw new HttpError("Unknown AI provider.");
  if (patch.ai && !PROVIDER_BY_ID[patch.ai.provider]) throw new HttpError("Unknown AI provider.");
  const sourceInfo = patch.source ? SOURCE_BY_ID[patch.source.id] : undefined;
  if (patch.source && !sourceInfo?.integrated) throw new HttpError("Unknown job source.");

  const saved = await saveSettings((s) => {
    const next = { ...s };
    if (patch.aiProvider) next.aiProvider = patch.aiProvider;

    if (patch.ai) {
      const { provider, key, model, baseUrl } = patch.ai;
      if (key !== undefined) next.aiKeys = { ...s.aiKeys, [provider]: key.trim() };
      if (model !== undefined) next.aiModels = { ...s.aiModels, [provider]: model.trim() };
      if (baseUrl !== undefined) next.aiBaseUrls = { ...s.aiBaseUrls, [provider]: baseUrl.trim() };
    }

    if (patch.source && sourceInfo) {
      const { id, enabled, values, clear } = patch.source;
      if (enabled !== undefined) {
        next.disabledSources = enabled ? s.disabledSources.filter((x) => x !== id) : [...new Set([...s.disabledSources, id])];
      }
      if (clear) {
        next.sourceConfig = { ...s.sourceConfig, [id]: {} };
      } else if (values) {
        // Only fields the catalog knows about, and only the ones that were sent.
        const allowed = new Set((sourceInfo.fields ?? []).map((f) => f.name));
        const clean = Object.fromEntries(Object.entries(values).filter(([k]) => allowed.has(k)).map(([k, v]) => [k, v.trim()]));
        next.sourceConfig = { ...s.sourceConfig, [id]: { ...s.sourceConfig[id], ...clean } };
      }
    }

    if (patch.budgetUsd !== undefined) next.budgetUsd = patch.budgetUsd;
    if (patch.resetSpend) Object.assign(next, { spentUsd: 0, usage: [] });
    if (patch.watchlist) next.watchlist = patch.watchlist.map((w) => ({ ats: w.ats, slug: w.slug.trim().toLowerCase() }));
    return next;
  });
  return NextResponse.json(toPublicSettings(saved));
});

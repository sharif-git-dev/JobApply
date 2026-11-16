import { publicProviders } from "./ai/client";
import { DEFAULT_PROVIDER, PROVIDER_BY_ID } from "./ai/providers";
import { SOURCES } from "./jobs/catalog";
import { sourceConfig, sourceConfigured } from "./jobs/sources";
import type { PublicSettings, Settings } from "./types";

/** The view of settings the browser gets: keys are reduced to "set / not set" and a last-four hint. */
export function toPublicSettings(settings: Settings): PublicSettings {
  const providers = publicProviders(settings);
  const aiProvider = PROVIDER_BY_ID[settings.aiProvider] ? settings.aiProvider : DEFAULT_PROVIDER;
  return {
    aiProvider,
    aiReady: providers.find((p) => p.id === aiProvider)?.ready ?? false,
    providers,
    budgetUsd: settings.budgetUsd,
    spentUsd: settings.spentUsd,
    usage: settings.usage.slice(-25).reverse(),
    sources: SOURCES.filter((s) => s.integrated).map((info) => {
      const cfg = sourceConfig(settings, info);
      const fields = info.fields ?? [];
      return {
        id: info.id,
        enabled: !settings.disabledSources.includes(info.id),
        configured: sourceConfigured(settings, info),
        values: Object.fromEntries(fields.filter((f) => !f.secret).map((f) => [f.name, cfg[f.name]])),
        secretsSet: Object.fromEntries(fields.filter((f) => f.secret).map((f) => [f.name, Boolean(cfg[f.name])])),
      };
    }),
    watchlist: settings.watchlist,
  };
}

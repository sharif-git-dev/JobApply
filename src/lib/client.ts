"use client";

import { useCallback, useEffect, useState } from "react";
import { hostedApi } from "./hosted";
import { HOSTED } from "./mode";
import { ACCOUNTS_ENABLED } from "./auth/config";
import { accountApi } from "./account-client";

/** fetch() for our own API: JSON in, JSON out, server error messages surfaced as Error. */
export async function api<T>(path: string, init?: { method?: string; json?: unknown; form?: FormData }): Promise<T> {
  if (ACCOUNTS_ENABLED) return accountApi<T>(path, init);
  // On the public website the data lives in this browser and travels with each call.
  if (HOSTED) return hostedApi<T>(path, init);
  const res = await fetch(path, {
    method: init?.method ?? (init?.json !== undefined || init?.form ? "POST" : "GET"),
    headers: init?.json !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.form ?? (init?.json !== undefined ? JSON.stringify(init.json) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

interface DataState<T> {
  data: T | undefined;
  error: string;
  loading: boolean;
}

/** Load a resource on mount; `setData` lets a page apply the result of a save without refetching. */
export function useData<T>(path: string) {
  const [state, setState] = useState<DataState<T>>({ data: undefined, error: "", loading: true });
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    api<T>(path).then(
      (data) => alive && setState({ data, error: "", loading: false }),
      (err: Error) => alive && setState((s) => ({ ...s, error: err.message, loading: false })),
    );
    return () => {
      alive = false;
    };
  }, [path, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  const setData = useCallback((data: T) => setState({ data, error: "", loading: false }), []);
  return { ...state, reload, setData };
}

export function timeAgo(iso: string): string {
  if (!iso) return "";
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (!Number.isFinite(days)) return "";
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 60) return "a month ago";
  return `${Math.floor(days / 30)} months ago`;
}

const SOURCE_NAMES: Record<string, string> = {
  remotive: "Remotive",
  remoteok: "Remote OK",
  jobicy: "Jobicy",
  himalayas: "Himalayas",
  arbeitnow: "Arbeitnow",
  adzuna: "Adzuna",
  web: "Posting",
  manual: "Posting",
};

/** "greenhouse-stripe" → "Stripe careers"; board ids → their proper names. */
export function sourceName(source: string): string {
  if (SOURCE_NAMES[source]) return SOURCE_NAMES[source];
  const company = source.replace(/^(greenhouse|lever|ashby)-/, "");
  return company === source ? source : `${company[0].toUpperCase()}${company.slice(1)} careers`;
}

export const usd =(n: number) => (n > 0 && n < 0.01 ? "<$0.01" : `$${n.toFixed(2)}`);

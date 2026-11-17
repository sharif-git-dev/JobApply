"use client";

import { accountToken } from "./auth/browser";

// Serialize writes within one tab, including reads that depend on a pending write.
// Other tabs/devices are protected by the database's version check.
let queue: Promise<unknown> = Promise.resolve();

async function request<T>(token: string, path: string, init?: { method?: string; json?: unknown; form?: FormData }): Promise<T> {
  const envelope = JSON.stringify({ path, method: init?.method ?? (init?.json !== undefined || init?.form ? "POST" : "GET"), json: init?.json });
  let body: BodyInit = envelope;
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  const file = init?.form?.get("file");
  if (file instanceof File) {
    if (file.size + new Blob([envelope]).size > 4_000_000) throw new Error("Choose a resume smaller than 4 MB.");
    const form = new FormData();
    form.append("envelope", envelope);
    form.append("file", file);
    body = form;
  } else {
    if (new Blob([envelope]).size > 4_000_000) throw new Error("That request is too large. Try a smaller backup or shorter text.");
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch("/api/hosted", { method: "POST", headers, body, cache: "no-store" });
  const reply = await response.json().catch(() => null);
  const status = reply?.status ?? response.status;
  if (status === 401) window.dispatchEvent(new Event("jobapply:signed-out"));
  if (!reply || status >= 400) throw new Error(reply?.data?.error ?? `Could not reach your account (${status}). Please try again.`);
  return reply.data as T;
}

export async function accountApi<T>(path: string, init?: { method?: string; json?: unknown; form?: FormData }): Promise<T> {
  // Bind queued work to the account that requested it, even if someone signs out while waiting.
  const token = await accountToken();
  const next = queue.catch(() => undefined).then(() => request<T>(token, path, init));
  queue = next;
  return next;
}

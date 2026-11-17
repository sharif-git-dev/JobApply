"use client";

import type { Application } from "./types";

/**
 * The browser half of hosted mode (see ./mode.ts).
 *
 * On the public website nothing is stored on the server. A visitor's profile,
 * applications and settings (including their API keys) live in this browser's
 * IndexedDB. Each API call sends the server the slices it needs and saves back
 * whatever the server changed.
 */

// ---- Storage ------------------------------------------------------------------

const DB_NAME = "jobapply";
const STORE = "state";
type Key = "profile" | "settings" | "applications";

/** Used when IndexedDB is unavailable (some private windows): data lasts until the tab closes. */
const memory = new Map<string, unknown>();
let opening: Promise<IDBDatabase | null> | null = null;

function database(): Promise<IDBDatabase | null> {
  opening ??= new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return opening;
}

async function get<T>(key: Key): Promise<T | undefined> {
  const db = await database();
  if (!db) return memory.get(key) as T | undefined;
  return new Promise((resolve) => {
    const request = db.transaction(STORE).objectStore(STORE).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => resolve(undefined);
  });
}

async function set(key: Key, value: unknown): Promise<void> {
  const db = await database();
  if (!db) {
    memory.set(key, value);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(new Error("Your browser refused to save. Its storage may be full or blocked."));
  });
}

/** True when data can't be kept between visits. */
export async function storageIsTemporary(): Promise<boolean> {
  return (await database()) === null;
}

// ---- Talking to the server ------------------------------------------------------

/** What the server gets in place of an application it doesn't need in full: enough to spot duplicates. */
interface Stub {
  id: string;
  status: string;
  updatedAt: string;
  job: { id: string };
  __stub: true;
}
type Sent = Application | Stub;
const isStub = (a: unknown): a is Stub => typeof a === "object" && a !== null && "__stub" in a;
const stub = (a: Application): Stub => ({ id: a.id, status: a.status, updatedAt: a.updatedAt, job: { id: a.job.id }, __stub: true });

interface Reply {
  status: number;
  data: unknown;
  state: { profile?: unknown; settings?: unknown; applications?: Sent[] };
}

const MAX_REQUEST_BYTES = 4_000_000;

export async function hostedApi<T>(path: string, init?: { method?: string; json?: unknown; form?: FormData }): Promise<T> {
  const method = init?.method ?? (init?.json !== undefined || init?.form ? "POST" : "GET");
  const pathname = path.split("?")[0];
  const [profile, settings, stored] = await Promise.all([get("profile"), get("settings"), get<Application[]>("applications")]);
  const applications = stored ?? [];

  // The list never needs the server: it's already here.
  if (pathname === "/api/applications" && method === "GET") {
    return [...applications].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) as T;
  }

  // Send in full only the application this call is about; a list of hundreds would be megabytes on every request.
  const focus = pathname.match(/^\/api\/applications\/([^/]+)/)?.[1];
  const sent: Sent[] = applications.map((a) => (a.id === focus ? a : stub(a)));
  const envelope = JSON.stringify({ path, method, json: init?.json, state: { profile, settings, applications: sent } });

  let body: BodyInit = envelope;
  let headers: Record<string, string> | undefined = { "Content-Type": "application/json" };
  const file = init?.form?.get("file");
  if (file instanceof File) {
    if (file.size + envelope.length > MAX_REQUEST_BYTES) throw new Error("That file is too large for the website (4 MB limit). Export a smaller PDF and try again.");
    const form = new FormData();
    form.append("envelope", envelope);
    form.append("file", file);
    body = form;
    headers = undefined;
  } else if (envelope.length > MAX_REQUEST_BYTES) {
    throw new Error("That's too much to send in one go. Shorten the text and try again.");
  }

  const res = await fetch("/api/hosted", { method: "POST", headers, body });
  const reply = (await res.json().catch(() => null)) as Reply | null;
  if (!reply || typeof reply.status !== "number") {
    throw new Error(res.status === 413 ? "That was too large to send." : `The server couldn't be reached properly (${res.status}). Try again.`);
  }

  // Keep whatever changed, even when the call failed (a failed AI request can still have used some allowance).
  const state = reply.state ?? {};
  if (state.profile) await set("profile", state.profile);
  if (state.settings) await set("settings", state.settings);
  let latest = applications;
  if (state.applications) {
    // Another call may have finished while this one was in flight, so merge against what's stored now.
    latest = (await get<Application[]>("applications")) ?? [];
    const byId = new Map(latest.map((a) => [a.id, a]));
    const sentIds = new Set(sent.map((a) => a.id));
    const merged = state.applications.map((a) => (isStub(a) ? byId.get(a.id) : (a as Application))).filter((a): a is Application => Boolean(a));
    latest = [...latest.filter((a) => !sentIds.has(a.id)), ...merged];
    await set("applications", latest);
  }

  const data = reply.data as { error?: string; application?: unknown } | null;
  if (reply.status >= 400) throw new Error(data?.error ?? `Request failed (${reply.status})`);
  // "This job is already saved" comes back as a stub; hand the page the real thing.
  if (data && isStub(data.application)) {
    const id = data.application.id;
    data.application = latest.find((a) => a.id === id);
  }
  return data as T;
}

// ---- Backup, restore, erase -------------------------------------------------------

export async function exportData(): Promise<string> {
  const [profile, settings, applications] = await Promise.all([get("profile"), get("settings"), get("applications")]);
  return JSON.stringify({ app: "JobApply", version: 1, savedAt: new Date().toISOString(), profile, settings, applications: applications ?? [] }, null, 2);
}

export async function importData(text: string): Promise<void> {
  let backup: { app?: string; profile?: unknown; settings?: unknown; applications?: unknown };
  try {
    backup = JSON.parse(text);
  } catch {
    throw new Error("That file isn't a JobApply backup.");
  }
  if (backup?.app !== "JobApply" || !Array.isArray(backup.applications)) throw new Error("That file isn't a JobApply backup.");
  await set("profile", backup.profile ?? {});
  await set("settings", backup.settings ?? {});
  await set("applications", backup.applications);
}

export async function eraseData(): Promise<void> {
  await set("profile", {});
  await set("settings", {});
  await set("applications", []);
}

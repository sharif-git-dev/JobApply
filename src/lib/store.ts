import { AsyncLocalStorage } from "node:async_hooks";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DEFAULT_PROVIDER } from "./ai/providers";
import { HOSTED } from "./mode";
import { EMPTY_PROFILE, type Application, type Profile, type Settings } from "./types";

/**
 * Where data lives depends on the mode (see ./mode.ts).
 *
 * Local: plain JSON files under ./data (gitignored). Single user, single
 * machine — a file per collection is all this needs.
 *
 * Hosted: handlers read and change an isolated request copy. With accounts,
 * the gateway loads that copy from the verified user's encrypted database row
 * and saves changes back there. Legacy browser mode sends its own copy.
 */
export const DATA_DIR = process.env.JOBAPPLY_DATA_DIR || path.join(process.cwd(), "data");

// Survive dev-mode module reloads so two writers never interleave.
const g = globalThis as unknown as {
  __jobapplyLocks?: Map<string, Promise<unknown>>;
  __jobapplyCache?: Map<string, { at: number; value: unknown }>;
};
const locks = (g.__jobapplyLocks ??= new Map());

// ---- Hosted mode: per-request data ------------------------------------------

interface RequestData {
  data: Record<string, unknown>;
  changed: Set<string>;
}

const requestData = new AsyncLocalStorage<RequestData>();

/**
 * Run a handler against one visitor's data. Resolves with the handler's result
 * and the collections it changed, so only those are sent back to the browser.
 */
export async function withVisitorData<T>(data: Record<string, unknown>, fn: () => Promise<T>): Promise<{ result: T; changed: Record<string, unknown> }> {
  const ctx: RequestData = { data: { ...data }, changed: new Set() };
  const result = await requestData.run(ctx, fn);
  return { result, changed: Object.fromEntries([...ctx.changed].map((name) => [name, ctx.data[name]])) };
}

function visitor(): RequestData {
  const ctx = requestData.getStore();
  // Reaching storage outside a visitor's request would mean mixing people's data. Fail loudly instead.
  if (!ctx) throw new Error("Hosted mode: storage was used outside a visitor request.");
  return ctx;
}

// ---- Reading and writing -----------------------------------------------------

function fileFor(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  if (HOSTED) {
    const value = visitor().data[name];
    return value === undefined || value === null ? fallback : (value as T);
  }
  try {
    return JSON.parse(await fs.readFile(fileFor(name), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(name: string, value: unknown) {
  if (HOSTED) {
    const ctx = visitor();
    ctx.data[name] = value;
    ctx.changed.add(name);
    return;
  }
  const file = fileFor(name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Read-modify-write. On disk it is serialized per file; a visitor's request already has its own copy. */
export async function update<T>(name: string, fallback: T, fn: (current: T) => T | Promise<T>): Promise<T> {
  if (HOSTED) {
    const value = await fn(await readJson(name, fallback));
    await writeJson(name, value);
    return value;
  }
  const previous = locks.get(name) ?? Promise.resolve();
  const next = previous
    .catch(() => undefined)
    .then(async () => {
      const value = await fn(await readJson(name, fallback));
      await writeJson(name, value);
      return value;
    });
  locks.set(name, next);
  return next;
}

// ---- Profile ---------------------------------------------------------------

export async function getProfile(): Promise<Profile> {
  const stored = await readJson<Partial<Profile>>("profile", {});
  return { ...EMPTY_PROFILE, ...stored, links: { ...EMPTY_PROFILE.links, ...stored.links } };
}

export function saveProfile(patch: Partial<Profile>): Promise<Profile> {
  return update<Profile>("profile", EMPTY_PROFILE, (current) => ({
    ...EMPTY_PROFILE,
    ...current,
    ...patch,
    links: { ...EMPTY_PROFILE.links, ...current.links, ...patch.links },
  }));
}

// ---- Applications ----------------------------------------------------------

export function getApplications(): Promise<Application[]> {
  return readJson<Application[]>("applications", []);
}

export async function getApplication(id: string): Promise<Application | undefined> {
  return (await getApplications()).find((a) => a.id === id);
}

export async function updateApplication(
  id: string,
  fn: (app: Application) => Application,
): Promise<Application | undefined> {
  let result: Application | undefined;
  await update<Application[]>("applications", [], (apps) =>
    apps.map((a) => {
      if (a.id !== id) return a;
      result = { ...fn(a), updatedAt: new Date().toISOString() };
      return result;
    }),
  );
  return result;
}

// ---- Settings --------------------------------------------------------------

export const DEFAULT_SETTINGS: Settings = {
  aiProvider: DEFAULT_PROVIDER,
  aiKeys: {},
  aiModels: {},
  aiBaseUrls: {},
  budgetUsd: 5,
  spentUsd: 0,
  usage: [],
  sourceConfig: {},
  disabledSources: [],
  watchlist: [],
};

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>("settings", {})) };
}

export function saveSettings(fn: (current: Settings) => Settings): Promise<Settings> {
  return update<Settings>("settings", DEFAULT_SETTINGS, (current) => fn({ ...DEFAULT_SETTINGS, ...current }));
}

// ---- Cache (job board responses) -------------------------------------------

const memoryCache = (g.__jobapplyCache ??= new Map());
const MEMORY_CACHE_ENTRIES = 300;

/**
 * Job boards are shared, public data, so their responses are cached for
 * everyone: on disk locally, in memory on a hosted server (which has no disk
 * to keep). Never use this for anything that belongs to one visitor.
 */
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  if (HOSTED) {
    const hit = memoryCache.get(key);
    if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
    const value = await load();
    if (memoryCache.size >= MEMORY_CACHE_ENTRIES) memoryCache.delete(memoryCache.keys().next().value as string);
    memoryCache.set(key, { at: Date.now(), value });
    return value;
  }
  const name = path.join("cache", key.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 120));
  const hit = await readJson<{ at: number; value: T } | null>(name, null);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  await writeJson(name, { at: Date.now(), value });
  return value;
}

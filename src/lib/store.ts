import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EMPTY_PROFILE, type Application, type Profile, type Settings } from "./types";

/**
 * Everything the app knows lives in plain JSON files under ./data (gitignored).
 * Single user, single machine — a file per collection is all this needs.
 */
export const DATA_DIR = process.env.JOBAPPLY_DATA_DIR || path.join(process.cwd(), "data");

// Survive dev-mode module reloads so two writers never interleave.
const g = globalThis as unknown as { __jobapplyLocks?: Map<string, Promise<unknown>> };
const locks = (g.__jobapplyLocks ??= new Map());

function fileFor(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

export async function readJson<T>(name: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(fileFor(name), "utf8")) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw err;
  }
}

async function writeJson(name: string, value: unknown) {
  const file = fileFor(name);
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, file);
}

/** Read-modify-write, serialized per file. */
export async function update<T>(name: string, fallback: T, fn: (current: T) => T | Promise<T>): Promise<T> {
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
  anthropicApiKey: "",
  model: "claude-opus-5-5",
  budgetUsd: 5,
  spentUsd: 0,
  usage: [],
  adzunaAppId: "",
  adzunaAppKey: "",
  adzunaCountry: "us",
  watchlist: [],
};

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...(await readJson<Partial<Settings>>("settings", {})) };
}

export function saveSettings(fn: (current: Settings) => Settings): Promise<Settings> {
  return update<Settings>("settings", DEFAULT_SETTINGS, (current) => fn({ ...DEFAULT_SETTINGS, ...current }));
}

// ---- Cache (job board responses) -------------------------------------------

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const name = path.join("cache", key.replace(/[^a-z0-9_-]+/gi, "_").slice(0, 120));
  const hit = await readJson<{ at: number; value: T } | null>(name, null);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value;
  const value = await load();
  await writeJson(name, { at: Date.now(), value });
  return value;
}

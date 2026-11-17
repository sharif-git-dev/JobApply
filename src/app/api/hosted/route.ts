import { NextResponse } from "next/server";
import { z } from "zod";
import * as aiModels from "@/app/api/ai/models/route";
import * as aiTest from "@/app/api/ai/test/route";
import * as application from "@/app/api/applications/[id]/route";
import * as generate from "@/app/api/applications/[id]/generate/route";
import * as applications from "@/app/api/applications/route";
import * as jobImport from "@/app/api/jobs/import/route";
import * as jobSearch from "@/app/api/jobs/search/route";
import * as profile from "@/app/api/profile/route";
import * as resume from "@/app/api/resume/route";
import * as settings from "@/app/api/settings/route";
import { HOSTED } from "@/lib/mode";
import { DEFAULT_SETTINGS, withVisitorData } from "@/lib/store";
import { ACCOUNTS_ENABLED } from "@/lib/auth/config";
import { AccountBackup } from "@/lib/auth/backup";
import { AccountError, loadAccount, saveAccount, type Account } from "@/lib/auth/server";

/**
 * The one door into the hosted website's server.
 *
 * With Supabase connected, each call is authenticated and runs against that
 * user's encrypted account row. Until connected, the legacy browser-storage
 * envelope is still supported. Both use the same existing route handlers.
 */

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const h = (fn: unknown) => fn as Handler;

const ROUTES: { pattern: RegExp; handlers: Partial<Record<string, Handler>> }[] = [
  { pattern: /^\/api\/profile$/, handlers: { GET: h(profile.GET), PUT: h(profile.PUT) } },
  { pattern: /^\/api\/resume$/, handlers: { POST: h(resume.POST) } },
  { pattern: /^\/api\/jobs\/search$/, handlers: { GET: h(jobSearch.GET) } },
  { pattern: /^\/api\/jobs\/import$/, handlers: { POST: h(jobImport.POST) } },
  { pattern: /^\/api\/applications$/, handlers: { GET: h(applications.GET), POST: h(applications.POST) } },
  { pattern: /^\/api\/applications\/([^/]+)$/, handlers: { GET: h(application.GET), PATCH: h(application.PATCH), DELETE: h(application.DELETE) } },
  { pattern: /^\/api\/applications\/([^/]+)\/generate$/, handlers: { POST: h(generate.POST) } },
  { pattern: /^\/api\/settings$/, handlers: { GET: h(settings.GET), PUT: h(settings.PUT) } },
  { pattern: /^\/api\/ai\/models$/, handlers: { GET: h(aiModels.GET) } },
  { pattern: /^\/api\/ai\/test$/, handlers: { POST: h(aiTest.POST) } },
];

const Envelope = z.object({
  path: z.string().max(2000).startsWith("/api/"),
  method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
  json: z.unknown().optional(),
  state: z.object({
    profile: z.record(z.string(), z.unknown()).optional(),
    settings: z.record(z.string(), z.unknown()).optional(),
    applications: z.array(z.record(z.string(), z.unknown())).max(5000).optional(),
  }).default({}),
});

// ---- A light brake on abuse ---------------------------------------------------
// Each visitor uses their own AI keys, but job searches and link imports run on
// this server. Cap how fast one address can call it.

const WINDOW_MS = 5 * 60_000;
const MAX_CALLS = 240;
const calls = new Map<string, number[]>();

function tooMany(request: Request): boolean {
  const ip = (request.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const now = Date.now();
  const recent = (calls.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  calls.set(ip, recent);
  if (calls.size > 5000) calls.delete(calls.keys().next().value as string);
  return recent.length > MAX_CALLS;
}

const reply = (status: number, data: unknown, state: Record<string, unknown> = {}) => NextResponse.json({ status, data, state }, { headers: { "Cache-Control": "private, no-store" } });

async function handle(request: Request) {
  if (!HOSTED) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (tooMany(request)) return reply(429, { error: "Too many requests from your connection. Wait a few minutes and try again." });
  // Verify before reading a file or accepting any user data. Anonymous calls cannot use accounts.
  const account = ACCOUNTS_ENABLED ? await loadAccount(request) : null;

  // An upload arrives as a form (the file plus the envelope); everything else as JSON.
  let raw: unknown;
  let file: File | null = null;
  try {
    if ((request.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await request.formData();
      raw = JSON.parse(String(form.get("envelope") ?? "{}"));
      const upload = form.get("file");
      file = upload instanceof File ? upload : null;
    } else {
      raw = await request.json();
    }
  } catch {
    return reply(400, { error: "The request couldn't be read." });
  }
  const parsed = Envelope.safeParse(raw);
  if (!parsed.success) return reply(400, { error: "The request was malformed." });
  const { path, method, json, state } = parsed.data;

  if (account && path.startsWith("/api/account/")) return accountAction(account, path, method, json);

  const url = new URL(path, "http://jobapply.internal");
  let handler: Handler | undefined;
  let params: Record<string, string> = {};
  for (const route of ROUTES) {
    const match = route.pattern.exec(url.pathname);
    if (match) {
      handler = route.handlers[method];
      if (match[1]) params = { id: decodeURIComponent(match[1]) };
      break;
    }
  }
  if (!handler) return reply(404, { error: "That action isn't available." });

  let inner: Request;
  if (file) {
    const form = new FormData();
    form.append("file", file);
    inner = new Request(url, { method, body: form });
  } else {
    inner = new Request(url, {
      method,
      headers: json === undefined ? undefined : { "Content-Type": "application/json" },
      body: json === undefined ? undefined : JSON.stringify(json),
    });
  }

  const run = handler;
  // In account mode all data is loaded from the authenticated user's row. Client-supplied state is ignored.
  const { result, changed } = await withVisitorData(account?.state ?? state, async () => {
    const res = await run(inner, { params: Promise.resolve(params) });
    return { status: res.status, data: (await res.json().catch(() => null)) as unknown };
  });
  if (account) {
    if (Object.keys(changed).length) await saveAccount(account, { ...account.state, ...changed });
    // Settings contain provider keys. They stay encrypted in the database and never return in the response state.
    return reply(result.status, result.data);
  }
  return reply(result.status, result.data, changed);
}

async function accountAction(account: Account, path: string, method: string, json: unknown) {
  if (path === "/api/account/export" && method === "GET") {
    const settings = { ...DEFAULT_SETTINGS, ...(account.state.settings as object) };
    // Backups exclude credentials by default; the user can reconnect providers after restoring.
    settings.aiKeys = {};
    settings.sourceConfig = {};
    return reply(200, { app: "JobApply", version: 1, savedAt: new Date().toISOString(), profile: account.state.profile ?? {}, applications: account.state.applications ?? [], settings });
  }
  if (path === "/api/account/import" && method === "POST") {
    const parsed = AccountBackup.safeParse(json);
    if (!parsed.success) return reply(400, { error: "That backup contains invalid or unsupported JobApply data." });
    await saveAccount(account, { profile: parsed.data.profile, settings: { ...DEFAULT_SETTINGS, ...parsed.data.settings, usage: [] }, applications: parsed.data.applications });
    return reply(200, { ok: true });
  }
  if (path === "/api/account/erase" && method === "DELETE") {
    await saveAccount(account, {});
    return reply(200, { ok: true });
  }
  return reply(404, { error: "That action isn't available." });
}

export async function POST(request: Request) {
  try { return await handle(request); }
  catch (error) {
    if (error instanceof AccountError) return reply(error.status, { error: error.message });
    // Do not log account state, tokens, credentials or database responses.
    return reply(503, { error: "Your account could not be loaded or saved. Please try again. If it keeps happening, contact the app owner." });
  }
}

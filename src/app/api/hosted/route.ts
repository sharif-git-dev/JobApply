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
import { withVisitorData } from "@/lib/store";

/**
 * The one door into the hosted website's server.
 *
 * A visitor's browser holds all of their data. Each call arrives as an
 * envelope: which API route to run, plus the slices of that visitor's data the
 * route needs. The ordinary route handler runs against that copy, and the reply
 * carries its result along with whatever it changed, for the browser to save.
 * The server remembers nothing between calls.
 */

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
const h = (fn: unknown) => fn as Handler;

const ROUTES: { pattern: RegExp; handlers: Partial<Record<string, Handler>> }[] = [
  { pattern: /^\/api\/profile$/, handlers: { GET: h(profile.GET), PUT: h(profile.PUT) } },
  { pattern: /^\/api\/resume$/, handlers: { POST: h(resume.POST) } },
  { pattern: /^\/api\/jobs\/search$/, handlers: { GET: h(jobSearch.GET) } },
  { pattern: /^\/api\/jobs\/import$/, handlers: { POST: h(jobImport.POST) } },
  { pattern: /^\/api\/applications$/, handlers: { POST: h(applications.POST) } },
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
  }),
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

const reply = (status: number, data: unknown, state: Record<string, unknown> = {}) => NextResponse.json({ status, data, state });

export async function POST(request: Request) {
  if (!HOSTED) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (tooMany(request)) return reply(429, { error: "Too many requests from your connection. Wait a few minutes and try again." });

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
  const { result, changed } = await withVisitorData(state, async () => {
    const res = await run(inner, { params: Promise.resolve(params) });
    return { status: res.status, data: (await res.json().catch(() => null)) as unknown };
  });
  return reply(result.status, result.data, changed);
}

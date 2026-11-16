import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import net from "node:net";
import { decodeEntities, htmlToText } from "../html";
import type { Job } from "../types";
import { ashbyBoard, greenhouseBoard, leverBoard } from "./sources";

export class ImportError extends Error {}

const hash = (s: string) => createHash("sha1").update(s).digest("hex").slice(0, 16);

function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  const v6 = ip.toLowerCase();
  return v6 === "::1" || v6.startsWith("fc") || v6.startsWith("fd") || v6.startsWith("fe80") || v6.startsWith("::ffff:");
}

/** The importer fetches whatever URL the user pastes — keep it pointed at the public web. */
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new ImportError("That doesn't look like a link. Paste the full address, starting with https://");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new ImportError("Only http(s) links can be imported.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = net.isIP(host) ? [host] : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (!addresses.length) throw new ImportError("Couldn't find that site. Check the link.");
  if (addresses.some(isPrivateAddress)) throw new ImportError("That link points to a private network address.");
  return url;
}

/** Use the applicant-tracking system's own API when the link is one we recognise. */
async function fromKnownAts(url: URL): Promise<Job | null> {
  const path = url.pathname.split("/").filter(Boolean);
  const host = url.hostname;

  if (/greenhouse\.io$/.test(host) && path[1] === "jobs" && path[2]) {
    return (await greenhouseBoard(path[0])).find((j) => j.id.endsWith(`:${path[2]}`)) ?? null;
  }
  const ghJid = url.searchParams.get("gh_jid");
  const ghBoard = url.searchParams.get("for") ?? url.searchParams.get("board");
  if (ghJid && ghBoard) return (await greenhouseBoard(ghBoard)).find((j) => j.id.endsWith(`:${ghJid}`)) ?? null;

  if (host === "jobs.lever.co" && path[1]) {
    return (await leverBoard(path[0])).find((j) => j.id.endsWith(`:${path[1]}`)) ?? null;
  }
  if (host === "jobs.ashbyhq.com" && path[1]) {
    return (await ashbyBoard(path[0])).find((j) => j.id.endsWith(`:${path[1]}`)) ?? null;
  }
  return null;
}

type Json = Record<string, unknown>;
const s = (v: unknown) => (typeof v === "string" ? decodeEntities(v).trim() : "");

function findJobPosting(node: unknown): Json | null {
  if (!node || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const hit = findJobPosting(n);
      if (hit) return hit;
    }
    return null;
  }
  const obj = node as Json;
  const type = obj["@type"];
  if (type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"))) return obj;
  return findJobPosting(obj["@graph"]);
}

function locationFromPosting(posting: Json): string {
  const first = (v: unknown): Json | null => (Array.isArray(v) ? first(v[0]) : v && typeof v === "object" ? (v as Json) : null);
  const address = first(first(posting.jobLocation)?.address);
  const parts = address ? [s(address.addressLocality), s(address.addressRegion), s(address.addressCountry)] : [];
  return parts.filter(Boolean).join(", ");
}

async function fromWebPage(url: URL): Promise<Job> {
  let html: string;
  try {
    // Follow redirects by hand so every hop is re-checked against private addresses.
    let current = url;
    let res: Response;
    for (let hop = 0; ; hop++) {
      res = await fetch(current, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml",
        },
        redirect: "manual",
        signal: AbortSignal.timeout(20_000),
      });
      const next = res.status >= 300 && res.status < 400 ? res.headers.get("location") : null;
      if (!next) break;
      if (hop >= 5) throw new Error("too many redirects");
      current = await assertPublicUrl(new URL(next, current).href);
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    html = (await res.text()).slice(0, 3_000_000);
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError(
      `That site wouldn't let the page be read (${(err as Error).message}). Copy the job description and use "Paste a job" instead.`,
    );
  }

  let posting: Json | null = null;
  for (const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      posting = findJobPosting(JSON.parse(m[1]));
    } catch {
      // Malformed structured data is common; fall through to the page text.
    }
    if (posting) break;
  }

  const pageTitle = s(html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1]) ||
    htmlToText(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "");
  const siteName = s(html.match(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i)?.[1]);

  const body = html.match(/<(main|article)\b[\s\S]*<\/\1>/i)?.[0] ?? html.match(/<body\b[\s\S]*<\/body>/i)?.[0] ?? html;
  const description = posting ? htmlToText(s(posting.description)) : htmlToText(body).slice(0, 20_000);
  if (description.length < 200) {
    throw new ImportError(
      'That page needs a login or loads its content with JavaScript, so there was nothing to read. Copy the job description and use "Paste a job" instead.',
    );
  }

  const org = posting?.hiringOrganization;
  const company = (org && typeof org === "object" ? s((org as Json).name) : s(org)) || siteName || url.hostname.replace(/^www\./, "");
  const location = posting ? locationFromPosting(posting) : "";
  const remote = (posting && s(posting.jobLocationType).toUpperCase() === "TELECOMMUTE") || /\bremote\b/i.test(`${pageTitle} ${location}`);

  return {
    id: `web:${hash(url.href)}`,
    source: "web",
    title: (posting && s(posting.title)) || pageTitle || "Untitled role",
    company,
    location: location || (remote ? "Remote" : ""),
    remote,
    url: url.href,
    applyUrl: url.href,
    description,
    tags: [],
    salary: "",
    jobType: posting ? s(posting.employmentType).replace(/_/g, " ").toLowerCase() : "",
    postedAt: posting && s(posting.datePosted) ? new Date(s(posting.datePosted)).toISOString() : "",
  };
}

export async function importJobFromUrl(raw: string): Promise<Job> {
  const url = await assertPublicUrl(raw);
  const known = await fromKnownAts(url).catch(() => null);
  return known ?? fromWebPage(url);
}

export function jobFromPastedText(input: { title: string; company: string; location: string; url: string; description: string }): Job {
  const description = input.description.trim();
  if (description.length < 40) throw new ImportError("Paste the full job description — it's what everything gets tailored to.");
  const title = input.title.trim() || description.split("\n")[0].slice(0, 100);
  const url = /^https?:\/\//i.test(input.url.trim()) ? input.url.trim() : "";
  const location = input.location.trim();
  return {
    id: `manual:${hash(`${title}|${input.company}|${description.slice(0, 500)}`)}`,
    source: "manual",
    title,
    company: input.company.trim(),
    location,
    remote: /\bremote\b/i.test(`${title} ${location}`),
    url,
    applyUrl: url,
    description,
    tags: [],
    salary: "",
    jobType: "",
    postedAt: "",
  };
}

import { fixMojibake, htmlToText } from "../html";
import { cached } from "../store";
import type { Job, SearchQuery, Settings, WatchlistEntry } from "../types";

/**
 * Every source here is a free, public job API. The keyless ones work out of the
 * box; Adzuna (location-based, non-remote jobs) needs a free developer key.
 * Responses are cached on disk so we stay well inside each board's fair-use
 * limits (Remotive asks for only a handful of requests a day).
 */

const UA = "JobApply/1.0 (personal job search tool)";
const MINUTES = 60_000;

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/json" },
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

const str = (v: unknown): string => (typeof v === "string" ? v.trim() : typeof v === "number" ? String(v) : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

function iso(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const d = typeof v === "number" ? new Date(v < 1e12 ? v * 1000 : v) : new Date(String(v));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

function money(min: unknown, max: unknown, currency = "", period = ""): string {
  const lo = Number(min) || 0;
  const hi = Number(max) || 0;
  if (!lo && !hi) return "";
  const fmt = (n: number) => (n >= 1000 ? `${Math.round(n / 1000)}k` : String(n));
  const range = lo && hi && lo !== hi ? `${fmt(lo)}–${fmt(hi)}` : fmt(lo || hi);
  // A symbol hugs the number; a currency code gets a space.
  const amount = /^[^a-z]$/i.test(currency) ? `${currency}${range}` : [currency, range].filter(Boolean).join(" ");
  return period && period !== "yearly" && period !== "annual" ? `${amount} /${period}` : amount;
}

const looksRemote = (...parts: string[]) => /\bremote\b|work from home|anywhere|worldwide/i.test(parts.join(" "));

type Raw = Record<string, unknown>;

/** Lever and Ashby don't return the company name — derive it from the board address. */
const companyFromSlug = (slug: string) => slug.split(/[-_]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

function job(source: string, id: unknown, fields: Omit<Job, "id" | "source">): Job {
  return { id: `${source}:${str(id)}`, source, ...fields };
}

// ---- Keyless remote boards ---------------------------------------------------

async function remotive(q: SearchQuery): Promise<Job[]> {
  const url = `https://remotive.com/api/remote-jobs?limit=60${q.q ? `&search=${encodeURIComponent(q.q)}` : ""}`;
  const data = await cached(`remotive-${q.q.toLowerCase()}`, 120 * MINUTES, () => getJson<{ jobs: Raw[] }>(url));
  return (data.jobs ?? []).map((j) =>
    job("remotive", j.id, {
      title: str(j.title),
      company: str(j.company_name),
      location: str(j.candidate_required_location) || "Remote",
      remote: true,
      url: str(j.url),
      applyUrl: str(j.url),
      description: htmlToText(str(j.description)),
      tags: list(j.tags),
      salary: str(j.salary),
      jobType: str(j.job_type).replace(/_/g, " "),
      postedAt: iso(j.publication_date),
    }),
  );
}

async function remoteok(): Promise<Job[]> {
  const data = await cached("remoteok-all", 60 * MINUTES, () => getJson<Raw[]>("https://remoteok.com/api"));
  return data
    .filter((j) => j.id && j.position)
    .map((j) =>
      job("remoteok", j.id, {
        title: fixMojibake(str(j.position)),
        company: fixMojibake(str(j.company)),
        location: fixMojibake(str(j.location)) || "Remote",
        remote: true,
        url: str(j.url),
        applyUrl: str(j.apply_url) || str(j.url),
        description: fixMojibake(htmlToText(str(j.description))),
        tags: list(j.tags),
        salary: money(j.salary_min, j.salary_max, "$"),
        jobType: "",
        postedAt: iso(j.date),
      }),
    );
}

async function jobicy(q: SearchQuery): Promise<Job[]> {
  const url = `https://jobicy.com/api/v2/remote-jobs?count=50${q.q ? `&tag=${encodeURIComponent(q.q)}` : ""}`;
  const data = await cached(`jobicy-${q.q.toLowerCase()}`, 60 * MINUTES, () => getJson<{ jobs?: Raw[] }>(url));
  return (data.jobs ?? []).map((j) =>
    job("jobicy", j.id, {
      title: htmlToText(str(j.jobTitle)),
      company: htmlToText(str(j.companyName)),
      location: str(j.jobGeo).replace(/\s+/g, " ") || "Remote",
      remote: true,
      url: str(j.url),
      applyUrl: str(j.url),
      description: htmlToText(str(j.jobDescription) || str(j.jobExcerpt)),
      tags: [...list(j.jobIndustry).map(htmlToText), str(j.jobLevel)].filter(Boolean),
      salary: money(j.salaryMin, j.salaryMax, str(j.salaryCurrency), str(j.salaryPeriod)),
      jobType: list(j.jobType).join(", "),
      postedAt: iso(j.pubDate),
    }),
  );
}

async function himalayas(q: SearchQuery): Promise<Job[]> {
  const url = q.q
    ? `https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q.q)}`
    : "https://himalayas.app/jobs/api?limit=20";
  const data = await cached(`himalayas-${q.q.toLowerCase()}`, 60 * MINUTES, () => getJson<{ jobs?: Raw[] }>(url));
  return (data.jobs ?? []).map((j) =>
    job("himalayas", j.guid, {
      title: str(j.title),
      company: str(j.companyName),
      location: list(j.locationRestrictions).join(", ") || "Worldwide",
      remote: true,
      url: str(j.guid) || str(j.applicationLink),
      applyUrl: str(j.applicationLink) || str(j.guid),
      description: htmlToText(str(j.description) || str(j.excerpt)),
      tags: [...list(j.categories).map((c) => c.replace(/-/g, " ")), ...list(j.seniority)],
      salary: money(j.minSalary, j.maxSalary, str(j.currency), str(j.salaryPeriod)),
      jobType: str(j.employmentType),
      postedAt: iso(j.pubDate),
    }),
  );
}

// ---- Keyless on-site / hybrid (Europe-heavy) ---------------------------------

async function arbeitnow(): Promise<Job[]> {
  const data = await cached("arbeitnow-all", 60 * MINUTES, () =>
    getJson<{ data: Raw[] }>("https://www.arbeitnow.com/api/job-board-api"),
  );
  return (data.data ?? []).map((j) =>
    job("arbeitnow", j.slug, {
      title: str(j.title),
      company: str(j.company_name),
      location: str(j.location),
      remote: j.remote === true,
      url: str(j.url),
      applyUrl: str(j.url),
      description: htmlToText(str(j.description)),
      tags: list(j.tags),
      salary: "",
      jobType: list(j.job_types).join(", "),
      postedAt: iso(j.created_at),
    }),
  );
}

// ---- Optional: Adzuna (free developer key, real location search) -------------

async function adzuna(q: SearchQuery, settings: Settings): Promise<Job[]> {
  const country = (settings.adzunaCountry || "us").toLowerCase();
  const params = new URLSearchParams({
    app_id: settings.adzunaAppId,
    app_key: settings.adzunaAppKey,
    results_per_page: "50",
    "content-type": "application/json",
  });
  if (q.q) params.set("what", q.q);
  if (q.location) params.set("where", q.location);
  const key = `adzuna-${country}-${q.q}-${q.location}`.toLowerCase();
  const data = await cached(key, 30 * MINUTES, () =>
    getJson<{ results?: Raw[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`),
  );
  return (data.results ?? []).map((j) => {
    const title = htmlToText(str(j.title));
    const location = str((j.location as Raw | undefined)?.display_name);
    const description = htmlToText(str(j.description));
    return job("adzuna", j.id, {
      title,
      company: str((j.company as Raw | undefined)?.display_name),
      location,
      remote: looksRemote(title, location),
      url: str(j.redirect_url),
      applyUrl: str(j.redirect_url),
      description,
      tags: [str((j.category as Raw | undefined)?.label)].filter(Boolean),
      salary: money(j.salary_min, j.salary_max, country === "us" ? "$" : ""),
      jobType: [str(j.contract_time), str(j.contract_type)].filter(Boolean).join(", ").replace(/_/g, " "),
      postedAt: iso(j.created),
    });
  });
}

// ---- Company career pages (Greenhouse / Lever / Ashby public posting APIs) ---

export async function greenhouseBoard(slug: string): Promise<Job[]> {
  const data = await cached(`greenhouse-${slug}`, 60 * MINUTES, () =>
    getJson<{ jobs: Raw[] }>(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(slug)}/jobs?content=true`),
  );
  return (data.jobs ?? []).map((j) => {
    const location = str((j.location as Raw | undefined)?.name);
    return job(`greenhouse-${slug}`, j.id, {
      title: str(j.title),
      company: str(j.company_name) || companyFromSlug(slug),
      location,
      remote: looksRemote(location, str(j.title)),
      url: str(j.absolute_url),
      applyUrl: str(j.absolute_url),
      description: htmlToText(str(j.content)),
      tags: ((j.departments as Raw[] | undefined) ?? []).map((d) => str(d.name)).filter(Boolean),
      salary: "",
      jobType: "",
      postedAt: iso(j.first_published ?? j.updated_at),
    });
  });
}

export async function leverBoard(slug: string): Promise<Job[]> {
  const data = await cached(`lever-${slug}`, 60 * MINUTES, () =>
    getJson<Raw[]>(`https://api.lever.co/v0/postings/${encodeURIComponent(slug)}?mode=json`),
  );
  return (Array.isArray(data) ? data : []).map((j) => {
    const cat = (j.categories as Raw | undefined) ?? {};
    const lists = ((j.lists as Raw[] | undefined) ?? [])
      .map((l) => `${str(l.text)}\n${htmlToText(str(l.content))}`)
      .join("\n\n");
    const location = str(cat.location);
    return job(`lever-${slug}`, j.id, {
      title: str(j.text),
      company: companyFromSlug(slug),
      location,
      remote: str(j.workplaceType) === "remote" || looksRemote(location),
      url: str(j.hostedUrl),
      applyUrl: str(j.applyUrl) || str(j.hostedUrl),
      description: [str(j.descriptionPlain), lists, str(j.additionalPlain)].filter(Boolean).join("\n\n"),
      tags: [str(cat.team), str(cat.department)].filter(Boolean),
      salary: "",
      jobType: str(cat.commitment),
      postedAt: iso(j.createdAt),
    });
  });
}

export async function ashbyBoard(slug: string): Promise<Job[]> {
  const data = await cached(`ashby-${slug}`, 60 * MINUTES, () =>
    getJson<{ jobs: Raw[] }>(
      `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(slug)}?includeCompensation=true`,
    ),
  );
  return (data.jobs ?? [])
    .filter((j) => j.isListed !== false)
    .map((j) => {
      const location = str(j.location);
      return job(`ashby-${slug}`, j.id, {
        title: str(j.title),
        company: companyFromSlug(slug),
        location,
        remote: j.isRemote === true || looksRemote(location),
        url: str(j.jobUrl),
        applyUrl: str(j.applyUrl) || str(j.jobUrl),
        description: str(j.descriptionPlain) || htmlToText(str(j.descriptionHtml)),
        tags: [str(j.department), str(j.team)].filter(Boolean),
        salary: str((j.compensation as Raw | undefined)?.scrapeableCompensationSalarySummary),
        jobType: str(j.employmentType).replace(/([a-z])([A-Z])/g, "$1 $2"),
        postedAt: iso(j.publishedAt),
      });
    });
}

export function boardFor(entry: WatchlistEntry): Promise<Job[]> {
  if (entry.ats === "greenhouse") return greenhouseBoard(entry.slug);
  if (entry.ats === "lever") return leverBoard(entry.slug);
  return ashbyBoard(entry.slug);
}

export interface Source {
  name: string;
  /** True when the board returns everything and we filter by keyword ourselves. */
  bulk: boolean;
  load: () => Promise<Job[]>;
}

export function sourcesFor(q: SearchQuery, settings: Settings): Source[] {
  const sources: Source[] = [
    { name: "Remotive", bulk: false, load: () => remotive(q) },
    { name: "Himalayas", bulk: false, load: () => himalayas(q) },
    { name: "Jobicy", bulk: false, load: () => jobicy(q) },
    { name: "Remote OK", bulk: true, load: remoteok },
    { name: "Arbeitnow", bulk: true, load: arbeitnow },
  ];
  if (settings.adzunaAppId && settings.adzunaAppKey) {
    sources.unshift({ name: "Adzuna", bulk: false, load: () => adzuna(q, settings) });
  }
  for (const entry of settings.watchlist) {
    sources.push({ name: `${entry.slug} (${entry.ats})`, bulk: true, load: () => boardFor(entry) });
  }
  return sources;
}

import { fixMojibake, htmlToText } from "../html";
import { cached } from "../store";
import type { Job, SearchQuery, Settings, WatchlistEntry } from "../types";
import { SOURCES, type SourceInfo } from "./catalog";

/**
 * The loaders behind the catalog in ./catalog.ts. The keyless boards work out
 * of the box; the rest switch on when their key is entered in Settings.
 * Responses are cached on disk so we stay well inside each service's fair-use
 * limits and free allowances (Remotive asks for only a handful of requests a day).
 */

const UA = "JobApply/1.0 (personal job search tool)";
const MINUTES = 60_000;
const HOURS = 60 * MINUTES;

/** A source's fields from Settings: keys and options. */
type Config = Record<string, string>;

async function request(url: string, init: { method?: string; headers?: Record<string, string>; body?: string } = {}): Promise<Response> {
  const res = await fetch(url, {
    method: init.method ?? "GET",
    headers: { "User-Agent": UA, Accept: "application/json", ...init.headers },
    body: init.body,
    signal: AbortSignal.timeout(25_000),
  });
  if (res.status === 401 || res.status === 403) throw new Error("key rejected — check it in Settings");
  if (res.status === 429) throw new Error("allowance used up for now");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res;
}

async function getJson<T>(url: string, init?: Parameters<typeof request>[1]): Promise<T> {
  return (await (await request(url, init)).json()) as T;
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
  const now = Date.now() / 1000;
  return (data.jobs ?? [])
    // Himalayas tells us when a posting closes; skip the ones that already have.
    .filter((j) => !(Number(j.expiryDate) > 0 && Number(j.expiryDate) < now))
    .map((j) =>
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

async function workingNomads(): Promise<Job[]> {
  const data = await cached("workingnomads-all", 2 * HOURS, () => getJson<Raw[]>("https://www.workingnomads.com/api/exposed_jobs/"));
  return (Array.isArray(data) ? data : []).map((j) =>
    job("workingnomads", str(j.url).match(/(\d+)\/?$/)?.[1] ?? j.url, {
      title: str(j.title),
      company: str(j.company_name),
      location: str(j.location) || "Anywhere",
      remote: true,
      url: str(j.url),
      applyUrl: str(j.url),
      description: htmlToText(str(j.description)),
      tags: [str(j.category_name), ...str(j.tags).split(",")].map((t) => t.trim()).filter(Boolean),
      salary: "",
      jobType: "",
      postedAt: iso(j.pub_date),
    }),
  );
}

/** We Work Remotely publishes RSS rather than JSON. Each item's title is "Company: Role". */
async function weWorkRemotely(): Promise<Job[]> {
  const xml = await cached("weworkremotely-rss", 2 * HOURS, async () =>
    (await request("https://weworkremotely.com/remote-jobs.rss", { headers: { Accept: "application/rss+xml, text/xml" } })).text(),
  );
  const tag = (item: string, name: string) => {
    const raw = item.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`))?.[1] ?? "";
    return raw.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
  };
  return xml
    .split("<item>")
    .slice(1)
    .map((item) => {
      const heading = htmlToText(tag(item, "title"));
      const split = heading.indexOf(": ");
      const link = tag(item, "link") || tag(item, "guid");
      return job("weworkremotely", link.split("/").filter(Boolean).pop(), {
        title: split > 0 ? heading.slice(split + 2) : heading,
        company: split > 0 ? heading.slice(0, split) : "",
        location: htmlToText(tag(item, "region")) || "Anywhere",
        remote: true,
        url: link,
        applyUrl: link,
        description: htmlToText(tag(item, "description")),
        tags: [htmlToText(tag(item, "category")), ...htmlToText(tag(item, "skills")).split(",")].map((t) => t.trim()).filter(Boolean),
        salary: "",
        jobType: htmlToText(tag(item, "type")),
        postedAt: iso(tag(item, "pubDate")),
      });
    });
}

// ---- Free with a key -----------------------------------------------------------

const ADZUNA_COUNTRY: Record<string, string> = {
  us: "USA", gb: "UK", ca: "Canada", au: "Australia", de: "Germany", fr: "France", nl: "Netherlands", in: "India", sg: "Singapore",
  nz: "New Zealand", za: "South Africa", br: "Brazil", mx: "Mexico", it: "Italy", es: "Spain", pl: "Poland", at: "Austria", be: "Belgium",
  ch: "Switzerland",
};

async function adzuna(q: SearchQuery, cfg: Config): Promise<Job[]> {
  const country = (cfg.country || "us").toLowerCase();
  const params = new URLSearchParams({
    app_id: cfg.appId,
    app_key: cfg.appKey,
    results_per_page: "50",
    "content-type": "application/json",
  });
  const what = [q.q, q.remoteOnly ? "remote" : ""].filter(Boolean).join(" ");
  if (what) params.set("what", what);
  if (q.location) params.set("where", q.location);
  const data = await cached(`adzuna-${country}-${what}-${q.location}`.toLowerCase(), 30 * MINUTES, () =>
    getJson<{ results?: Raw[] }>(`https://api.adzuna.com/v1/api/jobs/${country}/search/1?${params}`),
  );
  return (data.results ?? []).map((j) => {
    const title = htmlToText(str(j.title));
    const place = str((j.location as Raw | undefined)?.display_name);
    const description = htmlToText(str(j.description));
    return job("adzuna", j.id, {
      title,
      company: str((j.company as Raw | undefined)?.display_name),
      // Adzuna searches one country at a time; say which, so region filtering works.
      location: [place, ADZUNA_COUNTRY[country] ?? country.toUpperCase()].filter(Boolean).join(", "),
      remote: looksRemote(title, place, description.slice(0, 400)),
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

async function usaJobs(q: SearchQuery, cfg: Config): Promise<Job[]> {
  const params = new URLSearchParams({ ResultsPerPage: "50", Fields: "full" });
  if (q.q) params.set("Keyword", q.q);
  if (q.location) params.set("LocationName", q.location);
  if (q.remoteOnly) params.set("RemoteIndicator", "True");
  const data = await cached(`usajobs-${params}`.toLowerCase(), HOURS, () =>
    getJson<{ SearchResult?: { SearchResultItems?: Raw[] } }>(`https://data.usajobs.gov/api/search?${params}`, {
      headers: { "User-Agent": cfg.email, "Authorization-Key": cfg.apiKey },
    }),
  );
  return (data.SearchResult?.SearchResultItems ?? []).map((item) => {
    const d = (item.MatchedObjectDescriptor as Raw | undefined) ?? {};
    const details = ((d.UserArea as Raw | undefined)?.Details as Raw | undefined) ?? {};
    const pay = ((d.PositionRemuneration as Raw[] | undefined) ?? [])[0] ?? {};
    const duties = Array.isArray(details.MajorDuties) ? list(details.MajorDuties).map((x) => `• ${x}`).join("\n") : str(details.MajorDuties);
    const place = str(d.PositionLocationDisplay);
    return job("usajobs", item.MatchedObjectId, {
      title: str(d.PositionTitle),
      company: str(d.OrganizationName),
      location: /united states|, [A-Z]{2}\b/.test(place) ? place : [place, "USA"].filter(Boolean).join(", "),
      remote: q.remoteOnly || looksRemote(place),
      url: str(d.PositionURI),
      applyUrl: list(d.ApplyURI)[0] ?? str(d.PositionURI),
      description: [str(details.JobSummary), duties, str(d.QualificationSummary)].filter(Boolean).join("\n\n"),
      tags: [str(d.DepartmentName)].filter(Boolean),
      salary: money(pay.MinimumRange, pay.MaximumRange, "$", str(pay.RateIntervalCode) === "PH" ? "hour" : ""),
      jobType: str((((d.PositionSchedule as Raw[] | undefined) ?? [])[0] ?? {}).Name),
      postedAt: iso(d.PublicationStartDate),
    });
  });
}

async function reed(q: SearchQuery, cfg: Config): Promise<Job[]> {
  const params = new URLSearchParams({ resultsToTake: "100" });
  const keywords = [q.q, q.remoteOnly ? "remote" : ""].filter(Boolean).join(" ");
  if (keywords) params.set("keywords", keywords);
  if (q.location) params.set("locationName", q.location);
  const data = await cached(`reed-${params}`.toLowerCase(), HOURS, () =>
    getJson<{ results?: Raw[] }>(`https://www.reed.co.uk/api/1.0/search?${params}`, {
      // Reed takes the key as a Basic-auth username with an empty password.
      headers: { Authorization: `Basic ${Buffer.from(`${cfg.apiKey}:`).toString("base64")}` },
    }),
  );
  return (data.results ?? []).map((j) => {
    const title = str(j.jobTitle);
    const place = str(j.locationName);
    const description = htmlToText(str(j.jobDescription));
    const [day, month, year] = str(j.date).split("/");
    return job("reed", j.jobId, {
      title,
      company: str(j.employerName),
      location: [place, "UK"].filter(Boolean).join(", "),
      remote: looksRemote(title, place, description),
      url: str(j.jobUrl),
      applyUrl: str(j.jobUrl),
      description,
      tags: [],
      salary: money(j.minimumSalary, j.maximumSalary, str(j.currency) === "GBP" || !j.currency ? "£" : str(j.currency)),
      jobType: "",
      postedAt: year ? iso(`${year}-${month}-${day}`) : "",
    });
  });
}

async function jooble(q: SearchQuery, cfg: Config): Promise<Job[]> {
  const keywords = [q.q, q.remoteOnly ? "remote" : ""].filter(Boolean).join(" ");
  if (!keywords) return [];
  // The key is part of the address, so keep it out of the cache file's name.
  const data = await cached(`jooble-${keywords}-${q.location}`.toLowerCase(), 24 * HOURS, () =>
    getJson<{ jobs?: Raw[] }>(`https://jooble.org/api/${encodeURIComponent(cfg.apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords, location: q.location }),
    }),
  );
  return (data.jobs ?? []).map((j) => {
    const title = htmlToText(str(j.title));
    const place = str(j.location);
    const description = htmlToText(str(j.snippet));
    return job("jooble", j.id, {
      title,
      company: htmlToText(str(j.company)),
      location: place,
      remote: looksRemote(title, place, description),
      url: str(j.link),
      applyUrl: str(j.link),
      description,
      tags: [],
      salary: str(j.salary),
      jobType: str(j.type),
      postedAt: iso(j.updated),
    });
  });
}

// ---- Free allowance, then paid --------------------------------------------------

/** "4 days ago" → an approximate ISO date. */
function relativeDate(text: string): string {
  const m = text.match(/(\d+)\+?\s*(hour|day|week|month)/i);
  if (!m) return "";
  const unit = { hour: HOURS, day: 24 * HOURS, week: 7 * 24 * HOURS, month: 30 * 24 * HOURS }[m[2].toLowerCase() as "hour"]!;
  return new Date(Date.now() - Number(m[1]) * unit).toISOString();
}

async function serpApi(q: SearchQuery, cfg: Config): Promise<Job[]> {
  const query = [q.q, q.remoteOnly ? "remote" : "", q.location].filter(Boolean).join(" ");
  if (!query) return []; // an empty search would spend a credit on nothing useful
  // Twelve hours of caching: the free plan is 250 searches a month.
  const data = await cached(`serpapi-${query}`.toLowerCase(), 12 * HOURS, () =>
    getJson<{ jobs_results?: Raw[] }>(
      `https://serpapi.com/search?${new URLSearchParams({ engine: "google_jobs", q: query, api_key: cfg.apiKey })}`,
    ),
  );
  return (data.jobs_results ?? []).map((j) => {
    const ext = (j.detected_extensions as Raw | undefined) ?? {};
    const apply = ((j.apply_options as Raw[] | undefined) ?? [])[0];
    const title = str(j.title);
    const place = str(j.location);
    const link = str(apply?.link) || str(j.share_link);
    return job("serpapi", j.job_id, {
      title,
      company: str(j.company_name),
      location: place,
      remote: ext.work_from_home === true || looksRemote(title, place),
      url: link,
      applyUrl: link,
      description: str(j.description),
      tags: [str(j.via)].filter(Boolean),
      salary: str(ext.salary),
      jobType: str(ext.schedule_type),
      postedAt: relativeDate(str(ext.posted_at)),
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

/** How each catalog entry is fetched. `bulk` boards return their whole list; we filter by keyword. */
const LOADERS: Record<string, { bulk: boolean; load: (q: SearchQuery, cfg: Config) => Promise<Job[]> }> = {
  remotive: { bulk: false, load: remotive },
  himalayas: { bulk: false, load: himalayas },
  jobicy: { bulk: false, load: jobicy },
  remoteok: { bulk: true, load: remoteok },
  weworkremotely: { bulk: true, load: weWorkRemotely },
  workingnomads: { bulk: true, load: workingNomads },
  arbeitnow: { bulk: true, load: arbeitnow },
  adzuna: { bulk: false, load: adzuna },
  usajobs: { bulk: false, load: usaJobs },
  reed: { bulk: false, load: reed },
  jooble: { bulk: false, load: jooble },
  serpapi: { bulk: false, load: serpApi },
};

/** A source's saved fields, with catalog defaults filled in. */
export function sourceConfig(settings: Settings, info: SourceInfo): Config {
  const saved = settings.sourceConfig[info.id] ?? {};
  return Object.fromEntries((info.fields ?? []).map((f) => [f.name, (saved[f.name] ?? f.defaultValue ?? "").trim()]));
}

export function sourceConfigured(settings: Settings, info: SourceInfo): boolean {
  const cfg = sourceConfig(settings, info);
  return (info.fields ?? []).every((f) => cfg[f.name]);
}

/** Every source that is switched on and has what it needs. */
export function sourcesFor(q: SearchQuery, settings: Settings): Source[] {
  const sources: Source[] = [];
  for (const info of SOURCES) {
    const loader = LOADERS[info.id];
    if (!loader || !info.integrated) continue;
    if (settings.disabledSources.includes(info.id) || !sourceConfigured(settings, info)) continue;
    const cfg = sourceConfig(settings, info);
    sources.push({ name: info.name, bulk: loader.bulk, load: () => loader.load(q, cfg) });
  }
  for (const entry of settings.watchlist) {
    sources.push({ name: `${companyFromSlug(entry.slug)} careers`, bulk: true, load: () => boardFor(entry) });
  }
  return sources;
}


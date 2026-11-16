/**
 * Every place JobApply can look for jobs, and a few it deliberately can't.
 * Shared by the server and the Settings page — plain data only.
 *
 * Tiers, quotas and prices were checked against each service's own pages in
 * November 2026. "integrated: false" entries are listed so it's clear why
 * they're missing, not because they work.
 */

export type SourceTier = "free" | "free-key" | "freemium" | "premium";

export const SOURCE_TIER_LABEL: Record<SourceTier, string> = {
  free: "Free · no sign-up",
  "free-key": "Free · needs a key",
  freemium: "Free allowance, then paid",
  premium: "Paid or closed",
};

export interface SourceField {
  name: string;
  label: string;
  /** Secrets are write-only: the browser never gets them back. */
  secret: boolean;
  placeholder?: string;
  options?: string[];
  defaultValue?: string;
}

export interface SourceInfo {
  id: string;
  name: string;
  tier: SourceTier;
  /** False for services listed only to explain why they aren't included. */
  integrated: boolean;
  /** What kinds of jobs, where. */
  coverage: string;
  /** What it costs or how much is free. */
  cost: string;
  note?: string;
  site: string;
  signupUrl?: string;
  fields?: SourceField[];
}

const ADZUNA_COUNTRIES = ["us", "gb", "ca", "au", "de", "fr", "nl", "in", "sg", "nz", "za", "br", "mx", "it", "es", "pl", "at", "be", "ch"];

export const SOURCES: SourceInfo[] = [
  // ---- Free, nothing to set up -------------------------------------------------
  {
    id: "remotive",
    name: "Remotive",
    tier: "free",
    integrated: true,
    coverage: "Remote jobs worldwide, mostly tech, marketing and support.",
    cost: "Free public feed.",
    site: "https://remotive.com",
  },
  {
    id: "himalayas",
    name: "Himalayas",
    tier: "free",
    integrated: true,
    coverage: "Remote jobs worldwide across most professions, often with salary ranges.",
    cost: "Free public feed.",
    site: "https://himalayas.app",
  },
  {
    id: "jobicy",
    name: "Jobicy",
    tier: "free",
    integrated: true,
    coverage: "Remote jobs, with region and seniority.",
    cost: "Free public feed.",
    site: "https://jobicy.com",
  },
  {
    id: "remoteok",
    name: "Remote OK",
    tier: "free",
    integrated: true,
    coverage: "Remote jobs, tech-heavy.",
    cost: "Free public feed.",
    site: "https://remoteok.com",
  },
  {
    id: "weworkremotely",
    name: "We Work Remotely",
    tier: "free",
    integrated: true,
    coverage: "Remote jobs: programming, design, marketing, support, sales.",
    cost: "Free public feed.",
    site: "https://weworkremotely.com",
  },
  {
    id: "workingnomads",
    name: "Working Nomads",
    tier: "free",
    integrated: true,
    coverage: "Curated remote jobs across development, marketing, writing and management.",
    cost: "Free public feed.",
    site: "https://www.workingnomads.com",
  },
  {
    id: "arbeitnow",
    name: "Arbeitnow",
    tier: "free",
    integrated: true,
    coverage: "On-site, hybrid and remote jobs, mostly Germany and wider Europe.",
    cost: "Free public feed.",
    site: "https://www.arbeitnow.com",
  },

  // ---- Free with a key -----------------------------------------------------------
  {
    id: "adzuna",
    name: "Adzuna",
    tier: "free-key",
    integrated: true,
    coverage: "Millions of local and on-site listings in 19 countries, with real location search.",
    cost: "Free key, issued instantly, no payment details. Free for personal job search.",
    site: "https://www.adzuna.com",
    signupUrl: "https://developer.adzuna.com/signup",
    fields: [
      { name: "appId", label: "App ID", secret: false },
      { name: "appKey", label: "App key", secret: true },
      { name: "country", label: "Country", secret: false, options: ADZUNA_COUNTRIES, defaultValue: "us" },
    ],
  },
  {
    id: "usajobs",
    name: "USAJOBS",
    tier: "free-key",
    integrated: true,
    coverage: "Every US federal government job announcement.",
    cost: "Free key by request form. The email you register with is sent along with each search.",
    site: "https://www.usajobs.gov",
    signupUrl: "https://developer.usajobs.gov/apirequest/",
    fields: [
      { name: "email", label: "Email you registered with", secret: false, placeholder: "you@example.com" },
      { name: "apiKey", label: "API key", secret: true },
    ],
  },
  {
    id: "reed",
    name: "Reed.co.uk",
    tier: "free-key",
    integrated: true,
    coverage: "UK jobs across all sectors.",
    cost: "Free key on sign-up.",
    site: "https://www.reed.co.uk",
    signupUrl: "https://www.reed.co.uk/developers/jobseeker",
    fields: [{ name: "apiKey", label: "API key", secret: true }],
  },
  {
    id: "jooble",
    name: "Jooble",
    tier: "free-key",
    integrated: true,
    coverage: "A worldwide aggregator of other job sites, all sectors.",
    cost: "Free key by request form. Its request allowance isn't published, so results are cached for a day.",
    site: "https://jooble.org",
    signupUrl: "https://jooble.org/api/about",
    fields: [{ name: "apiKey", label: "API key", secret: true }],
  },

  // ---- Free allowance, then paid --------------------------------------------------
  {
    id: "serpapi",
    name: "Google Jobs (via SerpApi)",
    tier: "freemium",
    integrated: true,
    coverage: "What Google's job search shows: listings gathered from LinkedIn, Indeed, Glassdoor, company sites and more.",
    cost: "250 searches a month free; paid plans start at $25 a month. JobApply caches each search for 12 hours to stretch the allowance.",
    note: "The free plan simply stops at its limit, so it can't run up a bill.",
    site: "https://serpapi.com/google-jobs-api",
    signupUrl: "https://serpapi.com/users/sign_up",
    fields: [{ name: "apiKey", label: "API key", secret: true }],
  },

  // ---- Not included, and why ------------------------------------------------------
  {
    id: "theirstack",
    name: "TheirStack",
    tier: "premium",
    integrated: false,
    coverage: "Postings from company career sites and job boards in 195 countries.",
    cost: "200 free jobs a month (one credit per job returned), then from $49 a month.",
    note: "Not included: the free allowance is about two searches a month.",
    site: "https://theirstack.com",
  },
  {
    id: "linkedin",
    name: "LinkedIn",
    tier: "premium",
    integrated: false,
    coverage: "The largest professional job board.",
    cost: "No public job-search API. Access is for approved partners only.",
    note: "Find the job on LinkedIn, then use “Add a job yourself → Paste a job”. The Google Jobs source above also surfaces many LinkedIn postings.",
    site: "https://www.linkedin.com/jobs",
  },
  {
    id: "indeed",
    name: "Indeed",
    tier: "premium",
    integrated: false,
    coverage: "The largest general job board.",
    cost: "No public job-search API. Access is for approved partners only.",
    note: "Use “Add a job yourself → Paste a job”, or the Google Jobs source above.",
    site: "https://www.indeed.com",
  },
];

export const SOURCE_BY_ID: Record<string, SourceInfo> = Object.fromEntries(SOURCES.map((s) => [s.id, s]));

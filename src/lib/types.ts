export interface ExperienceItem {
  title: string;
  company: string;
  location: string;
  start: string;
  end: string;
  bullets: string[];
}

export interface EducationItem {
  degree: string;
  school: string;
  year: string;
  details: string;
}

export interface SavedAnswer {
  question: string;
  answer: string;
}

export type RemotePreference = "any" | "remote" | "hybrid" | "onsite";

export interface Profile {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  headline: string;
  summary: string;
  links: { linkedin: string; github: string; portfolio: string; other: string };
  skills: string[];
  experience: ExperienceItem[];
  education: EducationItem[];

  // Preferences and the "any other needed information" an application asks for.
  targetRoles: string[];
  preferredLocations: string[];
  remotePreference: RemotePreference;
  workAuthorization: string;
  requiresSponsorship: "" | "yes" | "no";
  salaryExpectation: string;
  noticePeriod: string;
  yearsExperience: string;
  extraInfo: string;
  savedAnswers: SavedAnswer[];

  resumeText: string;
  resumeFileName: string;
  resumeUpdatedAt: string;
}

export const EMPTY_PROFILE: Profile = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  headline: "",
  summary: "",
  links: { linkedin: "", github: "", portfolio: "", other: "" },
  skills: [],
  experience: [],
  education: [],
  targetRoles: [],
  preferredLocations: [],
  remotePreference: "any",
  workAuthorization: "",
  requiresSponsorship: "",
  salaryExpectation: "",
  noticePeriod: "",
  yearsExperience: "",
  extraInfo: "",
  savedAnswers: [],
  resumeText: "",
  resumeFileName: "",
  resumeUpdatedAt: "",
};

export interface Job {
  /** `${source}:${sourceId}` — stable across searches. */
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  remote: boolean;
  /** Listing page. */
  url: string;
  /** Where to actually apply (falls back to url). */
  applyUrl: string;
  /** Plain text only — HTML is stripped at ingestion. */
  description: string;
  tags: string[];
  salary: string;
  jobType: string;
  /** ISO date, or "" when the source doesn't say. */
  postedAt: string;
}

export interface MatchResult {
  score: number;
  matched: string[];
  missing: string[];
}

export interface FitAnalysis {
  score: number;
  summary: string;
  strengths: string[];
  gaps: string[];
  keywords: string[];
  source: "ai" | "keyword";
}

export interface TailoredResume {
  headline: string;
  summary: string;
  skills: string[];
  experience: { title: string; company: string; dates: string; bullets: string[] }[];
  source: "ai" | "keyword";
}

export const STATUSES = ["saved", "applied", "interview", "offer", "rejected"] as const;
export type ApplicationStatus = (typeof STATUSES)[number];

export interface Application {
  id: string;
  job: Job;
  status: ApplicationStatus;
  createdAt: string;
  updatedAt: string;
  appliedAt: string;
  notes: string;
  match: MatchResult;
  fit: FitAnalysis | null;
  coverLetter: string;
  coverLetterSource: "" | "ai" | "template";
  tailoredResume: TailoredResume | null;
  answers: SavedAnswer[];
}

export interface WatchlistEntry {
  ats: "greenhouse" | "lever" | "ashby";
  slug: string;
}

export interface UsageEntry {
  at: string;
  task: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface Settings {
  /** Which AI provider writes for you (an id from lib/ai/providers.ts). */
  aiProvider: string;
  /** Per provider: the API key, the chosen model, and an address override for local/custom ones. */
  aiKeys: Record<string, string>;
  aiModels: Record<string, string>;
  aiBaseUrls: Record<string, string>;
  /** Hard cap on estimated AI spend. The app refuses AI calls that could cross it. */
  budgetUsd: number;
  spentUsd: number;
  usage: UsageEntry[];
  /** Per job source: its key and option fields (see lib/jobs/catalog.ts). */
  sourceConfig: Record<string, Record<string, string>>;
  disabledSources: string[];
  watchlist: WatchlistEntry[];
}

/** One AI provider as the browser sees it — never the raw key. */
export interface PublicProvider {
  id: string;
  /** A key is saved or supplied by the environment (always true for providers that need none). */
  hasKey: boolean;
  keyHint: string;
  keyFromEnv: boolean;
  model: string;
  baseUrl: string;
  /** Everything it needs is filled in. */
  ready: boolean;
}

/** One job source as the browser sees it. Secret fields are reported only as set / not set. */
export interface PublicSource {
  id: string;
  enabled: boolean;
  /** All required fields are filled in (always true for keyless sources). */
  configured: boolean;
  values: Record<string, string>;
  secretsSet: Record<string, boolean>;
}

/** What the browser is allowed to see — never the raw keys. */
export interface PublicSettings {
  aiProvider: string;
  /** The selected provider is fully set up, so AI features will work. */
  aiReady: boolean;
  providers: PublicProvider[];
  budgetUsd: number;
  spentUsd: number;
  usage: UsageEntry[];
  sources: PublicSource[];
  watchlist: WatchlistEntry[];
}

/** Where a remote job must be open to hiring. */
export type RegionFilter = "us-eu" | "us" | "eu" | "any";

export interface SearchQuery {
  q: string;
  location: string;
  remoteOnly: boolean;
  region: RegionFilter;
}

export interface ScoredJob extends Job {
  match: MatchResult;
  saved: boolean;
}

export interface SourceStatus {
  source: string;
  ok: boolean;
  count: number;
  error?: string;
}

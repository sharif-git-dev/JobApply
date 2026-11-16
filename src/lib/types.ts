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
  anthropicApiKey: string;
  model: string;
  /** Hard cap on estimated AI spend. The app refuses AI calls that could cross it. */
  budgetUsd: number;
  spentUsd: number;
  usage: UsageEntry[];
  adzunaAppId: string;
  adzunaAppKey: string;
  adzunaCountry: string;
  watchlist: WatchlistEntry[];
}

/** What the browser is allowed to see — never the raw keys. */
export interface PublicSettings {
  hasApiKey: boolean;
  apiKeyHint: string;
  apiKeyFromEnv: boolean;
  model: string;
  budgetUsd: number;
  spentUsd: number;
  usage: UsageEntry[];
  adzunaAppId: string;
  hasAdzunaKey: boolean;
  adzunaCountry: string;
  watchlist: WatchlistEntry[];
}

export interface SearchQuery {
  q: string;
  location: string;
  remoteOnly: boolean;
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

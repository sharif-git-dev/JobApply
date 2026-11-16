import { canonicalSkill, extractSkills } from "./skills";
import type { Job, MatchResult, Profile } from "./types";

const STOPWORDS = new Set(
  "a an and are as at be by for from in is it of on or the to with we you your our their this that will have has can who what all any more than other into about over per via etc using use used work working team teams role job position company including across within strong ability experience years year skills required requirements preferred plus new make help well also must should able like such".split(
    " ",
  ),
);

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z0-9+#.-]*[a-z0-9+#]|[a-z]/g) ?? []).filter(
    (t) => t.length > 1 && !STOPWORDS.has(t),
  );
}

/** Everything about the candidate that a job can be matched against. */
export function profileText(profile: Profile): string {
  return [
    profile.headline,
    profile.summary,
    profile.skills.join(", "),
    ...profile.experience.flatMap((e) => [e.title, e.company, ...e.bullets]),
    ...profile.education.flatMap((e) => [e.degree, e.school, e.details]),
    profile.extraInfo,
    profile.resumeText,
  ]
    .filter(Boolean)
    .join("\n");
}

export function profileSkills(profile: Profile): Set<string> {
  return new Set([...profile.skills.map(canonicalSkill), ...extractSkills(profileText(profile))]);
}

function titleAffinity(profile: Profile, job: Job): number {
  const wanted = [...profile.targetRoles, profile.headline, ...profile.experience.slice(0, 3).map((e) => e.title)]
    .filter(Boolean)
    .map((t) => new Set(tokenize(t)));
  const title = tokenize(job.title);
  if (!wanted.length || !title.length) return 0;
  let best = 0;
  for (const set of wanted) {
    if (!set.size) continue;
    const hits = title.filter((t) => set.has(t)).length;
    // How much of the role the candidate is after shows up in this job's title.
    best = Math.max(best, hits / Math.max(set.size, Math.min(title.length, 3)));
  }
  return Math.min(1, best);
}

/**
 * Fast, free, explainable fit score. It answers "would a keyword screen pass
 * this resume?" — the AI fit analysis goes deeper when a key is configured.
 */
export function scoreJob(profile: Profile, job: Job, known?: Set<string>): MatchResult {
  const have = known ?? profileSkills(profile);
  const hasProfile = have.size > 0 || profile.resumeText.length > 0;
  if (!hasProfile) return { score: 0, matched: [], missing: [] };

  const wanted = extractSkills(`${job.title}\n${job.tags.join(", ")}\n${job.description}`);
  const matched = wanted.filter((s) => have.has(s));
  const missing = wanted.filter((s) => !have.has(s));
  const title = titleAffinity(profile, job);

  let score: number;
  if (wanted.length === 0) {
    // Nothing recognisable to compare — lean on the title alone, and stay modest.
    score = 35 + title * 40;
  } else {
    const coverage = matched.length / wanted.length;
    // A posting that names one skill shouldn't score 100 on a single hit.
    const confidence = Math.min(1, wanted.length / 5);
    score = 20 + coverage * 50 * (0.6 + 0.4 * confidence) + title * 30;
  }
  return { score: Math.round(Math.max(0, Math.min(100, score))), matched, missing };
}

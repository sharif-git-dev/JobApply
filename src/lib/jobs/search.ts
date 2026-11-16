import { profileSkills, scoreJob, tokenize } from "../match";
import { getApplications, getProfile, getSettings } from "../store";
import type { Job, ScoredJob, SearchQuery, SourceStatus } from "../types";
import { isFresh, regionOk } from "./region";
import { sourcesFor } from "./sources";

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** 0 = irrelevant. Title hits count most, then tags, then the description. */
function relevance(job: Job, tokens: string[], strict: boolean): number {
  if (!tokens.length) return 1;
  const title = ` ${norm(job.title)} `;
  const tags = ` ${norm(job.tags.join(" "))} `;
  const body = ` ${norm(job.description)} `;
  let score = 0;
  let headlineHits = 0;
  for (const t of tokens) {
    const needle = ` ${norm(t)}`;
    if (title.includes(needle)) {
      score += 3;
      headlineHits++;
    } else if (tags.includes(needle)) {
      score += 2;
      headlineHits++;
    } else if (body.includes(needle)) {
      score += 1;
    } else {
      return 0; // every search word has to appear somewhere
    }
  }
  // Boards that dump their whole catalogue need a hit in the title or tags,
  // otherwise "manager" matches every posting that mentions one.
  if (strict && headlineHits === 0) return 0;
  return score / (tokens.length * 3);
}

function locationOk(job: Job, q: SearchQuery): boolean {
  if (q.remoteOnly && !job.remote) return false;
  const want = norm(q.location);
  if (!want) return true;
  const loc = norm(job.location);
  if (loc.includes(want)) return true;
  // A remote job open to everyone satisfies any location.
  return job.remote && (!loc || /worldwide|anywhere|global|remote$/.test(loc));
}

export async function searchJobs(q: SearchQuery): Promise<{ jobs: ScoredJob[]; sources: SourceStatus[] }> {
  const [profile, settings, applications] = await Promise.all([getProfile(), getSettings(), getApplications()]);
  const tokens = tokenize(q.q);
  const now = Date.now();
  const sources = sourcesFor(q, settings);

  const settled = await Promise.allSettled(sources.map((s) => s.load()));
  const statuses: SourceStatus[] = [];
  const ranked: { job: Job; relevance: number }[] = [];
  const seen = new Set<string>();

  settled.forEach((result, i) => {
    const source = sources[i];
    if (result.status === "rejected") {
      statuses.push({ source: source.name, ok: false, count: 0, error: String(result.reason?.message ?? result.reason) });
      return;
    }
    let count = 0;
    for (const job of result.value) {
      if (!job.title || !job.url) continue;
      if (!locationOk(job, q)) continue;
      // A typed location is its own constraint; otherwise keep to the regions asked for.
      if (!q.location && !regionOk(job, q.region)) continue;
      if (!isFresh(job, now)) continue;
      const rel = relevance(job, tokens, source.bulk);
      if (rel === 0) continue;
      const key = `${norm(job.title)}|${norm(job.company)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      ranked.push({ job, relevance: rel });
      count++;
    }
    statuses.push({ source: source.name, ok: true, count });
  });

  const known = profileSkills(profile);
  const savedIds = new Set(applications.map((a) => a.job.id));
  const jobs = ranked
    .map(({ job, relevance: rel }) => {
      const match = scoreJob(profile, job, known);
      const ageDays = job.postedAt ? (now - Date.parse(job.postedAt)) / 86_400_000 : 30;
      // Fit first, then how well it answers the search, with a nudge for fresh postings.
      const rank = match.score + rel * 25 - Math.min(ageDays, 60) * 0.25;
      return { scored: { ...job, match, saved: savedIds.has(job.id) }, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .slice(0, 150)
    .map((r) => r.scored);

  return { jobs, sources: statuses };
}

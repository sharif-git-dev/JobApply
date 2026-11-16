import { extractSkills } from "./skills";
import { scoreJob, tokenize } from "./match";
import type { FitAnalysis, Job, Profile, TailoredResume } from "./types";

/**
 * Key-free versions of the AI features. They're honest about what they are —
 * a solid starting draft built from the profile and keyword overlap — and are
 * labelled as such in the UI.
 */

const list = (items: string[]) =>
  items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")}${items.length > 2 ? "," : ""} and ${items[items.length - 1]}`;

export function keywordFit(profile: Profile, job: Job): FitAnalysis {
  const { score, matched, missing } = scoreJob(profile, job);
  const total = matched.length + missing.length;
  const summary = total
    ? `Your profile covers ${matched.length} of the ${total} skills this posting names. This is a keyword comparison — add an AI key in Settings for a recruiter-style read of the requirements.`
    : "This posting doesn't name skills the keyword matcher recognises, so the score leans on how close the title is to your background.";
  return {
    score,
    summary,
    strengths: matched.length ? [`Skills it asks for that you have: ${list(matched)}.`] : [],
    gaps: missing.length
      ? [`Mentioned in the posting but not in your profile: ${list(missing)}. If you do have any of these, add them to your skills so they count.`]
      : [],
    keywords: matched,
    source: "keyword",
  };
}

/** Order the candidate's bullets by how many of the job's words they share. */
function rankBullets(bullets: string[], jobTokens: Set<string>, jobSkills: Set<string>): string[] {
  return bullets
    .map((b, i) => {
      const hits = tokenize(b).filter((t) => jobTokens.has(t)).length + extractSkills(b).filter((s) => jobSkills.has(s)).length * 3;
      return { b, i, hits };
    })
    .sort((x, y) => y.hits - x.hits || x.i - y.i)
    .map((x) => x.b);
}

export function keywordTailoredResume(profile: Profile, job: Job): TailoredResume {
  const jobText = `${job.title}\n${job.tags.join(" ")}\n${job.description}`;
  const jobSkills = new Set(extractSkills(jobText));
  const jobTokens = new Set(tokenize(jobText));
  const relevant = profile.skills.filter((s) => jobSkills.has(s) || jobTokens.has(s.toLowerCase()));
  const rest = profile.skills.filter((s) => !relevant.includes(s));
  return {
    headline: profile.headline,
    summary: profile.summary,
    skills: [...relevant, ...rest],
    experience: profile.experience.map((e, idx) => ({
      title: e.title,
      company: e.company,
      dates: [e.start, e.end].filter(Boolean).join(" – "),
      bullets: rankBullets(e.bullets, jobTokens, jobSkills).slice(0, idx < 2 ? 5 : 3),
    })),
    source: "keyword",
  };
}

export function templateCoverLetter(profile: Profile, job: Job): string {
  const { matched } = scoreJob(profile, job);
  const jobText = `${job.title}\n${job.description}`;
  const jobSkills = new Set(extractSkills(jobText));
  const jobTokens = new Set(tokenize(jobText));
  const latest = profile.experience[0];
  const company = job.company || "your team";
  const top = matched.slice(0, 4);

  const best = profile.experience
    .flatMap((e) => rankBullets(e.bullets, jobTokens, jobSkills).slice(0, 1).map((b) => ({ b, e })))
    .slice(0, 2);

  const paragraphs: string[] = ["Dear Hiring Team,"];

  const who = profile.headline || latest?.title || "professional";
  const years = profile.yearsExperience ? ` with ${profile.yearsExperience} years of experience` : "";
  paragraphs.push(
    `The ${job.title} role at ${company} lines up closely with my background as a ${who}${years}` +
      (top.length ? `, particularly my work with ${list(top)}.` : "."),
  );

  if (best.length) {
    const lines = best.map(({ b, e }) => {
      const sentence = b.replace(/\.$/, "");
      const lowered = /^[A-Z][a-z]/.test(sentence) ? sentence[0].toLowerCase() + sentence.slice(1) : sentence;
      return `At ${e.company || "my previous company"}, I ${lowered}.`;
    });
    paragraphs.push(lines.join(" "));
  } else if (profile.summary) {
    paragraphs.push(profile.summary);
  }

  paragraphs.push(
    `I'd welcome the chance to talk about how I can contribute to ${company}. Thank you for your time and consideration.`,
  );
  paragraphs.push(`Sincerely,\n${profile.fullName || "[Your name]"}`);
  return paragraphs.join("\n\n");
}

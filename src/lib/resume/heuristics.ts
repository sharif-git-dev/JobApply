import { extractSkills } from "../skills";
import type { EducationItem, ExperienceItem, Profile } from "../types";

/**
 * Key-free resume parsing. It reads the conventions nearly every resume
 * follows (contact block on top, ALL-CAPS-ish section headings, dated roles
 * with bullets). When an AI key is configured the AI parser replaces
 * this; either way the user reviews the result on the Profile page.
 */

const SECTIONS: Record<string, RegExp> = {
  summary: /^(professional\s+)?(summary|profile|objective|about(\s+me)?)$/i,
  experience: /^(professional\s+|work\s+|relevant\s+)?(experience|employment(\s+history)?|work\s+history)$/i,
  education: /^(education|academic\s+background|education\s*(&|and)\s*certifications?)$/i,
  skills: /^(technical\s+|core\s+|key\s+)?(skills|competencies|technologies|tech\s+stack)(\s*(&|and)\s*\w+)?$/i,
  other: /^(projects|certifications?|awards|publications|languages|interests|volunteer(ing)?|references|honors)$/i,
};

const MONTH = "(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\\.?";
const DATE = `(?:${MONTH}\\s+)?(?:19|20)\\d{2}|\\d{1,2}\\/(?:19|20)\\d{2}`;
const DATE_RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|to)\\s*(${DATE}|present|current|now)`, "i");
const BULLET = /^\s*(?:[-•*▪●◦‣·]|\d+[.)])\s+/;

function sectionOf(line: string): string | null {
  const clean = line.replace(/[:\s]+$/, "").trim();
  if (clean.length > 40) return null;
  for (const [name, re] of Object.entries(SECTIONS)) if (re.test(clean)) return name;
  return null;
}

function splitSections(lines: string[]) {
  const out: Record<string, string[]> = { header: [] };
  let current = "header";
  for (const line of lines) {
    const section = sectionOf(line);
    if (section) {
      current = section;
      out[current] ??= [];
    } else {
      out[current].push(line);
    }
  }
  return out;
}

function parseExperience(lines: string[]): ExperienceItem[] {
  const items: ExperienceItem[] = [];
  let header: string[] = [];
  let current: ExperienceItem | null = null;

  const open = (): ExperienceItem => {
    const joined = header.join(" | ");
    const range = joined.match(DATE_RANGE);
    const rest = joined
      .replace(DATE_RANGE, "")
      .replace(/\(\s*\)/g, "")
      .trim();
    // "Title, Company" / "Title at Company" / "Title | Company" / "Title - Company"
    const parts = rest
      .split(/\s+at\s+|\s*\|\s*|\s+[-–—]\s+|,\s+/)
      .map((p) => p.replace(/^[\s,|–—-]+|[\s,|–—-]+$/g, ""))
      .filter(Boolean);
    const item: ExperienceItem = {
      title: parts[0] ?? "",
      company: parts[1] ?? "",
      location: parts.slice(2).join(", "),
      start: range?.[1] ?? "",
      end: range?.[2] ?? "",
      bullets: [],
    };
    items.push(item);
    header = [];
    return item;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(line)) {
      if (header.length || !current) current = open();
      current.bullets.push(line.replace(BULLET, "").trim());
    } else if (current && !header.length && current.bullets.length && /^[a-z]/.test(line)) {
      // A wrapped bullet continues on the next line.
      current.bullets[current.bullets.length - 1] += ` ${line}`;
    } else {
      // A second date range means the previous header was a role with no bullets.
      if (header.length && DATE_RANGE.test(header.join(" ")) && DATE_RANGE.test(line)) current = open();
      header.push(line);
    }
  }
  if (header.length) open();
  return items.filter((i) => i.title || i.company);
}

function parseEducation(lines: string[]): EducationItem[] {
  const items: EducationItem[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (BULLET.test(line)) {
      const last = items[items.length - 1];
      if (last) last.details = [last.details, line.replace(BULLET, "")].filter(Boolean).join("; ");
      continue;
    }
    const year = line.match(/(?:19|20)\d{2}(?!.*(?:19|20)\d{2})/)?.[0] ?? "";
    const rest = line
      .replace(DATE_RANGE, "")
      .replace(new RegExp(`(?:${MONTH}\\s+)?(?:19|20)\\d{2}`, "gi"), "")
      .replace(/\(\s*\)/g, "");
    const parts = rest
      .split(/\s*\|\s*|\s+[-–—]\s+|,\s+/)
      .map((p) => p.replace(/^[\s,|–—-]+|[\s,|–—-]+$/g, ""))
      .filter(Boolean);
    if (!parts.length) continue;
    const schoolIdx = parts.findIndex((p) => /universit|college|institute|school|academy/i.test(p));
    const school = schoolIdx >= 0 ? parts.splice(schoolIdx, 1)[0] : (parts[1] ?? "");
    const degree = schoolIdx >= 0 ? parts.join(", ") : (parts[0] ?? "");
    items.push({ degree, school, year, details: "" });
  }
  return items;
}

function yearsBetween(experience: ExperienceItem[]): string {
  const years = experience
    .map((e) => Number(e.start.match(/(?:19|20)\d{2}/)?.[0]))
    .filter((y) => Number.isFinite(y) && y > 1970);
  if (!years.length) return "";
  const n = new Date().getFullYear() - Math.min(...years);
  return n > 0 && n < 60 ? String(n) : "";
}

export function parseResumeHeuristically(text: string): Partial<Profile> {
  const lines = text.split("\n").map((l) => l.trim());
  const sections = splitSections(lines);
  const top = lines.slice(0, 12).join("\n");

  const email = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0] ?? "";
  const phone =
    top.match(/(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)|\d{2,4})[\s.-]?\d{3,4}[\s.-]?\d{3,4}(?!\d)/)?.[0]?.trim() ?? "";
  // Only things that are unmistakably web addresses — not "Node.js" or the email's domain.
  const urls = [
    ...text.matchAll(
      /(?<![@\w.])(?:https?:\/\/|www\.)?(?:[\w-]+\.)+(?:com|dev|io|me|net|org|app|co|design|ai|tech|page|site)\b(?:\/[^\s|,;)]*)?(?!@)/gi,
    ),
  ].map((m) => m[0].replace(/[.,]+$/, ""));
  const link = (re: RegExp) => urls.find((u) => re.test(u)) ?? "";
  const linkedin = link(/linkedin\.com\//i);
  const github = link(/github\.com\//i);
  const portfolio = urls.find((u) => !/linkedin\.com|github\.com/i.test(u)) ?? "";

  const isContact = (l: string) => /@|https?:|www\.|linkedin|github|\d{3}[\s.-]\d{4}/i.test(l);
  const headerLines = sections.header.filter(Boolean);
  const fullName =
    headerLines.find((l) => !isContact(l) && /^[\p{L}][\p{L}.'’-]*(?:\s+[\p{L}][\p{L}.'’-]*){1,4}$/u.test(l)) ?? "";
  const afterName = headerLines.slice(headerLines.indexOf(fullName) + 1);
  const headline = afterName.find((l) => !isContact(l) && l.length <= 80 && !/\d{4}/.test(l)) ?? "";
  const location = top.match(/\b([A-Z][a-zA-Z.]+(?:\s[A-Z][a-zA-Z.]+)*,\s*(?:[A-Z]{2}|[A-Z][a-z]+(?:\s[A-Z][a-z]+)?))\b/)?.[1] ?? "";

  const experience = parseExperience(sections.experience ?? []);
  const education = parseEducation(sections.education ?? []);

  const listed = (sections.skills ?? [])
    .join("\n")
    .split(/[,;|•·\n]/)
    .map((s) => s.replace(BULLET, "").replace(/^[^:]{2,25}:\s*/, "").trim())
    .filter((s) => s.length > 1 && s.length <= 40);
  const skills = [...new Set([...listed, ...extractSkills(text)])];
  // Prefer the candidate's own spelling; drop dictionary duplicates of it.
  const seen = new Set<string>();
  const dedupedSkills = skills.filter((s) => {
    const key = s.toLowerCase().replace(/[^a-z0-9+#]/g, "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return {
    fullName,
    email,
    phone,
    location,
    headline,
    summary: (sections.summary ?? []).filter(Boolean).join(" "),
    links: { linkedin, github, portfolio, other: "" },
    skills: dedupedSkills,
    experience,
    education,
    yearsExperience: yearsBetween(experience),
  };
}

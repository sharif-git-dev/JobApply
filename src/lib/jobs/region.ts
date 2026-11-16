import type { Job, RegionFilter } from "../types";

/**
 * Remote rarely means "from anywhere": most postings name the countries or
 * regions they can hire in. This reads that restriction so a search can be
 * limited to roles genuinely open to the US and Europe.
 */

export type Region = "us" | "eu" | "world" | "other";

const WORLD = /worldwide|anywhere|global|international|everywhere|any ?where|work from home|all countries|no restriction/;
const JUST_REMOTE = /^(fully |100% )?remote( only| first| job| position)?$/;

const US_WORDS = new Set([
  "usa", "us", "u.s.", "u.s", "u.s.a.", "u.s.a", "united states", "united states of america", "america", "americas", "north america",
  "us only", "usa only", "us remote", "remote us", "remote usa", "us-based", "us based",
  "est", "edt", "pst", "pdt", "cst", "cdt", "mst", "eastern time", "pacific time", "central time", "mountain time",
]);

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC".split(" "),
);

const US_PLACES = new Set(
  [
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado", "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine", "maryland", "massachusetts", "michigan", "minnesota",
    "mississippi", "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey", "new mexico", "new york", "north carolina",
    "north dakota", "ohio", "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina", "south dakota", "tennessee", "texas",
    "utah", "vermont", "virginia", "washington", "west virginia", "wisconsin", "wyoming",
    "new york city", "nyc", "san francisco", "sf", "bay area", "los angeles", "seattle", "austin", "boston", "chicago", "denver", "atlanta",
    "dallas", "houston", "miami", "portland", "san diego", "san jose", "washington dc", "washington d.c.", "philadelphia", "phoenix",
    "minneapolis", "detroit", "nashville", "raleigh", "salt lake city", "pittsburgh", "charlotte", "silicon valley",
  ],
);

const EU_PLACES = new Set(
  [
    "europe", "european union", "eu", "eea", "emea", "uk", "u.k.", "united kingdom", "great britain", "britain", "england", "scotland",
    "wales", "northern ireland", "ireland", "germany", "deutschland", "france", "spain", "portugal", "italy", "netherlands", "the netherlands",
    "belgium", "luxembourg", "austria", "switzerland", "sweden", "norway", "denmark", "finland", "iceland", "poland", "czech republic",
    "czechia", "slovakia", "hungary", "romania", "bulgaria", "greece", "croatia", "slovenia", "serbia", "estonia", "latvia", "lithuania",
    "ukraine", "malta", "cyprus", "dach", "nordics", "scandinavia", "benelux", "western europe", "eastern europe", "central europe",
    "cet", "cest", "gmt", "bst", "eet",
    "london", "manchester", "edinburgh", "dublin", "berlin", "munich", "münchen", "hamburg", "frankfurt", "frankfurt am main", "cologne",
    "köln", "stuttgart", "düsseldorf", "leipzig", "paris", "lyon", "madrid", "barcelona", "valencia", "lisbon", "porto", "rome", "milan",
    "amsterdam", "rotterdam", "brussels", "vienna", "zurich", "zürich", "geneva", "stockholm", "oslo", "copenhagen", "helsinki", "warsaw",
    "krakow", "kraków", "prague", "budapest", "bucharest", "sofia", "athens", "tallinn", "riga", "vilnius", "kyiv",
  ],
);

/** Sources that only ever list one region, whatever their location text says. */
const SOURCE_REGION: Record<string, Region> = { usajobs: "us", reed: "eu", arbeitnow: "eu" };

function classify(part: string): Region | null {
  const raw = part.trim();
  const p = raw.toLowerCase().replace(/[()]/g, "").replace(/\s+/g, " ").trim();
  if (!p) return null;
  if (WORLD.test(p)) return "world";
  if (JUST_REMOTE.test(p)) return null; // says nothing about where
  if (US_WORDS.has(p) || US_PLACES.has(p) || (raw.length === 2 && US_STATES.has(raw))) return "us";
  if (EU_PLACES.has(p)) return "eu";
  // "Remote - US", "United States (Remote)", "EU timezone"
  const words = p.replace(/\b(remote|only|based|timezones?|time ?zones?|hours|region|residents?|candidates?|in|the|within|from|of)\b/g, " ").replace(/[-–—:+]/g, " ").replace(/\s+/g, " ").trim();
  if (words !== p) return classify(words) ?? null;
  return "other";
}

export function regionsOf(job: Job): Set<Region> {
  const fixed = SOURCE_REGION[job.source];
  if (fixed) return new Set([fixed]);
  const found = new Set<Region>();
  for (const part of job.location.split(/[,;/|&•·]|\band\b|\bor\b/i)) {
    const region = classify(part);
    if (region) found.add(region);
  }
  // No stated restriction: a remote job is open to everyone until it says otherwise.
  if (found.size === 0) found.add(job.remote ? "world" : "other");
  return found;
}

export function regionOk(job: Job, filter: RegionFilter): boolean {
  if (filter === "any") return true;
  const regions = regionsOf(job);
  if (regions.has("world")) return true;
  if (filter !== "eu" && regions.has("us")) return true;
  if (filter !== "us" && regions.has("eu")) return true;
  return false;
}

/** Job boards keep expired postings around. Past this age a listing is more likely filled than open. */
export const MAX_AGE_DAYS = 60;

export function isFresh(job: Job, now = Date.now()): boolean {
  // A company's own careers page only lists roles that are open today.
  if (/^(greenhouse|lever|ashby)-/.test(job.source)) return true;
  if (!job.postedAt) return true;
  const age = (now - Date.parse(job.postedAt)) / 86_400_000;
  return !(age > MAX_AGE_DAYS);
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "–",
  mdash: "—",
  hellip: "…",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  euro: "€",
  pound: "£",
};

export function decodeEntities(input: string): string {
  return input.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === "#") {
      const n = code[1].toLowerCase() === "x" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x10ffff ? String.fromCodePoint(n) : whole;
    }
    return ENTITIES[code.toLowerCase()] ?? whole;
  });
}

/**
 * Job descriptions arrive as HTML from a dozen sources. We keep only readable
 * text (paragraph breaks and bullets preserved), so nothing from a job board is
 * ever rendered as markup in the app.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  let s = html;
  // Some boards (Greenhouse) entity-escape the whole document.
  if (!/<[a-z!/]/i.test(s) && /&lt;[a-z/]/i.test(s)) s = decodeEntities(s);
  s = s
    .replace(/<(script|style|noscript|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<li\b[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|ul|ol|table|tr|h[1-6])>/gi, "\n\n")
    .replace(/<h[1-6]\b[^>]*>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ");
  s = decodeEntities(s)
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/•\s*\n+/g, "• ");
  return s.trim();
}

/**
 * Some boards serve UTF-8 that was decoded as Latin-1 somewhere upstream (an en
 * dash arrives as "â" plus two control characters). Re-decode just those runs.
 */
export function fixMojibake(input: string): string {
  return input.replace(/[Â-ô][\u0080-¿]{1,3}/g, (run) => {
    const decoded = Buffer.from(run, "latin1").toString("utf8");
    return decoded.includes("�") ? run : decoded;
  });
}

/**
 * Shields-style listing badge. System fonts only — no external font fetch.
 * The words are fixed. Any text that reaches the SVG is escaped.
 */

export const LISTED_BADGE_LABEL = "Listed on";
export const FEATURED_BADGE_LABEL = "Featured on";
export const BADGE_MESSAGE = "Agent Control";
export const LISTED_BADGE_COLOR = "#007ec6";
export const FEATURED_BADGE_COLOR = "#e85d4c";
export const BADGE_LABEL_COLOR = "#555";
export const BADGE_SITE = "https://agent-control.net";

const HEIGHT = 20;
const SIDE_PADDING = 6;

/** Advance widths for Verdana at 11px, in pixels. Unknown characters use 7. */
const CHAR_WIDTH: Record<string, number> = {
  " ": 4,
  "!": 4,
  '"': 5,
  "#": 8,
  $: 7,
  "%": 11,
  "&": 8,
  "'": 3,
  "(": 5,
  ")": 5,
  "*": 6,
  "+": 8,
  ",": 4,
  "-": 5,
  ".": 4,
  "/": 5,
  "0": 7,
  "1": 7,
  "2": 7,
  "3": 7,
  "4": 7,
  "5": 7,
  "6": 7,
  "7": 7,
  "8": 7,
  "9": 7,
  ":": 4,
  ";": 4,
  "<": 8,
  "=": 8,
  ">": 8,
  "?": 7,
  "@": 12,
  A: 8,
  B: 8,
  C: 8,
  D: 9,
  E: 7,
  F: 7,
  G: 9,
  H: 9,
  I: 4,
  J: 5,
  K: 8,
  L: 7,
  M: 11,
  N: 9,
  O: 9,
  P: 7,
  Q: 9,
  R: 8,
  S: 8,
  T: 7,
  U: 9,
  V: 8,
  W: 12,
  X: 8,
  Y: 7,
  Z: 7,
  a: 7,
  b: 7,
  c: 6,
  d: 7,
  e: 7,
  f: 4,
  g: 7,
  h: 7,
  i: 3,
  j: 4,
  k: 7,
  l: 3,
  m: 11,
  n: 7,
  o: 7,
  p: 7,
  q: 7,
  r: 5,
  s: 6,
  t: 4,
  u: 7,
  v: 6,
  w: 9,
  x: 6,
  y: 6,
  z: 6,
};

export function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function textWidth(value: string): number {
  let width = 0;
  for (const char of value) width += CHAR_WIDTH[char] ?? 7;
  return width;
}

export function badgeAlt(featured: boolean): string {
  return featured ? "Featured on Agent Control" : "Listed on Agent Control";
}

export function badgePath(id: string): string {
  return `/badge/${encodeURIComponent(id)}.svg`;
}

export function badgeUrl(id: string): string {
  return `${BADGE_SITE}${badgePath(id)}`;
}

export function listingUrl(id: string): string {
  return `${BADGE_SITE}/directory/${encodeURIComponent(id)}`;
}

export function badgeMarkdown(id: string, featured = false): string {
  return `[![${badgeAlt(featured)}](${badgeUrl(id)})](${listingUrl(id)})`;
}

export function badgeHtml(id: string, featured = false): string {
  const href = escapeXml(listingUrl(id));
  const src = escapeXml(badgeUrl(id));
  const alt = escapeXml(badgeAlt(featured));
  return `<a href="${href}"><img src="${src}" alt="${alt}"></a>`;
}

export function listingBadgeSvg(options: {
  featured: boolean;
  label?: string;
  message?: string;
}): string {
  const label = options.label ?? (options.featured ? FEATURED_BADGE_LABEL : LISTED_BADGE_LABEL);
  const message = options.message ?? BADGE_MESSAGE;
  const color = options.featured ? FEATURED_BADGE_COLOR : LISTED_BADGE_COLOR;
  const labelText = textWidth(label);
  const messageText = textWidth(message);
  const labelWidth = labelText + SIDE_PADDING * 2;
  const messageWidth = messageText + SIDE_PADDING * 2;
  const width = labelWidth + messageWidth;
  const labelX = (labelWidth / 2) * 10;
  const messageX = (labelWidth + messageWidth / 2) * 10;
  const aria = escapeXml(`${label}: ${message}`);
  const safeLabel = escapeXml(label);
  const safeMessage = escapeXml(message);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEIGHT}" role="img" aria-label="${aria}">
  <title>${aria}</title>
  <linearGradient id="s" x2="0" y2="100%">
    <stop offset="0" stop-color="#bbb" stop-opacity=".1"/>
    <stop offset="1" stop-opacity=".1"/>
  </linearGradient>
  <clipPath id="r">
    <rect width="${width}" height="${HEIGHT}" rx="3" fill="#fff"/>
  </clipPath>
  <g clip-path="url(#r)">
    <rect width="${labelWidth}" height="${HEIGHT}" fill="${BADGE_LABEL_COLOR}"/>
    <rect x="${labelWidth}" width="${messageWidth}" height="${HEIGHT}" fill="${color}"/>
    <rect width="${width}" height="${HEIGHT}" fill="url(#s)"/>
  </g>
  <g fill="#fff" text-anchor="middle" font-family="Verdana,Geneva,DejaVu Sans,sans-serif" text-rendering="geometricPrecision" font-size="110">
    <text aria-hidden="true" x="${labelX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${labelText * 10}">${safeLabel}</text>
    <text x="${labelX}" y="140" transform="scale(.1)" fill="#fff" textLength="${labelText * 10}">${safeLabel}</text>
    <text aria-hidden="true" x="${messageX}" y="150" fill="#010101" fill-opacity=".3" transform="scale(.1)" textLength="${messageText * 10}">${safeMessage}</text>
    <text x="${messageX}" y="140" transform="scale(.1)" fill="#fff" textLength="${messageText * 10}">${safeMessage}</text>
  </g>
</svg>
`;
}

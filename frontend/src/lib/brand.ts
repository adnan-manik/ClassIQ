/** ClassIQ brand tokens — aligned to Docs/ClassIQ-design-guide.pdf. */
export const BRAND = {
  // Surfaces
  page: "#F2FFFE", // light mint app background (per design)
  sidebar: "#0D9488", // solid bright-teal sidebar (per design)
  sidebarText: "#FFFFFF",
  sidebarMuted: "#B2E5DD",
  sidebarBorder: "#0B8278",
  sidebarHover: "#0B8278",
  sidebarActiveBg: "#F2FFFE", // matches page bg so active tab merges with content area
  sidebarActiveText: "#0D9488",
  card: "#FFFFFF",
  cardBorder: "#E2E8F0",
  mint: "#E9FFFD",
  mintSoft: "#F2FFFE",
  subtleBg: "#ECFDFA", // very light teal — was cream/gray, now on-brand
  subtleBgAlt: "#DCFCE7", // softer teal-mint for accent fills

  // Brand palette (from PDF: teal, lilac, mint, cream, pink/coral, deep purple)
  teal: "#0D9488",
  tealDark: "#0F766E",
  tealLight: "#CCFBF1",
  lilac: "#E5D4F2",
  mintGreen: "#C8F2C0",
  pinkPastel: "#F5D5D5",
  purpleDeep: "#3E2F7E",
  purple: "#4A3487",
  purpleLight: "#EDE9FE",
  coral: "#F97066",
  amber: "#F59E0B",
  indigo: "#6366F1",

  // Text
  text: "#0F172A",
  textHeading: "#0F766E", // teal-toned headings per design
  textMuted: "#64748B",
  textSubtle: "#94A3B8",
  textOnPurple: "#3E2F7E",
  textOnLilac: "#3E2F7E",

  // Inputs
  inputBorder: "#80869A",

  // Score thresholds
  scoreHigh: "#22C55E",
  scoreMid: "#EAB308",
  scoreLow: "#EF4444",
} as const;

export function scoreColor(score: number): string {
  if (score >= 70) return BRAND.scoreHigh;
  if (score >= 50) return BRAND.scoreMid;
  return BRAND.scoreLow;
}

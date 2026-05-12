/** Hex color manipulation utilities for deriving theme variants */

export function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${[clamp(r), clamp(g), clamp(b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Mix a color with white (0 = original, 1 = white) */
export function lighten(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(
    r + (255 - r) * amount,
    g + (255 - g) * amount,
    b + (255 - b) * amount,
  );
}

/** Mix a color with black (0 = original, 1 = black) */
export function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - amount), g * (1 - amount), b * (1 - amount));
}

/** Determine if a color is light or dark */
export function isLight(hex: string): boolean {
  const { r, g, b } = hexToRgb(hex);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5;
}

/** Get contrasting text color */
export function contrastText(hex: string): string {
  return isLight(hex) ? "#1e293b" : "#ffffff";
}

/** Build a full Theme.colors object from 4 base colors */
export function buildThemeColors(base: {
  primary: string;
  accent: string;
  sidebarBg: string;
  pageBg: string;
}) {
  const { primary, accent, sidebarBg, pageBg } = base;

  return {
    sidebarBg,
    sidebarText: lighten(sidebarBg, 0.85),
    sidebarMuted: lighten(sidebarBg, 0.5),
    sidebarBorder: lighten(sidebarBg, 0.15),
    sidebarActive: accent,
    sidebarHover: lighten(sidebarBg, 0.1),

    pageBg,
    pageText: isLight(pageBg) ? "#1e293b" : "#f1f5f9",
    pageMuted: "#64748b",

    cardBg: lighten(pageBg, 0.5),
    cardBorder: darken(pageBg, 0.12),

    primary,
    primaryLight: lighten(primary, 0.88),
    primaryText: contrastText(primary),

    accent,
    accentLight: lighten(accent, 0.88),
    accentText: darken(accent, 0.55),

    subtleBg: lighten(pageBg, 0.3),

    infoBg: lighten(primary, 0.88),
    infoBorder: lighten(primary, 0.6),
    infoText: darken(primary, 0.1),

    ringTrack: darken(pageBg, 0.12),
  };
}

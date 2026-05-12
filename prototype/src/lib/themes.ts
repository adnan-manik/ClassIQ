export interface Theme {
  id: string;
  name: string;
  description: string;
  colors: {
    // Sidebar
    sidebarBg: string;
    sidebarText: string;
    sidebarMuted: string;
    sidebarBorder: string;
    sidebarActive: string;
    sidebarHover: string;

    // Page
    pageBg: string;
    pageText: string;
    pageMuted: string;

    // Cards
    cardBg: string;
    cardBorder: string;

    // Primary accent
    primary: string;
    primaryLight: string;
    primaryText: string;

    // Secondary accent
    accent: string;
    accentLight: string;
    accentText: string;

    // Subtle backgrounds
    subtleBg: string;

    // Info box
    infoBg: string;
    infoBorder: string;
    infoText: string;

    // Score ring
    ringTrack: string;
  };
}

export const themes: Theme[] = [
  {
    id: "navy-gold",
    name: "Deep Navy + Gold",
    description: "Classic Academic — institutional, authoritative",
    colors: {
      sidebarBg: "#1e3a5f",
      sidebarText: "#e2e8f0",
      sidebarMuted: "#7b9bbf",
      sidebarBorder: "#2d4f7a",
      sidebarActive: "#d4a843",
      sidebarHover: "#264a73",
      pageBg: "#f5f0e8",
      pageText: "#1e293b",
      pageMuted: "#64748b",
      cardBg: "#ffffff",
      cardBorder: "#d6cfc0",
      primary: "#1e3a5f",
      primaryLight: "#e8eef5",
      primaryText: "#ffffff",
      accent: "#d4a843",
      accentLight: "#fdf6e3",
      accentText: "#78570a",
      subtleBg: "#f9f5ed",
      infoBg: "#e8eef5",
      infoBorder: "#b8cee2",
      infoText: "#1e3a5f",
      ringTrack: "#d6cfc0",
    },
  },
  {
    id: "teal-warm",
    name: "Teal + Warm White",
    description: "Modern EdTech — clean, friendly, approachable",
    colors: {
      sidebarBg: "#0f4f4a",
      sidebarText: "#e2f5f3",
      sidebarMuted: "#6bb5ad",
      sidebarBorder: "#177068",
      sidebarActive: "#14b8a6",
      sidebarHover: "#146b63",
      pageBg: "#fafaf5",
      pageText: "#1a1a1a",
      pageMuted: "#6b7280",
      cardBg: "#ffffff",
      cardBorder: "#e0e0d8",
      primary: "#0d9488",
      primaryLight: "#e6f7f5",
      primaryText: "#ffffff",
      accent: "#f97066",
      accentLight: "#fef2f2",
      accentText: "#991b1b",
      subtleBg: "#f0f7f6",
      infoBg: "#e6f7f5",
      infoBorder: "#99d5cf",
      infoText: "#065f56",
      ringTrack: "#e0e0d8",
    },
  },
  {
    id: "indigo-purple",
    name: "Indigo + Soft Purple",
    description: "AI-Forward — signals intelligence, modern",
    colors: {
      sidebarBg: "#1e1b4b",
      sidebarText: "#e0e0ff",
      sidebarMuted: "#8b85c1",
      sidebarBorder: "#312e81",
      sidebarActive: "#7c3aed",
      sidebarHover: "#2e2a6e",
      pageBg: "#f5f3ff",
      pageText: "#1e1b4b",
      pageMuted: "#6b7280",
      cardBg: "#ffffff",
      cardBorder: "#ddd6fe",
      primary: "#4338ca",
      primaryLight: "#eef2ff",
      primaryText: "#ffffff",
      accent: "#a78bfa",
      accentLight: "#f5f3ff",
      accentText: "#4c1d95",
      subtleBg: "#f0edff",
      infoBg: "#eef2ff",
      infoBorder: "#c7d2fe",
      infoText: "#3730a3",
      ringTrack: "#ddd6fe",
    },
  },
  {
    id: "forest-cream",
    name: "Forest Green + Cream",
    description: "Scholarly — calm, trustworthy, knowledge-oriented",
    colors: {
      sidebarBg: "#14532d",
      sidebarText: "#dcfce7",
      sidebarMuted: "#6bba82",
      sidebarBorder: "#166534",
      sidebarActive: "#22c55e",
      sidebarHover: "#1a6b38",
      pageBg: "#faf9f5",
      pageText: "#1a1a1a",
      pageMuted: "#6b7280",
      cardBg: "#ffffff",
      cardBorder: "#d4d0c4",
      primary: "#166534",
      primaryLight: "#e8f5e9",
      primaryText: "#ffffff",
      accent: "#ca8a04",
      accentLight: "#fefce8",
      accentText: "#713f12",
      subtleBg: "#f0efe8",
      infoBg: "#e8f5e9",
      infoBorder: "#a7d5b0",
      infoText: "#14532d",
      ringTrack: "#d4d0c4",
    },
  },
];

export function getTheme(id: string): Theme {
  return themes.find((t) => t.id === id) ?? themes[0];
}

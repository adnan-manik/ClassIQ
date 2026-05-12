"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { Theme, themes, getTheme } from "./themes";
import { buildThemeColors } from "./color-utils";

interface CustomColors {
  primary: string;
  accent: string;
  sidebarBg: string;
  pageBg: string;
}

interface ThemeCtx {
  theme: Theme;
  setThemeId: (id: string) => void;
  customColors: CustomColors;
  setCustomColors: (colors: CustomColors) => void;
}

const defaultCustomColors: CustomColors = {
  primary: "#4338ca",
  accent: "#f59e0b",
  sidebarBg: "#1e293b",
  pageBg: "#f8fafc",
};

const ThemeContext = createContext<ThemeCtx>({
  theme: themes[0],
  setThemeId: () => {},
  customColors: defaultCustomColors,
  setCustomColors: () => {},
});

function buildCustomTheme(colors: CustomColors): Theme {
  return {
    id: "custom",
    name: "Custom Theme",
    description: "Your custom color palette",
    colors: buildThemeColors(colors),
  };
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState(themes[0].id);
  const [customColors, setCustomColorsState] = useState<CustomColors>(defaultCustomColors);
  const [mounted, setMounted] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    const savedThemeId = localStorage.getItem("themeId");
    const savedCustom = localStorage.getItem("customThemeColors");
    if (savedThemeId) setThemeIdState(savedThemeId);
    if (savedCustom) {
      try {
        setCustomColorsState(JSON.parse(savedCustom));
      } catch { /* ignore */ }
    }
    setMounted(true);
  }, []);

  const setThemeId = (id: string) => {
    setThemeIdState(id);
    localStorage.setItem("themeId", id);
  };

  const setCustomColors = (colors: CustomColors) => {
    setCustomColorsState(colors);
    localStorage.setItem("customThemeColors", JSON.stringify(colors));
  };

  const theme = themeId === "custom" ? buildCustomTheme(customColors) : getTheme(themeId);

  // Avoid hydration mismatch — render default theme until mounted
  const activeTheme = mounted ? theme : themes[0];

  return (
    <ThemeContext.Provider value={{ theme: activeTheme, setThemeId, customColors, setCustomColors }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}

"use client";

import { useTheme } from "@/lib/ThemeContext";
import { ReactNode } from "react";

export default function ThemedPage({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  return (
    <div
      className="min-h-screen"
      style={{ backgroundColor: theme.colors.pageBg, color: theme.colors.pageText }}
    >
      {children}
    </div>
  );
}

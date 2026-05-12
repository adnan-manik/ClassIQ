"use client";

import { useTheme } from "@/lib/ThemeContext";
import { themes } from "@/lib/themes";
import { Palette, Paintbrush } from "lucide-react";
import { useState } from "react";
import CustomThemeBuilder from "./CustomThemeBuilder";

export default function ThemeSwitcher() {
  const { theme, setThemeId, customColors } = useTheme();
  const [open, setOpen] = useState(false);
  const [showBuilder, setShowBuilder] = useState(false);

  return (
    <div className="fixed top-4 right-4 z-50">
      <button
        onClick={() => {
          setOpen(!open);
          setShowBuilder(false);
        }}
        className="flex items-center gap-2 bg-white shadow-lg border border-gray-200 rounded-full px-4 py-2.5 text-sm font-medium text-gray-700 hover:shadow-xl transition"
      >
        <Palette size={16} />
        Theme
      </button>

      {open && !showBuilder && (
        <div className="absolute top-12 right-0 bg-white rounded-xl shadow-2xl border border-gray-200 p-2 w-72">
          {/* Preset themes */}
          {themes.map((t) => (
            <button
              key={t.id}
              onClick={() => { setThemeId(t.id); setOpen(false); }}
              className={`w-full text-left px-3 py-3 rounded-lg transition flex items-center gap-3 ${
                theme.id === t.id ? "bg-gray-100" : "hover:bg-gray-50"
              }`}
            >
              <div className="flex gap-1 shrink-0">
                <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: t.colors.sidebarBg }} />
                <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: t.colors.accent }} />
                <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: t.colors.pageBg }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                <div className="text-xs text-gray-500">{t.description}</div>
              </div>
              {theme.id === t.id && (
                <span className="ml-auto text-green-600 text-xs font-bold">Active</span>
              )}
            </button>
          ))}

          {/* Divider */}
          <div className="border-t border-gray-100 my-2" />

          {/* Custom theme option */}
          <button
            onClick={() => setShowBuilder(true)}
            className={`w-full text-left px-3 py-3 rounded-lg transition flex items-center gap-3 ${
              theme.id === "custom" ? "bg-gray-100" : "hover:bg-gray-50"
            }`}
          >
            <div className="flex gap-1 shrink-0">
              <div className="w-4 h-4 rounded-full border border-gray-200 flex items-center justify-center bg-gradient-to-br from-indigo-400 via-pink-400 to-amber-400">
              </div>
              <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: customColors.primary }} />
              <div className="w-4 h-4 rounded-full border border-gray-200" style={{ backgroundColor: customColors.accent }} />
            </div>
            <div>
              <div className="text-sm font-semibold text-gray-900 flex items-center gap-1.5">
                <Paintbrush size={13} className="text-indigo-500" />
                Custom Theme
              </div>
              <div className="text-xs text-gray-500">Build your own color palette</div>
            </div>
            {theme.id === "custom" && (
              <span className="ml-auto text-green-600 text-xs font-bold">Active</span>
            )}
          </button>
        </div>
      )}

      {open && showBuilder && (
        <CustomThemeBuilder onClose={() => { setShowBuilder(false); setOpen(false); }} />
      )}
    </div>
  );
}

"use client";

import { useTheme } from "@/lib/ThemeContext";
import { buildThemeColors } from "@/lib/color-utils";
import { Paintbrush, RotateCcw, Check } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";

interface ColorFieldProps {
  label: string;
  description: string;
  value: string;
  onChange: (color: string) => void;
}

function ColorField({ label, description, value, onChange }: ColorFieldProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3 py-2">
      <button
        onClick={() => inputRef.current?.click()}
        className="w-10 h-10 rounded-lg border-2 border-gray-200 cursor-pointer shrink-0 shadow-sm hover:shadow-md transition-shadow hover:scale-105 active:scale-95"
        style={{ backgroundColor: value }}
        title={`Pick ${label} color`}
      />
      <input
        ref={inputRef}
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-gray-900">{label}</div>
        <div className="text-xs text-gray-500">{description}</div>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) onChange(v);
        }}
        className="w-20 text-xs font-mono bg-gray-50 border border-gray-200 rounded px-2 py-1 text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        maxLength={7}
      />
    </div>
  );
}

interface Props {
  onClose: () => void;
}

export default function CustomThemeBuilder({ onClose }: Props) {
  const { customColors, setCustomColors, setThemeId, theme } = useTheme();
  const [draft, setDraft] = useState(customColors);
  const panelRef = useRef<HTMLDivElement>(null);

  const preview = buildThemeColors(draft);

  const update = useCallback((key: keyof typeof draft, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }, []);

  const apply = () => {
    setCustomColors(draft);
    setThemeId("custom");
    onClose();
  };

  const reset = () => {
    setDraft({
      primary: "#4338ca",
      accent: "#f59e0b",
      sidebarBg: "#1e293b",
      pageBg: "#f8fafc",
    });
  };

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose]);

  return (
    <div ref={panelRef} className="absolute top-12 right-0 bg-white rounded-2xl shadow-2xl border border-gray-200 w-[380px] z-50 overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <Paintbrush size={18} className="text-indigo-600" />
          <h3 className="text-base font-bold text-gray-900">Custom Theme Builder</h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">Pick your colors — everything else is auto-derived</p>
      </div>

      {/* Color pickers */}
      <div className="px-5 py-3 space-y-1">
        <ColorField
          label="Primary"
          description="Buttons, headers, key UI"
          value={draft.primary}
          onChange={(v) => update("primary", v)}
        />
        <ColorField
          label="Accent"
          description="Highlights, active states, badges"
          value={draft.accent}
          onChange={(v) => update("accent", v)}
        />
        <ColorField
          label="Sidebar"
          description="Navigation background"
          value={draft.sidebarBg}
          onChange={(v) => update("sidebarBg", v)}
        />
        <ColorField
          label="Page Background"
          description="Main content area"
          value={draft.pageBg}
          onChange={(v) => update("pageBg", v)}
        />
      </div>

      {/* Live preview */}
      <div className="mx-5 mb-3 rounded-xl overflow-hidden border border-gray-200">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 pt-2 pb-1 bg-gray-50">
          Live Preview
        </div>
        <div className="flex h-24">
          {/* Mini sidebar */}
          <div className="w-16 flex flex-col items-center justify-center gap-1.5 py-2" style={{ backgroundColor: preview.sidebarBg }}>
            <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: preview.sidebarMuted }} />
            <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: preview.sidebarActive }} />
            <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: preview.sidebarMuted }} />
            <div className="w-8 h-1.5 rounded-full" style={{ backgroundColor: preview.sidebarMuted }} />
          </div>
          {/* Mini page */}
          <div className="flex-1 p-2.5 flex flex-col gap-1.5" style={{ backgroundColor: preview.pageBg }}>
            <div className="flex gap-1.5">
              <div className="h-3 w-12 rounded" style={{ backgroundColor: preview.primary }} />
              <div className="h-3 w-8 rounded" style={{ backgroundColor: preview.accent }} />
            </div>
            <div className="flex-1 rounded-lg border flex items-center justify-center" style={{ backgroundColor: preview.cardBg, borderColor: preview.cardBorder }}>
              <div className="flex gap-1">
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preview.primaryLight }} />
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preview.accentLight }} />
                <div className="w-5 h-5 rounded-full" style={{ backgroundColor: preview.infoBg }} />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 pb-4 flex gap-2">
        <button
          onClick={reset}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition"
        >
          <RotateCcw size={13} />
          Reset
        </button>
        <button
          onClick={apply}
          className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 text-sm font-semibold text-white rounded-lg transition hover:opacity-90"
          style={{ backgroundColor: draft.primary }}
        >
          <Check size={15} />
          Apply Theme
        </button>
      </div>
    </div>
  );
}

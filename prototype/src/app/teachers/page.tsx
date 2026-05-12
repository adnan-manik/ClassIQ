"use client";

import { teachers } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import Badge from "@/components/Badge";

export default function TeachersPage() {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>Teacher Profiles</h1>
      <p className="text-sm" style={{ color: c.pageMuted }}>Teaching style profiles captured through surveys. Used by the compatibility engine to score teacher-student alignment.</p>

      <div className="grid grid-cols-1 gap-5">
        {teachers.map((t) => (
          <div key={t.id} className="rounded-xl shadow-sm p-6" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: c.pageText }}>{t.name}</h2>
                <p className="text-sm mt-1" style={{ color: c.pageMuted }}>{t.teachingStyle}</p>
              </div>
              <Badge text={t.interactionLevel} />
            </div>
            <div className="grid grid-cols-3 gap-4 mt-5">
              {([
                ["Interaction Level", t.interactionLevel],
                ["Pacing", t.pacing],
                ["Approach", t.approach],
              ] as const).map(([label, val]) => (
                <div key={label} className="rounded-lg p-4" style={{ backgroundColor: c.subtleBg }}>
                  <div className="text-xs" style={{ color: c.pageMuted }}>{label}</div>
                  <div className="text-sm font-semibold capitalize mt-1" style={{ color: c.pageText }}>{val}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

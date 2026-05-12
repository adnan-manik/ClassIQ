"use client";

import { students } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import Badge from "@/components/Badge";
import { useState } from "react";

export default function StudentsPage() {
  const [selected, setSelected] = useState(students[0]);
  const { theme } = useTheme();
  const c = theme.colors;

  const barColors = ["#6366f1", "#f59e0b", "#10b981", "#f43f5e"];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>Student Digital Twin Profiles</h1>
      <p className="text-sm" style={{ color: c.pageMuted }}>Each student has a structured behavioral profile generated from the Felder-Silverman learning style survey.</p>

      <div className="grid grid-cols-3 gap-6">
        {/* Student list */}
        <div className="col-span-1 rounded-xl shadow-sm overflow-hidden" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
          <div className="p-4" style={{ backgroundColor: c.subtleBg, borderBottom: `1px solid ${c.cardBorder}` }}>
            <h2 className="font-semibold text-sm" style={{ color: c.pageMuted }}>Students ({students.length})</h2>
          </div>
          <ul className="max-h-[600px] overflow-auto" style={{ borderColor: c.cardBorder }}>
            {students.map((s) => (
              <li
                key={s.id}
                onClick={() => setSelected(s)}
                className="px-4 py-3 cursor-pointer flex items-center justify-between transition"
                style={{
                  backgroundColor: selected.id === s.id ? c.primaryLight : "transparent",
                  borderLeft: selected.id === s.id ? `4px solid ${c.primary}` : "4px solid transparent",
                  borderBottom: `1px solid ${c.cardBorder}22`,
                }}
                onMouseEnter={(e) => { if (selected.id !== s.id) e.currentTarget.style.backgroundColor = c.subtleBg; }}
                onMouseLeave={(e) => { if (selected.id !== s.id) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: c.pageText }}>{s.name}</div>
                  <div className="text-xs" style={{ color: c.pageMuted }}>v{s.version} &middot; {s.semester}</div>
                </div>
                <Badge text={s.dominantStyle} />
              </li>
            ))}
          </ul>
        </div>

        {/* Profile detail */}
        <div className="col-span-2 rounded-xl shadow-sm p-6 space-y-6" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold" style={{ color: c.pageText }}>{selected.name}</h2>
              <p className="text-sm" style={{ color: c.pageMuted }}>Profile Version {selected.version} &mdash; {selected.semester}</p>
            </div>
            <Badge text={selected.dominantStyle} />
          </div>

          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Learning Style Scores (Felder-Silverman)</h3>
            <div className="space-y-2">
              {([
                ["Visual", selected.visual],
                ["Auditory", selected.auditory],
                ["Read/Write", selected.readWrite],
                ["Kinesthetic", selected.kinesthetic],
              ] as const).map(([label, val], i) => (
                <div key={label} className="flex items-center gap-3">
                  <span className="w-24 text-sm text-right" style={{ color: c.pageMuted }}>{label}</span>
                  <div className="flex-1 rounded-full h-4 overflow-hidden" style={{ backgroundColor: c.subtleBg }}>
                    <div className="h-full rounded-full" style={{ width: `${val}%`, backgroundColor: barColors[i] }} />
                  </div>
                  <span className="w-10 text-sm font-medium text-right" style={{ color: c.pageText }}>{val}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg p-4" style={{ backgroundColor: c.subtleBg }}>
              <div className="text-xs" style={{ color: c.pageMuted }}>Collaboration Preference</div>
              <div className="text-sm font-semibold capitalize" style={{ color: c.pageText }}>{selected.collaborationPref}</div>
            </div>
            <div className="rounded-lg p-4" style={{ backgroundColor: c.subtleBg }}>
              <div className="text-xs" style={{ color: c.pageMuted }}>Participation Level</div>
              <div className="text-sm font-semibold capitalize" style={{ color: c.pageText }}>{selected.participationLevel}</div>
            </div>
          </div>

          <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: c.infoBg, border: `1px solid ${c.infoBorder}`, color: c.infoText }}>
            This profile is <strong>version {selected.version}</strong>. Previous versions are preserved for longitudinal analysis &mdash; tracking how this student&apos;s learning style evolves across semesters.
          </div>
        </div>
      </div>
    </div>
  );
}

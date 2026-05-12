"use client";

import { students, teachers, sections, simulationResults, getTeacher } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import ScoreRing from "@/components/ScoreRing";
import Badge from "@/components/Badge";
import { Users, GraduationCap, BookOpen, TrendingUp } from "lucide-react";

export default function Dashboard() {
  const { theme } = useTheme();
  const c = theme.colors;

  const stats = [
    { label: "Students", value: students.length, icon: Users },
    { label: "Teachers", value: teachers.length, icon: GraduationCap },
    { label: "Sections", value: sections.length, icon: BookOpen },
    { label: "Avg Score", value: Math.round(simulationResults.reduce((a, r) => a + r.compatibilityScore, 0) / simulationResults.length), icon: TrendingUp },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>HoD Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: c.pageMuted }}>Fall 2026 &mdash; CS Department, MAJU</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {stats.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-xl shadow-sm p-5 flex items-center gap-4" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
            <div className="p-3 rounded-lg" style={{ backgroundColor: c.primary }}>
              <Icon size={22} color={c.primaryText} />
            </div>
            <div>
              <div className="text-2xl font-bold" style={{ color: c.pageText }}>{value}</div>
              <div className="text-sm" style={{ color: c.pageMuted }}>{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Section overview */}
      <div className="rounded-xl shadow-sm p-6" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: c.pageText }}>Section Overview</h2>
        <div className="grid grid-cols-2 gap-6">
          {sections.map((sec) => {
            const result = simulationResults.find((r) => r.sectionId === sec.id);
            const teacher = getTeacher(sec.teacherId);
            return (
              <div key={sec.id} className="rounded-lg p-5 flex gap-5" style={{ border: `1px solid ${c.cardBorder}` }}>
                <ScoreRing score={result?.compatibilityScore ?? 0} label="Compatibility" />
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold" style={{ color: c.pageText }}>{sec.courseCode} &mdash; {sec.course}</span>
                    <Badge text={sec.state} />
                  </div>
                  <div className="text-sm" style={{ color: c.pageMuted }}>Teacher: {teacher?.name}</div>
                  <div className="text-sm" style={{ color: c.pageMuted }}>Students: {sec.studentIds.length}</div>
                  <div className="flex gap-2 mt-1">
                    <Badge text={`Outcome: ${result?.predictedOutcome}`} />
                    <Badge text={result?.socialGraphImpact ?? "N/A"} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Style distribution */}
      <div className="rounded-xl shadow-sm p-6" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
        <h2 className="text-lg font-semibold mb-4" style={{ color: c.pageText }}>Learning Style Distribution (All Students)</h2>
        <StyleBars c={c} />
      </div>
    </div>
  );
}

function StyleBars({ c }: { c: ReturnType<typeof useTheme>["theme"]["colors"] }) {
  const totals = { Visual: 0, Auditory: 0, "Read/Write": 0, Kinesthetic: 0 };
  students.forEach((s) => {
    totals.Visual += s.visual;
    totals.Auditory += s.auditory;
    totals["Read/Write"] += s.readWrite;
    totals.Kinesthetic += s.kinesthetic;
  });
  const max = Math.max(...Object.values(totals));
  const barColors: Record<string, string> = {
    Visual: "#6366f1",
    Auditory: "#f59e0b",
    "Read/Write": "#10b981",
    Kinesthetic: "#f43f5e",
  };

  return (
    <div className="space-y-3">
      {Object.entries(totals).map(([style, val]) => {
        const pct = Math.round((val / max) * 100);
        return (
          <div key={style} className="flex items-center gap-3">
            <span className="w-24 text-sm text-right" style={{ color: c.pageMuted }}>{style}</span>
            <div className="flex-1 rounded-full h-5 overflow-hidden" style={{ backgroundColor: c.subtleBg }}>
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColors[style] }} />
            </div>
            <span className="w-16 text-sm text-right" style={{ color: c.pageMuted }}>{Math.round(val / students.length)} avg</span>
          </div>
        );
      })}
    </div>
  );
}

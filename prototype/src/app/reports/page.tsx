"use client";

import { simulationResults, sections, getTeacher } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import ScoreRing from "@/components/ScoreRing";
import Badge from "@/components/Badge";
import { Download, Printer } from "lucide-react";

export default function ReportsPage() {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>Simulation Reports</h1>
          <p className="text-sm mt-1" style={{ color: c.pageMuted }}>Generated per-section after simulation runs.</p>
        </div>
        <div className="flex gap-2">
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition" style={{ border: `1px solid ${c.cardBorder}`, color: c.pageText, backgroundColor: c.cardBg }}>
            <Download size={15} /> Export PDF
          </button>
          <button className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm transition" style={{ border: `1px solid ${c.cardBorder}`, color: c.pageText, backgroundColor: c.cardBg }}>
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {simulationResults.map((result) => {
        const section = sections.find((s) => s.id === result.sectionId)!;
        const teacher = getTeacher(section.teacherId)!;
        const dist = result.styleDistribution;
        const distColors = ["#6366f1", "#f59e0b", "#10b981", "#f43f5e"];

        return (
          <div key={result.sectionId} className="rounded-xl shadow-sm p-6 space-y-6" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold" style={{ color: c.pageText }}>
                  {section.courseCode} &mdash; Section {section.id.replace("sec-", "").toUpperCase()}
                </h2>
                <p className="text-sm mt-1" style={{ color: c.pageMuted }}>
                  {section.course} &middot; {section.semester} &middot; Teacher: {teacher.name}
                </p>
              </div>
              <ScoreRing score={result.compatibilityScore} size={110} label="Compatibility Score" />
            </div>

            <hr style={{ borderColor: c.cardBorder }} />

            {/* Style distribution */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Class Learning Style Distribution</h3>
              <div className="flex gap-3">
                {([
                  ["Visual", dist.visual],
                  ["Auditory", dist.auditory],
                  ["Read/Write", dist.readWrite],
                  ["Kinesthetic", dist.kinesthetic],
                ] as const).map(([label, pct], i) => (
                  <div key={label} className="flex-1 rounded-lg p-3 text-center" style={{ backgroundColor: c.subtleBg }}>
                    <div className="w-10 h-10 rounded-full mx-auto flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: distColors[i] }}>
                      {pct}%
                    </div>
                    <div className="text-xs mt-2" style={{ color: c.pageMuted }}>{label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Factor breakdown */}
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Scoring Factor Breakdown</h3>
              <div className="grid grid-cols-2 gap-3">
                {result.factors.map((f) => (
                  <div key={f.name} className="flex items-center gap-3 rounded-lg p-3" style={{ backgroundColor: c.subtleBg }}>
                    <div className="flex-1">
                      <div className="text-sm font-medium" style={{ color: c.pageText }}>{f.name}</div>
                      <div className="rounded-full h-2 mt-1.5 overflow-hidden" style={{ backgroundColor: c.cardBorder }}>
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${f.score}%`,
                            backgroundColor: f.impact === "positive" ? "#22c55e" : f.impact === "negative" ? "#ef4444" : "#eab308",
                          }}
                        />
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold" style={{ color: c.pageText }}>{f.score}</div>
                      <Badge text={f.impact} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-lg p-4 text-center" style={{ backgroundColor: c.subtleBg }}>
                <div className="text-xs" style={{ color: c.pageMuted }}>Predicted Outcome</div>
                <div className="mt-1"><Badge text={result.predictedOutcome} /></div>
              </div>
              <div className="rounded-lg p-4 text-center" style={{ backgroundColor: c.subtleBg }}>
                <div className="text-xs" style={{ color: c.pageMuted }}>Social Graph Impact</div>
                <div className="mt-1"><Badge text={result.socialGraphImpact} /></div>
              </div>
              <div className="rounded-lg p-4 text-center" style={{ backgroundColor: c.subtleBg }}>
                <div className="text-xs" style={{ color: c.pageMuted }}>Recommended Teacher</div>
                <div className="text-sm font-semibold mt-1" style={{ color: c.pageText }}>{result.recommendedTeacher}</div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

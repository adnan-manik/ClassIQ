"use client";

import { scenarios, getTeacher } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import ScoreRing from "@/components/ScoreRing";
import Badge from "@/components/Badge";
import { ArrowLeftRight } from "lucide-react";

export default function ScenariosPage() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [scenarioA, scenarioB] = scenarios;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>What-If Scenario Comparison</h1>
        <p className="text-sm mt-1" style={{ color: c.pageMuted }}>
          Compare different teacher-student configurations side by side before committing.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {[scenarioA, scenarioB].map((scenario) => (
          <div key={scenario.id} className="rounded-xl shadow-sm p-6 space-y-5" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold" style={{ color: c.pageText }}>{scenario.name}</h2>
              <div className="text-xs uppercase tracking-wide font-semibold" style={{ color: c.pageMuted }}>
                {scenario.id === "scenario-a" ? "Current" : "Alternative"}
              </div>
            </div>

            {scenario.sections.map((sec, i) => {
              const result = scenario.results[i];
              const teacher = getTeacher(sec.teacherId);
              return (
                <div key={sec.sectionId} className="rounded-lg p-4 space-y-4" style={{ border: `1px solid ${c.cardBorder}` }}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold" style={{ color: c.pageText }}>
                        Section {sec.sectionId.replace("sec-", "").toUpperCase()}
                      </div>
                      <div className="text-sm" style={{ color: c.pageMuted }}>Teacher: {teacher?.name}</div>
                      <div className="text-xs" style={{ color: c.pageMuted }}>{sec.studentIds.length} students</div>
                    </div>
                    <ScoreRing score={result.compatibilityScore} size={80} />
                  </div>

                  <div className="space-y-1.5">
                    {result.factors.map((f) => (
                      <div key={f.name} className="flex items-center gap-2">
                        <span className="w-32 text-xs" style={{ color: c.pageMuted }}>{f.name}</span>
                        <div className="flex-1 rounded-full h-2.5 overflow-hidden" style={{ backgroundColor: c.subtleBg }}>
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${f.score}%`,
                              backgroundColor: f.impact === "positive" ? "#22c55e" : f.impact === "negative" ? "#ef4444" : "#eab308",
                            }}
                          />
                        </div>
                        <span className="w-8 text-xs text-right" style={{ color: c.pageMuted }}>{f.score}</span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Badge text={`Outcome: ${result.predictedOutcome}`} />
                    <Badge text={result.socialGraphImpact} />
                  </div>

                  {result.recommendedTeacher !== teacher?.name && (
                    <div className="rounded-lg p-2.5 text-xs" style={{ backgroundColor: c.accentLight, border: `1px solid ${c.accent}33`, color: c.accentText }}>
                      Recommended teacher: <strong>{result.recommendedTeacher}</strong>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="rounded-lg p-4 text-center" style={{ backgroundColor: c.subtleBg }}>
              <div className="text-xs" style={{ color: c.pageMuted }}>Average Compatibility</div>
              <div className="text-2xl font-bold" style={{ color: c.pageText }}>
                {Math.round(scenario.results.reduce((a, r) => a + r.compatibilityScore, 0) / scenario.results.length)}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Verdict */}
      <div className="rounded-xl p-6 flex items-start gap-4" style={{ backgroundColor: c.infoBg, border: `1px solid ${c.infoBorder}` }}>
        <ArrowLeftRight className="mt-0.5 shrink-0" size={22} style={{ color: c.primary }} />
        <div>
          <h3 className="font-semibold" style={{ color: c.infoText }}>Recommendation</h3>
          <p className="text-sm mt-1" style={{ color: c.infoText }}>
            <strong>Scenario B</strong> produces a higher average compatibility (71.5 vs 66). Section B benefits
            significantly from Dr. Kamran Siddiqui&apos;s hands-on approach matching the kinesthetic-dominant cohort.
            However, Section A drops from 78 to 61 under Prof. Nadia&apos;s lecture-heavy style.
            Consider a <strong>hybrid approach</strong> &mdash; keep Scenario A&apos;s Section A assignment and
            use Scenario B&apos;s Section B assignment.
          </p>
        </div>
      </div>
    </div>
  );
}

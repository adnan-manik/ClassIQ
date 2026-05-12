"use client";

import { teachers, sections, simulationResults, getStudent } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import Badge from "@/components/Badge";
import { useState } from "react";

export default function TeacherDashboardPage() {
  const [selectedTeacher, setSelectedTeacher] = useState(teachers[0]);
  const { theme } = useTheme();
  const c = theme.colors;

  const teacherSections = sections.filter((s) => s.teacherId === selectedTeacher.id);
  const teacherResults = simulationResults.filter((r) =>
    teacherSections.some((s) => s.id === r.sectionId)
  );

  const distColors = ["#6366f1", "#f59e0b", "#10b981", "#f43f5e"];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>Teacher Dashboard</h1>
        <p className="text-sm mt-1" style={{ color: c.pageMuted }}>Read-only view for teachers to understand their class composition before the semester.</p>
      </div>

      {/* Teacher selector */}
      <div className="rounded-xl shadow-sm p-4 flex items-center gap-3" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
        <span className="text-sm" style={{ color: c.pageMuted }}>Viewing as:</span>
        {teachers.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelectedTeacher(t)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition"
            style={{
              backgroundColor: selectedTeacher.id === t.id ? c.primary : c.subtleBg,
              color: selectedTeacher.id === t.id ? c.primaryText : c.pageText,
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Profile */}
      <div className="rounded-xl shadow-sm p-6" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
        <h2 className="text-lg font-semibold" style={{ color: c.pageText }}>Your Teaching Profile</h2>
        <div className="grid grid-cols-4 gap-4 mt-4">
          {([
            ["Teaching Style", selectedTeacher.teachingStyle],
            ["Interaction", selectedTeacher.interactionLevel],
            ["Pacing", selectedTeacher.pacing],
            ["Approach", selectedTeacher.approach],
          ] as const).map(([label, val]) => (
            <div key={label} className="rounded-lg p-3" style={{ backgroundColor: c.subtleBg }}>
              <div className="text-xs" style={{ color: c.pageMuted }}>{label}</div>
              <div className="text-sm font-semibold capitalize mt-1" style={{ color: c.pageText }}>{val}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Sections */}
      {teacherSections.length === 0 ? (
        <div className="rounded-xl shadow-sm p-8 text-center" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}`, color: c.pageMuted }}>
          No sections assigned for this semester.
        </div>
      ) : (
        teacherSections.map((sec) => {
          const result = teacherResults.find((r) => r.sectionId === sec.id);
          const sectionStudents = sec.studentIds.map(getStudent).filter(Boolean);
          const dist = result?.styleDistribution;

          return (
            <div key={sec.id} className="rounded-xl shadow-sm p-6 space-y-5" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold" style={{ color: c.pageText }}>
                    {sec.courseCode} &mdash; Section {sec.id.replace("sec-", "").toUpperCase()}
                  </h2>
                  <p className="text-sm" style={{ color: c.pageMuted }}>{sec.course} &middot; {sectionStudents.length} students</p>
                </div>
                <Badge text={sec.state} />
              </div>

              {dist && (
                <div>
                  <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Your Class Learning Style Breakdown</h3>
                  <div className="grid grid-cols-4 gap-3">
                    {([
                      ["Visual", dist.visual],
                      ["Auditory", dist.auditory],
                      ["Read/Write", dist.readWrite],
                      ["Kinesthetic", dist.kinesthetic],
                    ] as const).map(([label, pct], i) => (
                      <div key={label} className="rounded-lg p-4 text-center" style={{ backgroundColor: c.subtleBg, border: `1px solid ${c.cardBorder}` }}>
                        <div className="text-2xl font-bold" style={{ color: distColors[i] }}>{pct}%</div>
                        <div className="text-xs font-medium mt-1" style={{ color: c.pageMuted }}>{label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recommendations */}
              <div className="rounded-lg p-4" style={{ backgroundColor: c.infoBg, border: `1px solid ${c.infoBorder}` }}>
                <h3 className="text-sm font-semibold mb-2" style={{ color: c.infoText }}>Content Approach Recommendations</h3>
                <p className="text-sm" style={{ color: c.infoText }}>Based on the Felder-Silverman analysis of your class:</p>
                <ul className="text-sm mt-2 space-y-1 list-disc list-inside" style={{ color: c.infoText }}>
                  {dist && dist.visual >= 30 && <li>Include diagrams, flowcharts, and visual aids &mdash; {dist.visual}% are visual learners.</li>}
                  {dist && dist.auditory >= 18 && <li>Incorporate discussion and verbal explanation &mdash; {dist.auditory}% learn best through listening.</li>}
                  {dist && dist.readWrite >= 20 && <li>Provide written handouts and reading materials &mdash; {dist.readWrite}% prefer text-based learning.</li>}
                  {dist && dist.kinesthetic >= 12 && <li>Include hands-on exercises and practical labs &mdash; {dist.kinesthetic}% are kinesthetic learners.</li>}
                </ul>
              </div>

              {/* Student roster */}
              <div>
                <h3 className="text-sm font-semibold mb-2" style={{ color: c.pageMuted }}>Student Roster</h3>
                <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${c.cardBorder}` }}>
                  <table className="w-full text-sm">
                    <thead style={{ backgroundColor: c.subtleBg }}>
                      <tr>
                        <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Name</th>
                        <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Dominant Style</th>
                        <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Collaboration</th>
                        <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Participation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sectionStudents.map((s) =>
                        s ? (
                          <tr key={s.id} style={{ borderBottom: `1px solid ${c.cardBorder}22` }}>
                            <td className="px-4 py-2.5 font-medium" style={{ color: c.pageText }}>{s.name}</td>
                            <td className="px-4 py-2.5"><Badge text={s.dominantStyle} /></td>
                            <td className="px-4 py-2.5 capitalize" style={{ color: c.pageMuted }}>{s.collaborationPref}</td>
                            <td className="px-4 py-2.5 capitalize" style={{ color: c.pageMuted }}>{s.participationLevel}</td>
                          </tr>
                        ) : null
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

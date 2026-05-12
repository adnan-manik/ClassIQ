"use client";

import { sections, students, getStudent, getTeacher } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import Badge from "@/components/Badge";
import { useState } from "react";
import { Plus, ArrowRightLeft, Play } from "lucide-react";

export default function SectionBuilderPage() {
  const [activeSec, setActiveSec] = useState(sections[0]);
  const { theme } = useTheme();
  const c = theme.colors;

  const teacher = getTeacher(activeSec.teacherId);
  const sectionStudents = activeSec.studentIds.map(getStudent).filter(Boolean);
  const assignedIds = new Set(sections.flatMap((s) => s.studentIds));
  const availableStudents = students.filter((s) => !assignedIds.has(s.id));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>Section Builder</h1>
          <p className="text-sm mt-1" style={{ color: c.pageMuted }}>Create sections, assign teachers and students, then run simulations.</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition" style={{ backgroundColor: c.primary, color: c.primaryText }}>
          <Plus size={16} /> New Section
        </button>
      </div>

      {/* Section tabs */}
      <div className="flex gap-2">
        {sections.map((sec) => (
          <button
            key={sec.id}
            onClick={() => setActiveSec(sec)}
            className="px-4 py-2 rounded-lg text-sm font-medium transition"
            style={{
              backgroundColor: activeSec.id === sec.id ? c.primary : c.cardBg,
              color: activeSec.id === sec.id ? c.primaryText : c.pageText,
              border: activeSec.id === sec.id ? "none" : `1px solid ${c.cardBorder}`,
            }}
          >
            {sec.courseCode} &mdash; Section {sec.id.replace("sec-", "").toUpperCase()}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Section config */}
        <div className="col-span-2 rounded-xl shadow-sm p-6 space-y-5" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold" style={{ color: c.pageText }}>{activeSec.course}</h2>
              <p className="text-sm" style={{ color: c.pageMuted }}>{activeSec.courseCode} &middot; {activeSec.semester}</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge text={activeSec.state} />
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition" style={{ backgroundColor: "#16a34a", color: "#fff" }}>
                <Play size={14} /> Run Simulation
              </button>
            </div>
          </div>

          {/* Teacher */}
          <div className="rounded-lg p-4" style={{ backgroundColor: c.subtleBg }}>
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs" style={{ color: c.pageMuted }}>Assigned Teacher</div>
                <div className="font-semibold" style={{ color: c.pageText }}>{teacher?.name}</div>
                <div className="text-xs mt-0.5" style={{ color: c.pageMuted }}>{teacher?.teachingStyle}</div>
              </div>
              <button className="flex items-center gap-1 text-sm font-medium" style={{ color: c.primary }}>
                <ArrowRightLeft size={14} /> Change
              </button>
            </div>
          </div>

          {/* Student table */}
          <div>
            <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Enrolled Students ({sectionStudents.length})</h3>
            <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${c.cardBorder}` }}>
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: c.subtleBg }}>
                  <tr>
                    <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Name</th>
                    <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Dominant Style</th>
                    <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Collaboration</th>
                    <th className="text-left px-4 py-2 font-medium" style={{ color: c.pageMuted }}>Participation</th>
                    <th className="px-4 py-2"></th>
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
                        <td className="px-4 py-2.5 text-right">
                          <button className="text-red-500 text-xs hover:underline">Remove</button>
                        </td>
                      </tr>
                    ) : null
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Available pool */}
        <div className="rounded-xl shadow-sm p-5" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
          <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Available Students ({availableStudents.length})</h3>
          <p className="text-xs mb-3" style={{ color: c.pageMuted }}>Click to add to section</p>
          <ul className="space-y-2">
            {availableStudents.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 cursor-pointer transition"
                style={{ backgroundColor: c.subtleBg }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: c.pageText }}>{s.name}</div>
                  <div className="text-xs" style={{ color: c.pageMuted }}>{s.dominantStyle}</div>
                </div>
                <button className="text-xs font-medium" style={{ color: c.primary }}>+ Add</button>
              </li>
            ))}
            {availableStudents.length === 0 && (
              <li className="text-sm text-center py-4" style={{ color: c.pageMuted }}>All students assigned</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

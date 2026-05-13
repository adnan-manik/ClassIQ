"use client";

import Badge from "@/components/Badge";
import { BRAND } from "@/lib/brand";
import { ArrowRightLeft } from "lucide-react";
import { useState } from "react";

interface SectionData {
  id: string;
  label: string;
  state: string;
  courseCode: string;
  courseName: string;
  teacher: { full_name: string; teaching_style: string } | null;
  students: {
    id: string;
    full_name: string;
    external_id: string | null;
    dominant: string | null;
    collab: string | null;
    participation: string | null;
  }[];
}

export default function SectionTabs({ sections }: { sections: SectionData[] }) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? "");
  const active = sections.find((s) => s.id === activeId) ?? sections[0];

  return (
    <>
      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {sections.map((sec) => {
          const isActive = sec.id === activeId;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setActiveId(sec.id)}
              className="px-4 py-2 rounded-full text-sm font-medium transition"
              style={{
                backgroundColor: isActive ? BRAND.teal : "#fff",
                color: isActive ? "#fff" : BRAND.text,
                border: `1px solid ${isActive ? BRAND.teal : BRAND.cardBorder}`,
              }}
            >
              {sec.courseCode} &mdash; Section {sec.label}
            </button>
          );
        })}
      </div>

      {/* Detail */}
      {active && (
        <div
          className="rounded-2xl shadow-sm p-6 space-y-5 bg-white"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h2
                className="text-lg font-semibold"
                style={{ color: BRAND.text }}
              >
                {active.courseName}
              </h2>
              <p className="text-sm" style={{ color: BRAND.textMuted }}>
                {active.courseCode} &middot; Section {active.label}
              </p>
            </div>
            <Badge text={active.state} />
          </div>

          {/* Teacher */}
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: BRAND.subtleBg }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="min-w-0">
                <div
                  className="text-xs"
                  style={{ color: BRAND.textMuted }}
                >
                  Assigned Teacher
                </div>
                <div
                  className="font-semibold truncate"
                  style={{ color: BRAND.text }}
                >
                  {active.teacher?.full_name ?? "Unassigned"}
                </div>
                <div
                  className="text-xs mt-0.5"
                  style={{ color: BRAND.textMuted }}
                >
                  {active.teacher?.teaching_style ?? "—"}
                </div>
              </div>
              <button
                type="button"
                className="flex items-center gap-1 text-sm font-medium"
                style={{ color: BRAND.teal }}
              >
                <ArrowRightLeft size={14} /> Change
              </button>
            </div>
          </div>

          {/* Students */}
          <div>
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: BRAND.textMuted }}
            >
              Enrolled Students ({active.students.length})
            </h3>
            <div
              className="rounded-xl overflow-hidden"
              style={{ border: `1px solid ${BRAND.cardBorder}` }}
            >
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: BRAND.subtleBg }}>
                  <tr>
                    <th
                      className="text-left px-4 py-2 font-medium"
                      style={{ color: BRAND.textMuted }}
                    >
                      Name
                    </th>
                    <th
                      className="text-left px-4 py-2 font-medium hidden sm:table-cell"
                      style={{ color: BRAND.textMuted }}
                    >
                      ID
                    </th>
                    <th
                      className="text-left px-4 py-2 font-medium"
                      style={{ color: BRAND.textMuted }}
                    >
                      Dominant Style
                    </th>
                    <th
                      className="text-left px-4 py-2 font-medium hidden md:table-cell"
                      style={{ color: BRAND.textMuted }}
                    >
                      Collaboration
                    </th>
                    <th
                      className="text-left px-4 py-2 font-medium hidden md:table-cell"
                      style={{ color: BRAND.textMuted }}
                    >
                      Participation
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {active.students.map((s) => (
                    <tr
                      key={s.id}
                      style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                    >
                      <td
                        className="px-4 py-2.5 font-medium"
                        style={{ color: BRAND.text }}
                      >
                        {s.full_name}
                      </td>
                      <td
                        className="px-4 py-2.5 hidden sm:table-cell font-mono text-xs"
                        style={{ color: BRAND.textMuted }}
                      >
                        {s.external_id ?? "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        {s.dominant && <Badge text={s.dominant} />}
                      </td>
                      <td
                        className="px-4 py-2.5 capitalize hidden md:table-cell"
                        style={{ color: BRAND.textMuted }}
                      >
                        {s.collab ?? "—"}
                      </td>
                      <td
                        className="px-4 py-2.5 capitalize hidden md:table-cell"
                        style={{ color: BRAND.textMuted }}
                      >
                        {s.participation ?? "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

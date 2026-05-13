"use client";

import Badge from "@/components/Badge";
import ScoreRing from "@/components/ScoreRing";
import { simulateSection } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { ArrowRightLeft, ChevronRight, Play, Sparkles, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SectionCard {
  id: string;
  label: string;
  state: string;
  courseCode: string;
  courseName: string;
  teacher: {
    full_name: string;
    email: string;
    teaching_style: string;
    interaction_level: string;
    pacing: string;
    approach: string | null;
  } | null;
  students: {
    id: string;
    full_name: string;
    external_id: string | null;
    dominant: string | null;
    collab: string | null;
    participation: string | null;
  }[];
  sim: {
    score: number;
    outcome: string;
    social: string;
    recommended_teacher: string | null;
  } | null;
}

export default function SectionsView({
  sections,
}: {
  sections: SectionCard[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  async function handleRunSimulation(sectionId: string) {
    setRunError(null);
    setRunning(sectionId);
    try {
      await simulateSection(sectionId);
      // Refresh the server component so the new scores show in the cards.
      router.refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <>
      {/* ── Overview cards ───────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {sections.map((sec) => {
          const isOpen = selectedId === sec.id;
          return (
            <button
              key={sec.id}
              type="button"
              onClick={() => setSelectedId(isOpen ? null : sec.id)}
              className="text-left rounded-2xl bg-white p-5 transition hover:shadow-md cursor-pointer"
              style={{
                border: `1px solid ${
                  isOpen ? BRAND.teal : BRAND.cardBorder
                }`,
                boxShadow: isOpen
                  ? `0 0 0 3px ${BRAND.tealLight}`
                  : undefined,
              }}
            >
              <div className="flex items-start gap-4">
                <ScoreRing
                  score={sec.sim?.score ?? 0}
                  size={72}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="font-bold text-base truncate"
                      style={{ color: BRAND.textHeading }}
                    >
                      {sec.courseCode} &mdash; Section {sec.label}
                    </span>
                    <Badge text={sec.state} />
                  </div>
                  <div
                    className="text-xs truncate mb-1"
                    style={{ color: BRAND.textMuted }}
                  >
                    {sec.courseName}
                  </div>
                  <div
                    className="flex items-center gap-3 text-xs"
                    style={{ color: BRAND.textMuted }}
                  >
                    <span className="truncate">
                      {sec.teacher?.full_name ?? "Unassigned"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users size={12} />
                      {sec.students.length}
                    </span>
                  </div>
                </div>
              </div>

              {sec.sim && (
                <div className="flex gap-1.5 mt-3 flex-wrap">
                  <Badge text={`Outcome: ${sec.sim.outcome}`} />
                  <Badge text={sec.sim.social} />
                </div>
              )}

              <div
                className="mt-3 pt-3 flex items-center justify-between text-xs font-semibold"
                style={{
                  color: isOpen ? BRAND.teal : BRAND.textMuted,
                  borderTop: `1px dashed ${BRAND.cardBorder}`,
                }}
              >
                <span>{isOpen ? "Hide details" : "View details"}</span>
                <ChevronRight
                  size={14}
                  style={{
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                    transition: "transform 0.2s",
                  }}
                />
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Expanded detail ─────────────────────────────────────── */}
      {selected && (
        <div
          className="rounded-2xl bg-white p-6 md:p-8 space-y-6"
          style={{
            border: `2px solid ${BRAND.teal}`,
          }}
        >
          {/* Detail header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <h2
                  className="text-2xl font-extrabold tracking-tight"
                  style={{ color: BRAND.textHeading }}
                >
                  {selected.courseCode} &mdash; Section {selected.label}
                </h2>
                <Badge text={selected.state} />
              </div>
              <p
                className="text-sm"
                style={{ color: BRAND.textMuted }}
              >
                {selected.courseName}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => handleRunSimulation(selected.id)}
                disabled={running === selected.id}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: BRAND.purple }}
              >
                <Play size={14} />
                {running === selected.id ? "Running…" : "Run Simulation"}
              </button>
              {selected.sim && (
                <ScoreRing
                  score={selected.sim.score}
                  size={88}
                  label="Compatibility"
                />
              )}
            </div>
          </div>

          {runError && (
            <div
              className="text-sm rounded-xl px-4 py-3"
              style={{
                backgroundColor: "#FEE2E2",
                color: "#991B1B",
                border: "1px solid #FECACA",
              }}
            >
              {runError}
            </div>
          )}

          {/* Run summary */}
          {selected.sim && (
            <div
              className="rounded-xl p-4 flex items-center gap-3 flex-wrap"
              style={{ backgroundColor: BRAND.mintSoft }}
            >
              <Sparkles size={18} style={{ color: BRAND.teal }} />
              <div className="flex-1 min-w-0">
                <div
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: BRAND.textMuted }}
                >
                  Last Simulation Run
                </div>
                <div
                  className="text-sm mt-0.5"
                  style={{ color: BRAND.text }}
                >
                  Score <strong>{selected.sim.score}</strong> &middot; predicted{" "}
                  <strong>{selected.sim.outcome}</strong> outcome with{" "}
                  <strong>{selected.sim.social}</strong> social graph impact
                  {selected.sim.recommended_teacher &&
                    selected.sim.recommended_teacher !==
                      selected.teacher?.full_name && (
                      <>
                        {" · "}
                        engine recommends{" "}
                        <strong>{selected.sim.recommended_teacher}</strong>
                      </>
                    )}
                  .
                </div>
              </div>
            </div>
          )}

          {/* Teacher detail */}
          <div
            className="rounded-xl p-4"
            style={{ backgroundColor: BRAND.subtleBg }}
          >
            <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
              <div className="min-w-0">
                <div
                  className="text-xs font-semibold uppercase tracking-wider"
                  style={{ color: BRAND.textMuted }}
                >
                  Assigned Teacher
                </div>
                <div
                  className="font-bold mt-0.5"
                  style={{ color: BRAND.textHeading }}
                >
                  {selected.teacher?.full_name ?? "Unassigned"}
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
            {selected.teacher && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                <DetailField
                  label="Teaching Style"
                  value={selected.teacher.teaching_style}
                />
                <DetailField
                  label="Interaction Level"
                  value={selected.teacher.interaction_level}
                />
                <DetailField label="Pacing" value={selected.teacher.pacing} />
              </div>
            )}
          </div>

          {/* Students */}
          <div>
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: BRAND.textMuted }}
            >
              Enrolled Students ({selected.students.length})
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
                  {selected.students.map((s) => (
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

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg p-3" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
      <div className="text-[10px] uppercase tracking-wider" style={{ color: BRAND.textMuted }}>
        {label}
      </div>
      <div className="text-sm font-semibold capitalize mt-0.5" style={{ color: BRAND.text }}>
        {value}
      </div>
    </div>
  );
}

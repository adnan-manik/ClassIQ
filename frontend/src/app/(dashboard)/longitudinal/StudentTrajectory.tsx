"use client";

import Badge from "@/components/Badge";
import Select from "@/components/Select";
import { getStudentProfileHistory } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { FSLSM_AXES, type FslsmAxis, type StudentProfileHistory } from "@/lib/types";
import { UserRound } from "lucide-react";
import { useEffect, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXES = Object.keys(FSLSM_AXES) as FslsmAxis[];

export interface TrajectoryStudent {
  id: string;
  full_name: string;
  external_id: string | null;
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "—";

/** One student's FSLSM scores across every profile version. */
export default function StudentTrajectory({
  students,
  studentId,
  onStudentChange,
}: {
  students: TrajectoryStudent[];
  studentId: string;
  onStudentChange: (id: string) => void;
}) {
  const [loaded, setLoaded] = useState<{ id: string; history: StudentProfileHistory } | null>(null);
  const [failed, setFailed] = useState<{ id: string; message: string } | null>(null);

  useEffect(() => {
    if (!studentId) return;
    let cancelled = false;
    getStudentProfileHistory(studentId)
      .then((history) => {
        if (!cancelled) setLoaded({ id: studentId, history });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFailed({
            id: studentId,
            message: err instanceof Error ? err.message : "Could not load this student's history.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const history = loaded && loaded.id === studentId ? loaded.history : null;
  const error = failed && failed.id === studentId ? failed.message : null;
  const versions = history?.versions ?? [];
  const series = versions.map((v) => ({
    x: `v${v.version}`,
    term: v.academic_term_name,
    active_reflective: v.active_reflective_score,
    sensing_intuitive: v.sensing_intuitive_score,
    visual_verbal: v.visual_verbal_score,
    sequential_global: v.sequential_global_score,
  }));

  return (
    <div
      id="student-trajectory"
      className="rounded-3xl bg-white p-6 space-y-4 scroll-mt-6"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
            Student profile over time
          </h2>
          <p className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
            Every survey a student completes adds a profile version. Pick a student to see how
            each FSLSM axis moved.
          </p>
        </div>
        <div className="w-full sm:w-80">
          <Select
            aria-label="Student"
            value={studentId}
            onChange={onStudentChange}
            placeholder={students.length ? "Choose a student" : "No students in this scope"}
            disabled={students.length === 0}
            searchable
            searchPlaceholder="Name or student ID…"
            options={students.map((s) => ({
              value: s.id,
              label: s.full_name,
              hint: s.external_id ?? undefined,
            }))}
          />
        </div>
      </div>

      {!studentId ? (
        <div
          className="rounded-2xl p-8 text-center text-sm flex flex-col items-center gap-2"
          style={{ backgroundColor: BRAND.subtleBg, color: BRAND.textMuted }}
        >
          <UserRound size={22} aria-hidden />
          Choose a student above, or use “View” in the shifts table below.
        </div>
      ) : error ? (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
        >
          {error}
        </div>
      ) : !history ? (
        <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
          Loading…
        </p>
      ) : versions.length === 0 ? (
        <p className="text-sm" style={{ color: BRAND.textMuted }}>
          {history.full_name} has no scored profile yet.
        </p>
      ) : (
        <>
          {/* Current position + total shift */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {AXES.map((a) => {
              const meta = FSLSM_AXES[a];
              const latest = series[series.length - 1][a];
              const shift = history.shift?.[a] ?? null;
              return (
                <div key={a} className="rounded-xl p-4" style={{ backgroundColor: BRAND.subtleBg }}>
                  <div className="text-xs font-semibold" style={{ color: meta.color }}>
                    {meta.label}
                  </div>
                  <div className="text-2xl font-extrabold mt-1" style={{ color: BRAND.textHeading }}>
                    {latest > 0 ? "+" : ""}
                    {latest}
                  </div>
                  <div className="text-[11px]" style={{ color: BRAND.textMuted }}>
                    {latest === 0 ? "balanced" : `leans ${latest > 0 ? meta.poleA : meta.poleB}`}
                    {shift !== null && versions.length > 1 && (
                      <>
                        {" · "}
                        <span style={{ color: shift === 0 ? BRAND.textMuted : shift > 0 ? "#166534" : "#991B1B" }}>
                          {shift > 0 ? "+" : ""}
                          {shift} since v{versions[0].version}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {versions.length > 1 ? (
            <div className="w-full" style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={BRAND.cardBorder} />
                  <XAxis dataKey="x" stroke={BRAND.textMuted} fontSize={11} />
                  <YAxis domain={[-11, 11]} stroke={BRAND.textMuted} fontSize={11} />
                  <ReferenceLine y={0} stroke={BRAND.textSubtle} />
                  <Tooltip
                    labelFormatter={(label, payload) => {
                      const term = payload?.[0]?.payload?.term as string | null | undefined;
                      return term ? `${label} · ${term}` : String(label);
                    }}
                  />
                  {AXES.map((a) => (
                    <Line
                      key={a}
                      type="monotone"
                      dataKey={a}
                      name={FSLSM_AXES[a].label}
                      stroke={FSLSM_AXES[a].color}
                      strokeWidth={3}
                      dot={{ r: 4 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs" style={{ color: BRAND.textMuted }}>
              Only one profile version so far. A trend line appears after the student takes the
              survey again.
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Profile versions for {history.full_name}</caption>
              <thead style={{ backgroundColor: BRAND.subtleBg }}>
                <tr>
                  <th scope="col" className="text-left px-3 py-2" style={{ color: BRAND.textMuted }}>Version</th>
                  <th scope="col" className="text-left px-3 py-2" style={{ color: BRAND.textMuted }}>Term</th>
                  <th scope="col" className="text-left px-3 py-2" style={{ color: BRAND.textMuted }}>Scored</th>
                  {AXES.map((a) => (
                    <th
                      key={a}
                      scope="col"
                      className="text-right px-3 py-2"
                      style={{ color: FSLSM_AXES[a].color }}
                      title={FSLSM_AXES[a].label}
                    >
                      {FSLSM_AXES[a].poleA[0]}/{FSLSM_AXES[a].poleB[0]}
                    </th>
                  ))}
                  <th scope="col" className="text-left px-3 py-2" style={{ color: BRAND.textMuted }}>Dominant</th>
                  <th scope="col" className="text-left px-3 py-2" style={{ color: BRAND.textMuted }}>Source</th>
                </tr>
              </thead>
              <tbody>
                {[...versions].reverse().map((v) => (
                  <tr key={v.id} style={{ borderTop: `1px solid ${BRAND.cardBorder}55` }}>
                    <td className="px-3 py-2 font-semibold" style={{ color: BRAND.text }}>
                      v{v.version}
                      {v.is_current && (
                        <span className="ml-2 align-middle">
                          <Badge text="current" />
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: BRAND.text }}>
                      {v.academic_term_name ?? "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap" style={{ color: BRAND.textMuted }}>
                      {fmtDate(v.scored_at)}
                    </td>
                    {AXES.map((a) => (
                      <td key={a} className="px-3 py-2 text-right font-mono text-xs" style={{ color: BRAND.text }}>
                        {v[`${a}_score` as const]}
                      </td>
                    ))}
                    <td className="px-3 py-2">{v.dominant_axis ? <Badge text={v.dominant_axis} /> : "—"}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: BRAND.textMuted }}>
                      {v.source ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

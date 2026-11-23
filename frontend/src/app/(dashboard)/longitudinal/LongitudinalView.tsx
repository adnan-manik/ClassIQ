"use client";

import Select from "@/components/Select";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import { getLongitudinal } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { FSLSM_AXES, type FslsmAxis, type LongitudinalOverview } from "@/lib/types";
import { GitCompareArrows, Layers, TrendingUp, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import StudentTrajectory from "./StudentTrajectory";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const AXES = Object.keys(FSLSM_AXES) as FslsmAxis[];

export interface LongitudinalSection {
  id: string;
  label: string;
  courseName: string;
  departmentId: string | null;
}

export interface LongitudinalStudent {
  id: string;
  full_name: string;
  external_id: string | null;
  department_id: string | null;
}

export default function LongitudinalView({
  departments,
  sections,
  students,
  roster,
}: {
  departments: { id: string; name: string; code: string }[];
  sections: LongitudinalSection[];
  students: LongitudinalStudent[];
  roster: { section_id: string; student_id: string }[];
}) {
  const [deptId, setDeptId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [loaded, setLoaded] = useState<{ key: string; payload: LongitudinalOverview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scopeKey = `${deptId}|${sectionId}`;

  // Sections offered follow the department filter.
  const sectionChoices = useMemo(
    () => (deptId ? sections.filter((s) => s.departmentId === deptId) : sections),
    [sections, deptId],
  );
  // Students offered in the per-student view follow both filters.
  const scopeStudents = useMemo(() => {
    if (sectionId) {
      const onRoster = new Set(
        roster.filter((r) => r.section_id === sectionId).map((r) => r.student_id),
      );
      return students.filter((s) => onRoster.has(s.id));
    }
    return deptId ? students.filter((s) => s.department_id === deptId) : students;
  }, [students, roster, deptId, sectionId]);
  const shownStudentId = scopeStudents.some((s) => s.id === studentId) ? studentId : "";

  function viewStudent(id: string) {
    setStudentId(id);
    // Instant, not smooth: the card grows as the history loads, and scroll
    // anchoring would pull a still-running smooth scroll off target.
    document.getElementById("student-trajectory")?.scrollIntoView({ block: "start" });
  }

  useEffect(() => {
    let cancelled = false;
    getLongitudinal({ departmentId: deptId || null, sectionId: sectionId || null }, 20)
      .then((payload) => {
        if (!cancelled) setLoaded({ key: scopeKey, payload });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(
            err instanceof Error
              ? err.message
              : "Could not load longitudinal analytics — is the backend running?",
          );
      });
    return () => {
      cancelled = true;
    };
  }, [deptId, sectionId, scopeKey]);

  const data = loaded && loaded.key === scopeKey ? loaded.payload : null;
  const series = data
    ? data.by_term.length >= 2
      ? data.by_term.map((b) => ({ x: b.academic_term_name, n: b.profiles, ...b.mean }))
      : data.by_version.map((b) => ({ x: `v${b.version}`, n: b.profiles, ...b.mean }))
    : [];
  const seriesLabel = data && data.by_term.length >= 2 ? "academic term" : "profile version";

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
            Longitudinal Analytics
          </h1>
          <p className="text-base mt-1.5 max-w-2xl" style={{ color: BRAND.textHeading, opacity: 0.7 }}>
            How learning styles move across survey rounds. Every re-take creates a new
            profile version, so the cohort&apos;s FSLSM trajectory is tracked without
            losing history.
          </p>
        </div>
        <div className="flex items-end gap-3 flex-wrap">
          {departments.length > 1 && (
            <div>
              <div id="lg-dept" className="text-xs font-semibold mb-1" style={{ color: BRAND.textMuted }}>
                Department
              </div>
              <Select
                aria-labelledby="lg-dept"
                value={deptId}
                onChange={(v) => {
                  setError(null);
                  setDeptId(v);
                  // Drop a section that belongs to another department.
                  if (v && sections.find((x) => x.id === sectionId)?.departmentId !== v) {
                    setSectionId("");
                  }
                }}
                className="min-w-[220px]"
                options={[
                  { value: "", label: "All departments" },
                  ...departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
                ]}
              />
            </div>
          )}
          <div>
            <div id="lg-section" className="text-xs font-semibold mb-1" style={{ color: BRAND.textMuted }}>
              Section
            </div>
            <Select
              aria-labelledby="lg-section"
              value={sectionId}
              onChange={(v) => {
                setError(null);
                setSectionId(v);
              }}
              className="min-w-[240px]"
              searchPlaceholder="Course or section…"
              options={[
                { value: "", label: "All sections" },
                ...sectionChoices.map((x) => ({ value: x.id, label: x.label, hint: x.courseName })),
              ]}
            />
          </div>
        </div>
      </div>

      {error && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
        >
          {error}
        </div>
      )}

      {!data && !error && (
        <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
          Loading…
        </p>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Students profiled" value={data.students_total} icon={Users} accent={BRAND.coral} />
            <StatCard
              label="With ≥2 versions"
              value={data.students_with_history}
              icon={Layers}
              accent={BRAND.teal}
            />
            <StatCard label="Profile versions" value={data.versions_total} icon={TrendingUp} accent={BRAND.purple} />
            <StatCard
              label="Dominant axis changed"
              value={data.dominant_changed}
              icon={GitCompareArrows}
              accent={BRAND.amber}
            />
          </div>

          <StudentTrajectory
            students={scopeStudents}
            studentId={shownStudentId}
            onStudentChange={setStudentId}
          />

          {data.students_with_history === 0 ? (
            <EmptyState
              icon={TrendingUp}
              title="No re-takes yet"
              description="Longitudinal trends appear once students complete the survey a second time (a new profile version). Import another survey round from Survey Ingestion to see movement."
            />
          ) : (
            <>
              {/* Axis drift */}
              {data.axis_drift && (
                <div className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
                  <h2 className="text-xl font-extrabold tracking-tight mb-1" style={{ color: BRAND.textHeading }}>
                    Average drift (latest − first)
                  </h2>
                  <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>
                    Positive = moving toward the first pole, negative = toward the second, over
                    students with at least two versions.
                  </p>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {AXES.map((a) => {
                      const v = data.axis_drift![a];
                      const meta = FSLSM_AXES[a];
                      return (
                        <div key={a} className="rounded-xl p-4" style={{ backgroundColor: BRAND.subtleBg }}>
                          <div className="text-xs font-semibold" style={{ color: meta.color }}>
                            {meta.label}
                          </div>
                          <div className="text-2xl font-extrabold mt-1" style={{ color: BRAND.textHeading }}>
                            {v > 0 ? "+" : ""}
                            {v.toFixed(2)}
                          </div>
                          <div className="text-[11px]" style={{ color: BRAND.textMuted }}>
                            toward {v >= 0 ? meta.poleA : meta.poleB}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Cohort mean per term / version */}
          {series.length >= 1 && (
            <div className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
              <h2 className="text-xl font-extrabold tracking-tight mb-1" style={{ color: BRAND.textHeading }}>
                Cohort mean FSLSM score per {seriesLabel}
              </h2>
              <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>
                Signed mean of every profile scored in that bucket (−11…+11).
              </p>
              <div className="w-full" style={{ height: 300 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 10, right: 20, left: -10, bottom: 10 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={BRAND.cardBorder} />
                    <XAxis dataKey="x" stroke={BRAND.textMuted} fontSize={11} />
                    <YAxis domain={[-11, 11]} stroke={BRAND.textMuted} fontSize={11} />
                    <Tooltip />
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
              <div className="flex gap-3 flex-wrap mt-2 text-[11px]" style={{ color: BRAND.textMuted }}>
                {series.map((s) => (
                  <span key={s.x}>
                    {s.x}: {s.n} profile{s.n === 1 ? "" : "s"}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Top shifts */}
          {data.top_shifts.length > 0 && (
            <div className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
              <h2 className="text-xl font-extrabold tracking-tight mb-1" style={{ color: BRAND.textHeading }}>
                Largest individual shifts
              </h2>
              <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>
                Students whose profile moved the most between their first and latest survey
                (L1 distance over the four axes). Use “View” to open a student&apos;s full
                version history above.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead style={{ backgroundColor: BRAND.subtleBg }}>
                    <tr>
                      <th className="text-left px-3 py-2" style={{ color: BRAND.textMuted }}>Student</th>
                      <th className="text-right px-3 py-2" style={{ color: BRAND.textMuted }}>Versions</th>
                      {AXES.map((a) => (
                        <th key={a} className="text-right px-3 py-2" style={{ color: FSLSM_AXES[a].color }} title={FSLSM_AXES[a].label}>
                          {FSLSM_AXES[a].poleA[0]}/{FSLSM_AXES[a].poleB[0]}
                        </th>
                      ))}
                      <th className="text-right px-3 py-2" style={{ color: BRAND.textMuted }}>Magnitude</th>
                      <th className="text-left px-3 py-2" style={{ color: BRAND.textMuted }}>Dominant</th>
                      <th className="px-3 py-2">
                        <span className="sr-only">Open</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.top_shifts.map((s) => (
                      <tr key={s.student_id} style={{ borderTop: `1px solid ${BRAND.cardBorder}55` }}>
                        <td className="px-3 py-2" style={{ color: BRAND.text }}>
                          <div className="font-medium">{s.full_name}</div>
                          <div className="text-[11px] font-mono" style={{ color: BRAND.textMuted }}>
                            {s.external_id ?? "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{s.versions}</td>
                        {AXES.map((a) => (
                          <td key={a} className="px-3 py-2 text-right font-mono text-xs" style={{ color: BRAND.text }}>
                            {s.first[a]} → {s.latest[a]}{" "}
                            <span style={{ color: s.delta[a] >= 0 ? "#166534" : "#991B1B" }}>
                              ({s.delta[a] > 0 ? "+" : ""}
                              {s.delta[a]})
                            </span>
                          </td>
                        ))}
                        <td className="px-3 py-2 text-right font-bold" style={{ color: BRAND.textHeading }}>
                          {s.magnitude}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1 flex-wrap">
                            {s.dominant_from ? <Badge text={s.dominant_from} /> : "—"}
                            <span style={{ color: BRAND.textMuted }}>→</span>
                            {s.dominant_to ? <Badge text={s.dominant_to} /> : "—"}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => viewStudent(s.student_id)}
                            className="text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap"
                            style={{ color: BRAND.teal, border: `1px solid ${BRAND.cardBorder}` }}
                            aria-label={`View profile history for ${s.full_name}`}
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

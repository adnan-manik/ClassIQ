"use client";

import Select from "@/components/Select";
import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import StatCard from "@/components/StatCard";
import { getLongitudinal } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { FSLSM_AXES, type FslsmAxis, type LongitudinalOverview } from "@/lib/types";
import { GitCompareArrows, Layers, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";
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

export default function LongitudinalView({
  departments,
}: {
  departments: { id: string; name: string; code: string }[];
}) {
  const [deptId, setDeptId] = useState<string>("");
  const [loaded, setLoaded] = useState<{ key: string; payload: LongitudinalOverview } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getLongitudinal(deptId || null, 20)
      .then((payload) => {
        if (!cancelled) setLoaded({ key: deptId, payload });
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
  }, [deptId]);

  const data = loaded && loaded.key === deptId ? loaded.payload : null;
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
        {departments.length > 0 && (
          <label className="text-xs font-semibold flex items-center gap-2" style={{ color: BRAND.textMuted }}>
            Department
            <Select
              value={deptId}
              onChange={(v) => {
                setError(null);
                setDeptId(v);
              }}
              className="min-w-[220px]"
              options={[
                { value: "", label: "All departments" },
                ...departments.map((d) => ({ value: d.id, label: `${d.code} · ${d.name}` })),
              ]}
            />
          </label>
        )}
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
                (L1 distance over the four axes). Open a student on the Student Profile page
                for the full version history.
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

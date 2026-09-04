"use client";

import Badge from "@/components/Badge";
import { getStudentProfileHistory } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import { FSLSM_AXES, type FslsmAxis, type StudentProfileHistory } from "@/lib/types";
import { TrendingUp } from "lucide-react";
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

/**
 * S3 — a student's versioned FSLSM history (one row per survey submission).
 * Fetched from the backend on demand so the roster page stays light.
 */
export default function ProfileHistory({ studentId }: { studentId: string }) {
  const [data, setData] = useState<{ id: string; payload: StudentProfileHistory } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getStudentProfileHistory(studentId)
      .then((payload) => {
        if (!cancelled) setData({ id: studentId, payload });
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load history");
      });
    return () => {
      cancelled = true;
    };
  }, [studentId]);

  const history = data && data.id === studentId ? data.payload : null;

  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: BRAND.subtleBg }}>
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp size={15} style={{ color: BRAND.teal }} />
        <h3 className="text-sm font-semibold" style={{ color: BRAND.textMuted }}>
          Profile history (longitudinal)
        </h3>
      </div>

      {error && (
        <p className="text-xs" style={{ color: "#991B1B" }}>
          {error}
        </p>
      )}
      {!history && !error && (
        <p className="text-xs italic" style={{ color: BRAND.textMuted }}>
          Loading…
        </p>
      )}

      {history && history.versions.length === 0 && (
        <p className="text-xs italic" style={{ color: BRAND.textMuted }}>
          No scored versions yet.
        </p>
      )}

      {history && history.versions.length > 0 && (
        <div className="space-y-3">
          {history.versions.length >= 2 && (
            <div className="w-full bg-white rounded-lg p-2" style={{ height: 200 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={history.versions.map((v) => ({
                    version: `v${v.version}`,
                    active_reflective: v.active_reflective_score,
                    sensing_intuitive: v.sensing_intuitive_score,
                    visual_verbal: v.visual_verbal_score,
                    sequential_global: v.sequential_global_score,
                  }))}
                  margin={{ top: 8, right: 12, left: -16, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={BRAND.cardBorder} />
                  <XAxis dataKey="version" stroke={BRAND.textMuted} fontSize={11} />
                  <YAxis domain={[-11, 11]} stroke={BRAND.textMuted} fontSize={11} />
                  <Tooltip />
                  {AXES.map((axis) => (
                    <Line
                      key={axis}
                      type="monotone"
                      dataKey={axis}
                      name={FSLSM_AXES[axis].label}
                      stroke={FSLSM_AXES[axis].color}
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}

          <div className="overflow-x-auto rounded-lg bg-white" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
            <table className="w-full text-xs">
              <thead style={{ backgroundColor: BRAND.mintSoft, color: BRAND.textMuted }}>
                <tr>
                  <th className="text-left px-2 py-1.5">Ver.</th>
                  <th className="text-left px-2 py-1.5">Scored</th>
                  <th className="text-left px-2 py-1.5">Term</th>
                  <th className="text-left px-2 py-1.5">Source</th>
                  {AXES.map((a) => (
                    <th key={a} className="text-right px-2 py-1.5" title={FSLSM_AXES[a].label}>
                      {FSLSM_AXES[a].poleA[0]}/{FSLSM_AXES[a].poleB[0]}
                    </th>
                  ))}
                  <th className="text-left px-2 py-1.5">Dominant</th>
                </tr>
              </thead>
              <tbody>
                {history.versions.map((v) => (
                  <tr
                    key={v.id}
                    style={{
                      borderTop: `1px solid ${BRAND.cardBorder}55`,
                      color: BRAND.text,
                      fontWeight: v.is_current ? 600 : 400,
                    }}
                  >
                    <td className="px-2 py-1.5">
                      v{v.version}
                      {v.is_current ? " ●" : ""}
                    </td>
                    <td className="px-2 py-1.5">{new Date(v.scored_at).toLocaleDateString()}</td>
                    <td className="px-2 py-1.5">{v.academic_term_name ?? "—"}</td>
                    <td className="px-2 py-1.5 font-mono">{v.source ?? "—"}</td>
                    <td className="px-2 py-1.5 text-right">{signed(v.active_reflective_score)}</td>
                    <td className="px-2 py-1.5 text-right">{signed(v.sensing_intuitive_score)}</td>
                    <td className="px-2 py-1.5 text-right">{signed(v.visual_verbal_score)}</td>
                    <td className="px-2 py-1.5 text-right">{signed(v.sequential_global_score)}</td>
                    <td className="px-2 py-1.5">{v.dominant_axis ? <Badge text={v.dominant_axis} /> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {history.shift && (
            <p className="text-xs" style={{ color: BRAND.textMuted }}>
              Shift since first survey:{" "}
              {AXES.map((a, i) => (
                <span key={a}>
                  {i > 0 ? " · " : ""}
                  <span style={{ color: FSLSM_AXES[a].color }} className="font-semibold">
                    {FSLSM_AXES[a].poleA[0]}/{FSLSM_AXES[a].poleB[0]} {signed(history.shift![a])}
                  </span>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

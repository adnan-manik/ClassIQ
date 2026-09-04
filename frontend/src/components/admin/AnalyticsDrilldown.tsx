"use client";

import FslsmDistributionChart from "@/components/admin/charts/FslsmDistributionChart";
import StatCard from "@/components/StatCard";
import { getDepartmentAnalytics } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { InstitutionAnalyticsOverview } from "@/lib/types";
import { GitBranchPlus, GraduationCap, TrendingUp, Users } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * Department drill-down for /admin/analytics — picks a department and shows
 * its counts + FSLSM distribution from GET /api/institution/analytics/departments/{id}.
 */
export default function AnalyticsDrilldown({
  departments,
}: {
  departments: { id: string; name: string; code: string }[];
}) {
  const [deptId, setDeptId] = useState<string>(departments[0]?.id ?? "");
  const [data, setData] = useState<{ id: string; payload: InstitutionAnalyticsOverview } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deptId) return;
    let cancelled = false;
    getDepartmentAnalytics(deptId)
      .then((payload) => {
        if (!cancelled) setData({ id: deptId, payload });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load department analytics");
      });
    return () => {
      cancelled = true;
    };
  }, [deptId]);

  const current = data && data.id === deptId ? data.payload : null;

  if (departments.length === 0) {
    return (
      <p className="text-sm italic py-8 text-center" style={{ color: BRAND.textMuted }}>
        No departments yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <label className="text-xs uppercase font-semibold" style={{ color: BRAND.textMuted }}>
          Department
        </label>
        <select
          value={deptId}
          onChange={(e) => {
            setError(null);
            setDeptId(e.target.value);
          }}
          className="px-3 py-2 rounded-lg text-sm outline-none bg-white min-w-[240px]"
          style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
        >
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.code} · {d.name}
            </option>
          ))}
        </select>
        {!current && !error && (
          <span className="text-xs italic" style={{ color: BRAND.textMuted }}>
            Loading…
          </span>
        )}
      </div>

      {error && (
        <div
          className="rounded-xl p-3 text-sm"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
        >
          {error}
        </div>
      )}

      {current && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Students" value={current.student_count} icon={Users} accent={BRAND.coral} />
            <StatCard
              label="Teachers"
              value={current.teacher_count}
              icon={GraduationCap}
              accent={BRAND.teal}
            />
            <StatCard
              label="Sections"
              value={current.section_count}
              icon={GitBranchPlus}
              accent={BRAND.purple}
            />
            <StatCard
              label="Avg score"
              value={
                current.avg_compatibility_score != null
                  ? Math.round(current.avg_compatibility_score)
                  : "—"
              }
              icon={TrendingUp}
              accent={BRAND.amber}
            />
          </div>
          {current.fslsm.total_profiles === 0 ? (
            <p className="text-sm italic py-6 text-center" style={{ color: BRAND.textMuted }}>
              No scored profiles in this department yet.
            </p>
          ) : (
            <FslsmDistributionChart data={current.fslsm} />
          )}
        </>
      )}
    </div>
  );
}

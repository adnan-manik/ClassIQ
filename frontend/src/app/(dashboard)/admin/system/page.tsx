import StatCard from "@/components/StatCard";
import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { IngestionJobItem, SystemOverview } from "@/lib/types";
import {
  Building2,
  GitBranchPlus,
  GraduationCap,
  Server,
  TrendingUp,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

export default async function SystemPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("auth_users")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "super_admin") redirect("/admin");

  let overview: SystemOverview | null = null;
  let jobs: IngestionJobItem[] = [];
  let error: string | null = null;
  try {
    [overview, jobs] = await Promise.all([
      serverFetch<SystemOverview>("/api/admin/system/overview"),
      serverFetch<IngestionJobItem[]>("/api/admin/system/ingestion-jobs?limit=20"),
    ]);
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          System Health
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Platform-wide counts and recent ingestion activity.
        </p>
      </div>

      {error && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            backgroundColor: "#FEE2E2",
            color: "#991B1B",
            border: "1px solid #FECACA",
          }}
        >
          {error}
        </div>
      )}

      {overview && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Institutions"
              value={overview.institutions}
              icon={Building2}
              accent={BRAND.teal}
            />
            <StatCard
              label="Students"
              value={overview.students}
              icon={Users}
              accent={BRAND.coral}
            />
            <StatCard
              label="Teachers"
              value={overview.teachers}
              icon={GraduationCap}
              accent={BRAND.indigo}
            />
            <StatCard
              label="Sections"
              value={overview.sections}
              icon={GitBranchPlus}
              accent={BRAND.purple}
            />
          </div>

          <StatCard
            label="Simulations (last 30 days)"
            value={overview.simulations_last_30d}
            icon={TrendingUp}
            accent={BRAND.amber}
          />

          <div
            className="rounded-3xl bg-white p-6"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <h2
              className="text-xl font-extrabold tracking-tight mb-4"
              style={{ color: BRAND.textHeading }}
            >
              Users by Role
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {overview.users_by_role.map((r) => (
                <div
                  key={r.role}
                  className="rounded-xl p-4"
                  style={{ backgroundColor: BRAND.subtleBg }}
                >
                  <div
                    className="text-xs uppercase tracking-wider"
                    style={{ color: BRAND.textMuted }}
                  >
                    {r.role.replace("_", " ")}
                  </div>
                  <div
                    className="text-2xl font-extrabold mt-1"
                    style={{ color: BRAND.textHeading }}
                  >
                    {r.count}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div
        className="rounded-3xl bg-white p-6"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <div className="flex items-center gap-2 mb-4">
          <Server size={18} style={{ color: BRAND.teal }} />
          <h2
            className="text-xl font-extrabold tracking-tight"
            style={{ color: BRAND.textHeading }}
          >
            Recent Ingestion Jobs
          </h2>
        </div>
        {jobs.length === 0 ? (
          <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
            No ingestion jobs yet.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: BRAND.subtleBg }}>
              <tr>
                <th className="text-left px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Institution
                </th>
                <th className="text-left px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Source
                </th>
                <th className="text-left px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Status
                </th>
                <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                  When
                </th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => (
                <tr
                  key={j.id}
                  style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                >
                  <td className="px-4 py-2.5" style={{ color: BRAND.text }}>
                    {j.institution_name ?? "—"}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: BRAND.textMuted }}>
                    {j.source}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{
                        backgroundColor:
                          j.status === "succeeded"
                            ? "#DCFCE7"
                            : j.status === "failed"
                              ? "#FEE2E2"
                              : j.status === "partial"
                                ? "#FEF3C7"
                                : BRAND.subtleBg,
                        color:
                          j.status === "succeeded"
                            ? "#166534"
                            : j.status === "failed"
                              ? "#991B1B"
                              : j.status === "partial"
                                ? "#92400E"
                                : BRAND.textMuted,
                      }}
                    >
                      {j.status}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-xs" style={{ color: BRAND.textMuted }}>
                    {new Date(j.created_at).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

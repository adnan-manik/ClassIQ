import DepartmentsBarChart from "@/components/admin/charts/DepartmentsBarChart";
import FslsmDistributionChart from "@/components/admin/charts/FslsmDistributionChart";
import ScoreTrendChart from "@/components/admin/charts/ScoreTrendChart";
import StatCard from "@/components/StatCard";
import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type {
  InstitutionAnalyticsOverview,
  ScoreTrendPoint,
  UserRole,
} from "@/lib/types";
import {
  GitBranchPlus,
  GraduationCap,
  TrendingUp,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

export default async function AnalyticsPage() {
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
  const role = profile?.role as UserRole | undefined;
  if (role !== "institution_admin" && role !== "super_admin") redirect("/admin");

  let overview: InstitutionAnalyticsOverview | null = null;
  let trend: ScoreTrendPoint[] = [];
  let error: string | null = null;
  try {
    [overview, trend] = await Promise.all([
      serverFetch<InstitutionAnalyticsOverview>(
        "/api/institution/analytics/overview",
      ),
      serverFetch<ScoreTrendPoint[]>(
        "/api/institution/analytics/score-trend?weeks=12",
      ),
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
          Analytics
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Institution-wide breakdowns: learning styles, scoring trends, and
          per-department activity.
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
              label="Students"
              value={overview.student_count}
              icon={Users}
              accent={BRAND.coral}
            />
            <StatCard
              label="Teachers"
              value={overview.teacher_count}
              icon={GraduationCap}
              accent={BRAND.teal}
            />
            <StatCard
              label="Sections"
              value={overview.section_count}
              icon={GitBranchPlus}
              accent={BRAND.purple}
            />
            <StatCard
              label="Avg score"
              value={
                overview.avg_compatibility_score != null
                  ? Math.round(overview.avg_compatibility_score)
                  : "—"
              }
              icon={TrendingUp}
              accent={BRAND.amber}
            />
          </div>

          <div
            className="rounded-3xl bg-white p-6"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <h2
              className="text-xl font-extrabold tracking-tight mb-2"
              style={{ color: BRAND.textHeading }}
            >
              FSLSM distribution
            </h2>
            <p
              className="text-xs mb-4"
              style={{ color: BRAND.textMuted }}
            >
              Current student profiles split by pole on each of the four axes.{" "}
              ({overview.fslsm.total_profiles} profiles)
            </p>
            {overview.fslsm.total_profiles === 0 ? (
              <p
                className="text-sm italic py-12 text-center"
                style={{ color: BRAND.textMuted }}
              >
                No student profiles yet — distribution will populate once survey
                data is ingested.
              </p>
            ) : (
              <FslsmDistributionChart data={overview.fslsm} />
            )}
          </div>

          <div
            className="rounded-3xl bg-white p-6"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <h2
              className="text-xl font-extrabold tracking-tight mb-2"
              style={{ color: BRAND.textHeading }}
            >
              Compatibility score trend (last 12 weeks)
            </h2>
            {trend.length === 0 ? (
              <p
                className="text-sm italic py-12 text-center"
                style={{ color: BRAND.textMuted }}
              >
                No simulations yet — run one from the Section Builder.
              </p>
            ) : (
              <ScoreTrendChart data={trend} />
            )}
          </div>

          <div
            className="rounded-3xl bg-white p-6"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <h2
              className="text-xl font-extrabold tracking-tight mb-4"
              style={{ color: BRAND.textHeading }}
            >
              Department activity
            </h2>
            {overview.departments.length === 0 ? (
              <p
                className="text-sm italic py-12 text-center"
                style={{ color: BRAND.textMuted }}
              >
                No departments yet.
              </p>
            ) : (
              <DepartmentsBarChart data={overview.departments} />
            )}
          </div>
        </>
      )}
    </div>
  );
}

import StatCard from "@/components/StatCard";
import { getAuthContext } from "@/lib/auth";
import { BRAND } from "@/lib/brand";
import { ApiError, serverFetch } from "@/lib/api.server";
import type {
  AdminInstitution,
  InstitutionAnalyticsOverview,
  SystemOverview,
  UserRole,
} from "@/lib/types";
import {
  AlertTriangle,
  Building2,
  GitBranchPlus,
  GraduationCap,
  TrendingUp,
  Users,
} from "lucide-react";
import { redirect } from "next/navigation";

export default async function AdminOverviewPage() {
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");

  if (!profile) redirect("/login");
  const role = profile.role as UserRole;

  if (role === "super_admin") {
    return <SuperAdminOverview />;
  }
  if (role === "institution_admin") {
    return <InstitutionAdminOverview institutionName={profile.full_name ?? ""} />;
  }
  redirect("/");
}

// ─── Super Admin overview ───────────────────────────────────────────────────

async function SuperAdminOverview() {
  let overview: SystemOverview | null = null;
  let institutions: AdminInstitution[] = [];
  let error: string | null = null;
  try {
    [overview, institutions] = await Promise.all([
      serverFetch<SystemOverview>("/api/admin/system/overview"),
      serverFetch<AdminInstitution[]>("/api/admin/institutions"),
    ]);
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          Super Admin
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Platform-wide view across all institutions.
        </p>
      </div>

      {error && <ApiErrorBanner message={error} />}

      {overview && (
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
            label="Sims (30d)"
            value={overview.simulations_last_30d}
            icon={TrendingUp}
            accent={BRAND.amber}
          />
        </div>
      )}

      <div
        className="rounded-3xl bg-white p-6"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <h2
          className="text-xl font-extrabold tracking-tight mb-4"
          style={{ color: BRAND.textHeading }}
        >
          Institutions ({institutions.length})
        </h2>
        {institutions.length === 0 ? (
          <p
            className="text-sm italic"
            style={{ color: BRAND.textMuted }}
          >
            No institutions yet. Use the Institutions page to onboard the first one.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: BRAND.subtleBg }}>
              <tr>
                <th className="text-left px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Name
                </th>
                <th className="text-left px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Slug
                </th>
                <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Depts
                </th>
                <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Users
                </th>
                <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                  Students
                </th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr
                  key={inst.id}
                  style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ color: BRAND.text }}>
                    {inst.name}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: BRAND.textMuted }}>
                    {inst.slug}
                  </td>
                  <td className="px-4 py-2.5 text-right" style={{ color: BRAND.text }}>
                    {inst.department_count}
                  </td>
                  <td className="px-4 py-2.5 text-right" style={{ color: BRAND.text }}>
                    {inst.user_count}
                  </td>
                  <td className="px-4 py-2.5 text-right" style={{ color: BRAND.text }}>
                    {inst.student_count}
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

// ─── Institution Admin overview ─────────────────────────────────────────────

async function InstitutionAdminOverview({
  institutionName,
}: {
  institutionName: string;
}) {
  let overview: InstitutionAnalyticsOverview | null = null;
  let error: string | null = null;
  try {
    overview = await serverFetch<InstitutionAnalyticsOverview>(
      "/api/institution/analytics/overview",
    );
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          Institution Admin
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Welcome, {institutionName}.
        </p>
      </div>

      {error && <ApiErrorBanner message={error} />}

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
              label="Avg Score"
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
              className="text-xl font-extrabold tracking-tight mb-4"
              style={{ color: BRAND.textHeading }}
            >
              Department Rollup
            </h2>
            {overview.departments.length === 0 ? (
              <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
                No departments yet. Create one under Departments.
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead style={{ backgroundColor: BRAND.subtleBg }}>
                  <tr>
                    <th className="text-left px-4 py-2" style={{ color: BRAND.textMuted }}>
                      Department
                    </th>
                    <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                      Students
                    </th>
                    <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                      Teachers
                    </th>
                    <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                      Sections
                    </th>
                    <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                      Avg score
                    </th>
                    <th className="text-right px-4 py-2" style={{ color: BRAND.textMuted }}>
                      Sims
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.departments.map((d) => (
                    <tr
                      key={d.department_id}
                      style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                    >
                      <td className="px-4 py-2.5 font-medium" style={{ color: BRAND.text }}>
                        <span className="font-mono text-xs mr-2" style={{ color: BRAND.textMuted }}>
                          {d.department_code}
                        </span>
                        {d.department_name}
                      </td>
                      <td className="px-4 py-2.5 text-right">{d.student_count}</td>
                      <td className="px-4 py-2.5 text-right">{d.teacher_count}</td>
                      <td className="px-4 py-2.5 text-right">{d.section_count}</td>
                      <td className="px-4 py-2.5 text-right">
                        {d.avg_compatibility_score != null
                          ? Math.round(d.avg_compatibility_score)
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">{d.simulations_run}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ApiErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl p-4 flex items-start gap-3"
      style={{
        backgroundColor: "#FEE2E2",
        color: "#991B1B",
        border: "1px solid #FECACA",
      }}
    >
      <AlertTriangle size={20} className="shrink-0 mt-0.5" />
      <div className="text-sm">
        <div className="font-semibold mb-0.5">Couldn&apos;t load data</div>
        <div className="font-mono text-xs opacity-90">{message}</div>
      </div>
    </div>
  );
}

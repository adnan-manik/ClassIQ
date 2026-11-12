import { getAuthContext } from "@/lib/auth";
import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import type { DepartmentItem, InstitutionUserListItem, UserRole } from "@/lib/types";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import AssignHodForm from "./AssignHodForm";

export default async function DepartmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");
  const role = profile?.role as UserRole | undefined;
  if (role !== "institution_admin" && role !== "super_admin") redirect("/admin");

  let dept: DepartmentItem | null = null;
  let hodCandidates: InstitutionUserListItem[] = [];
  let error: string | null = null;
  try {
    [dept, hodCandidates] = await Promise.all([
      serverFetch<DepartmentItem>(`/api/institution/departments/${id}`),
      serverFetch<InstitutionUserListItem[]>("/api/institution/users?role=hod"),
    ]);
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <Link
        href="/admin/departments"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        style={{ color: BRAND.teal }}
      >
        <ArrowLeft size={15} />
        Back to departments
      </Link>

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

      {dept && (
        <>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span
                className="font-mono text-xs px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: BRAND.tealLight,
                  color: BRAND.tealDark,
                }}
              >
                {dept.code}
              </span>
              <h1
                className="text-4xl font-extrabold tracking-tight"
                style={{ color: BRAND.textHeading }}
              >
                {dept.name}
              </h1>
            </div>
            <p className="text-sm mt-1.5" style={{ color: BRAND.textMuted }}>
              {dept.student_count} students · {dept.teacher_count} teachers ·{" "}
              {dept.course_count} courses
            </p>
          </div>

          <div
            className="rounded-3xl bg-white p-6"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <h2
              className="text-xl font-extrabold tracking-tight mb-4"
              style={{ color: BRAND.textHeading }}
            >
              Heads of Department
            </h2>
            {dept.hods.length === 0 ? (
              <p
                className="text-sm italic mb-4"
                style={{ color: BRAND.textMuted }}
              >
                No HoD assigned yet.
              </p>
            ) : (
              <ul className="space-y-2 mb-5">
                {dept.hods.map((h) => (
                  <li
                    key={h.auth_user_id}
                    className="flex items-center justify-between rounded-xl px-4 py-2.5"
                    style={{ backgroundColor: BRAND.subtleBg }}
                  >
                    <div>
                      <div
                        className="font-medium"
                        style={{ color: BRAND.text }}
                      >
                        {h.full_name}
                      </div>
                      <div
                        className="text-xs font-mono"
                        style={{ color: BRAND.textMuted }}
                      >
                        {h.email}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            <AssignHodForm
              departmentId={dept.id}
              candidates={hodCandidates}
              assignedIds={dept.hods.map((h) => h.auth_user_id)}
            />
          </div>
        </>
      )}
    </div>
  );
}

import CreateDepartmentDialog from "@/components/admin/CreateDepartmentDialog";
import EmptyState from "@/components/EmptyState";
import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { DepartmentItem, UserRole } from "@/lib/types";
import { GitBranchPlus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function DepartmentsPage() {
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

  let depts: DepartmentItem[] = [];
  let error: string | null = null;
  try {
    depts = await serverFetch<DepartmentItem[]>("/api/institution/departments");
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-4xl font-extrabold tracking-tight"
            style={{ color: BRAND.textHeading }}
          >
            Departments
          </h1>
          <p
            className="text-base mt-1.5"
            style={{ color: BRAND.textHeading, opacity: 0.7 }}
          >
            Organise your institution into departments and assign HoDs.
          </p>
        </div>
        <CreateDepartmentDialog />
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

      {depts.length === 0 && !error ? (
        <EmptyState
          icon={GitBranchPlus}
          title="No departments yet"
          description="Create your first department to start grouping teachers, students, and courses."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {depts.map((d) => (
            <Link
              key={d.id}
              href={`/admin/departments/${d.id}`}
              className="rounded-2xl bg-white p-5 transition hover:shadow-md"
              style={{ border: `1px solid ${BRAND.cardBorder}` }}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="font-mono text-xs px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: BRAND.tealLight,
                    color: BRAND.tealDark,
                  }}
                >
                  {d.code}
                </span>
                <h2
                  className="font-extrabold tracking-tight truncate"
                  style={{ color: BRAND.textHeading }}
                >
                  {d.name}
                </h2>
              </div>
              <div
                className="text-xs mt-2"
                style={{ color: BRAND.textMuted }}
              >
                {d.student_count} students · {d.teacher_count} teachers ·{" "}
                {d.course_count} courses
              </div>
              {d.hods.length > 0 && (
                <div
                  className="mt-3 text-xs"
                  style={{ color: BRAND.text }}
                >
                  <span
                    className="font-semibold mr-1.5 uppercase text-[10px]"
                    style={{ color: BRAND.textMuted }}
                  >
                    HoD:
                  </span>
                  {d.hods.map((h) => h.full_name).join(", ")}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

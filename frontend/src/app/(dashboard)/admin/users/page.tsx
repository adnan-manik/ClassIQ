import CreateUserDialog from "@/components/admin/CreateUserDialog";
import EmptyState from "@/components/EmptyState";
import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type {
  DepartmentItem,
  InstitutionUserListItem,
  UserRole,
} from "@/lib/types";
import { FileSpreadsheet, Users } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function UsersPage() {
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

  let users: InstitutionUserListItem[] = [];
  let depts: DepartmentItem[] = [];
  let error: string | null = null;
  try {
    [users, depts] = await Promise.all([
      serverFetch<InstitutionUserListItem[]>("/api/institution/users"),
      serverFetch<DepartmentItem[]>("/api/institution/departments"),
    ]);
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
            Users
          </h1>
          <p
            className="text-base mt-1.5"
            style={{ color: BRAND.textHeading, opacity: 0.7 }}
          >
            HoDs, teachers, and students in your institution.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/admin/users/import"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: BRAND.subtleBg,
              color: BRAND.text,
              border: `1px solid ${BRAND.cardBorder}`,
            }}
          >
            <FileSpreadsheet size={16} /> Import CSV
          </Link>
          <CreateUserDialog departments={depts} />
        </div>
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

      {users.length === 0 && !error ? (
        <EmptyState
          icon={Users}
          title="No users yet"
          description="Create one with the button above, or bulk-import from a CSV."
        />
      ) : (
        <div
          className="rounded-3xl bg-white overflow-hidden"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: BRAND.subtleBg }}>
              <tr>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Name
                </th>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Email
                </th>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Role
                </th>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Departments
                </th>
                <th className="text-right px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Status
                </th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                >
                  <td className="px-4 py-2.5 font-medium" style={{ color: BRAND.text }}>
                    {u.full_name}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: BRAND.textMuted }}>
                    {u.email}
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full capitalize"
                      style={{
                        backgroundColor: BRAND.tealLight,
                        color: BRAND.tealDark,
                      }}
                    >
                      {u.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: BRAND.textMuted }}>
                    {u.department_codes.join(", ") || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span
                      className="text-xs"
                      style={{
                        color: u.is_active ? BRAND.scoreHigh : BRAND.scoreLow,
                      }}
                    >
                      {u.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

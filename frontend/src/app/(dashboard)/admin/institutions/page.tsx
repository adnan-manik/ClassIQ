import CreateInstitutionDialog from "@/components/admin/CreateInstitutionDialog";
import EmptyState from "@/components/EmptyState";
import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { AdminInstitution } from "@/lib/types";
import { Building2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function InstitutionsPage() {
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

  let institutions: AdminInstitution[] = [];
  let error: string | null = null;
  try {
    institutions = await serverFetch<AdminInstitution[]>(
      "/api/admin/institutions",
    );
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
            Institutions
          </h1>
          <p
            className="text-base mt-1.5"
            style={{ color: BRAND.textHeading, opacity: 0.7 }}
          >
            Onboard new institutions and provision their first admin user.
          </p>
        </div>
        <CreateInstitutionDialog />
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

      {institutions.length === 0 && !error ? (
        <EmptyState
          icon={Building2}
          title="No institutions yet"
          description="Create the first one with the button above."
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
                  Institution
                </th>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Slug
                </th>
                <th className="text-right px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Depts
                </th>
                <th className="text-right px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Users
                </th>
                <th className="text-right px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Students
                </th>
                <th className="text-right px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              {institutions.map((inst) => (
                <tr
                  key={inst.id}
                  style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                >
                  <td className="px-4 py-3 font-medium" style={{ color: BRAND.text }}>
                    <Link
                      href={`/admin/institutions/${inst.id}`}
                      style={{ color: BRAND.teal }}
                      className="hover:underline"
                    >
                      {inst.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs" style={{ color: BRAND.textMuted }}>
                    {inst.slug}
                  </td>
                  <td className="px-4 py-3 text-right">{inst.department_count}</td>
                  <td className="px-4 py-3 text-right">{inst.user_count}</td>
                  <td className="px-4 py-3 text-right">{inst.student_count}</td>
                  <td className="px-4 py-3 text-right text-xs" style={{ color: BRAND.textMuted }}>
                    {new Date(inst.created_at).toLocaleDateString()}
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

import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { AdminInstitutionDetail } from "@/lib/types";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function InstitutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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

  let inst: AdminInstitutionDetail | null = null;
  let error: string | null = null;
  try {
    inst = await serverFetch<AdminInstitutionDetail>(
      `/api/admin/institutions/${id}`,
    );
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <Link
        href="/admin/institutions"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        style={{ color: BRAND.teal }}
      >
        <ArrowLeft size={15} />
        Back to institutions
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

      {inst && (
        <>
          <div>
            <h1
              className="text-4xl font-extrabold tracking-tight"
              style={{ color: BRAND.textHeading }}
            >
              {inst.name}
            </h1>
            <p
              className="text-sm mt-1.5 font-mono"
              style={{ color: BRAND.textMuted }}
            >
              {inst.slug} · created {new Date(inst.created_at).toLocaleDateString()}
            </p>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Stat label="Departments" value={inst.department_count} />
            <Stat label="Users" value={inst.user_count} />
            <Stat label="Students" value={inst.student_count} />
          </div>

          <div
            className="rounded-3xl bg-white p-6"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <h2
              className="text-xl font-extrabold tracking-tight mb-4"
              style={{ color: BRAND.textHeading }}
            >
              Departments
            </h2>
            {inst.departments.length === 0 ? (
              <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
                No departments yet.
              </p>
            ) : (
              <ul className="space-y-2">
                {inst.departments.map((d) => (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-xl px-4 py-2.5"
                    style={{ backgroundColor: BRAND.subtleBg }}
                  >
                    <span
                      className="font-medium"
                      style={{ color: BRAND.text }}
                    >
                      <span
                        className="font-mono text-xs mr-3"
                        style={{ color: BRAND.textMuted }}
                      >
                        {d.code}
                      </span>
                      {d.name}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      <div
        className="text-xs uppercase tracking-wider font-semibold"
        style={{ color: BRAND.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-3xl font-extrabold mt-2"
        style={{ color: BRAND.textHeading }}
      >
        {value}
      </div>
    </div>
  );
}

import { getAuthContext } from "@/lib/auth";
import { ApiError, serverFetch } from "@/lib/api.server";
import { BRAND } from "@/lib/brand";
import type { AuditEntry, UserRole } from "@/lib/types";
import { ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";

export default async function AuditPage() {
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");

  if (!profile) redirect("/login");
  const role = profile.role as UserRole;
  if (role !== "super_admin" && role !== "institution_admin") {
    redirect("/admin");
  }

  const endpoint =
    role === "super_admin"
      ? "/api/admin/system/audit?limit=200"
      : "/api/institution/audit?limit=200";

  let entries: AuditEntry[] = [];
  let error: string | null = null;
  try {
    entries = await serverFetch<AuditEntry[]>(endpoint);
  } catch (err) {
    error = err instanceof ApiError ? err.message : "Failed to load";
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck size={28} style={{ color: BRAND.teal }} />
        <div>
          <h1
            className="text-4xl font-extrabold tracking-tight"
            style={{ color: BRAND.textHeading }}
          >
            Audit Log
          </h1>
          <p
            className="text-base mt-1.5"
            style={{ color: BRAND.textHeading, opacity: 0.7 }}
          >
            {role === "super_admin"
              ? "All mutating actions across every institution."
              : "All mutating actions inside your institution."}
          </p>
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

      {entries.length === 0 && !error ? (
        <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
          No audit entries yet.
        </p>
      ) : (
        <div
          className="rounded-3xl bg-white overflow-hidden"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: BRAND.subtleBg }}>
              <tr>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  When
                </th>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Actor
                </th>
                {role === "super_admin" && (
                  <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                    Institution
                  </th>
                )}
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Action
                </th>
                <th className="text-left px-4 py-2.5" style={{ color: BRAND.textMuted }}>
                  Entity
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr
                  key={e.id}
                  style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                >
                  <td className="px-4 py-2.5 text-xs whitespace-nowrap" style={{ color: BRAND.textMuted }}>
                    {new Date(e.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5 text-xs" style={{ color: BRAND.text }}>
                    {e.actor_email ?? "—"}
                  </td>
                  {role === "super_admin" && (
                    <td className="px-4 py-2.5 text-xs" style={{ color: BRAND.text }}>
                      {e.institution_name ?? "—"}
                    </td>
                  )}
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: BRAND.teal }}>
                    {e.action}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs" style={{ color: BRAND.textMuted }}>
                    {e.entity_type}
                    {e.entity_id && (
                      <span className="opacity-50"> · {e.entity_id.slice(0, 8)}</span>
                    )}
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

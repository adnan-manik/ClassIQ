import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { redirect } from "next/navigation";
import LongitudinalView from "./LongitudinalView";

/** S3 — Longitudinal learning-style analytics (HoD / institution admin). */
export default async function LongitudinalPage() {
  const supabase = await createClient();
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");

  const role = profile?.role as UserRole | undefined;
  if (role !== "hod" && role !== "institution_admin" && role !== "super_admin") {
    redirect("/");
  }

  // Option lists for the department / section / student pickers (RLS-scoped).
  const [{ data: departments }, { data: sections }, { data: students }, { data: roster }] =
    await Promise.all([
      supabase.from("departments").select("id, name, code").order("name"),
      supabase
        .from("sections")
        .select("id, label, course:courses(code, name, department_id)")
        .order("label"),
      supabase
        .from("students")
        .select("id, full_name, external_id, department_id")
        .is("deleted_at", null)
        .order("full_name"),
      supabase.from("section_students").select("section_id, student_id").is("removed_at", null),
    ]);

  type Co = { code: string; name: string; department_id: string | null };
  const sectionOpts = (sections ?? [])
    .map((s) => {
      const c = (Array.isArray(s.course) ? s.course[0] : s.course) as Co | null;
      return {
        id: s.id as string,
        label: `${c?.code ?? "—"} — Section ${s.label}`,
        courseName: c?.name ?? "",
        departmentId: c?.department_id ?? null,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <LongitudinalView
      departments={(departments ?? []).map((d) => ({
        id: d.id as string,
        name: d.name as string,
        code: d.code as string,
      }))}
      sections={sectionOpts}
      students={(students ?? []).map((s) => ({
        id: s.id as string,
        full_name: s.full_name as string,
        external_id: (s.external_id as string | null) ?? null,
        department_id: (s.department_id as string | null) ?? null,
      }))}
      roster={(roster ?? []).map((r) => ({
        section_id: r.section_id as string,
        student_id: r.student_id as string,
      }))}
    />
  );
}

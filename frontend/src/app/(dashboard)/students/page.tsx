import StudentsView from "./StudentsView";
import { getAuthContext } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DepartmentOption, StudentWithProfile } from "@/lib/types";

// Roles the backend's POST /institution/users accepts for creating students.
const CAN_CREATE_STUDENTS = new Set(["super_admin", "institution_admin", "hod"]);

export default async function StudentsPage() {
  const supabase = await createClient();
  const { profile: me } = await getAuthContext();

  const [{ data: students, error: studentsError }, { data: departments }, hodDepts] =
    await Promise.all([
      supabase
        .from("students")
        .select(
          `
            id, institution_id, department_id, external_id, full_name, email,
            program, batch, current_semester,
            profiles:student_profiles!student_profiles_student_id_fkey(
              id, student_id, version, is_current, scored_at,
              active_reflective_score, sensing_intuitive_score,
              visual_verbal_score, sequential_global_score, dominant_axis
            ),
            aux:student_aux_profiles!student_aux_profiles_student_id_fkey(
              collaboration_pref, participation_level, is_current
            )
          `,
        )
        .order("full_name"),
      supabase
        .from("departments")
        .select("id, code, name, institution_id")
        .is("deleted_at", null)
        .order("code"),
      // An HoD may only create students in departments they're assigned to.
      me?.role === "hod"
        ? supabase
            .from("user_departments")
            .select("department_id")
            .eq("auth_user_id", me.id)
        : Promise.resolve(null),
    ]);

  if (studentsError) {
    console.error("students page: failed to load students", studentsError);
  }

  // Every department RLS lets us see — used only to label existing students.
  // A super_admin can see other institutions' departments here.
  const allDepartments: DepartmentOption[] = (departments ?? []).map(
    ({ id, code, name }) => ({ id, code, name }),
  );

  // The create endpoint always writes into the caller's own institution and
  // rejects departments from any other, so only offer those.
  const ownDepartments: DepartmentOption[] = (departments ?? [])
    .filter((d) => me?.institution_id && d.institution_id === me.institution_id)
    .map(({ id, code, name }) => ({ id, code, name }));

  // An HoD is further limited to the departments they're assigned to.
  const creatableDepartments =
    hodDepts && "data" in hodDepts
      ? ownDepartments.filter((d) =>
          (hodDepts.data ?? []).some((ud) => ud.department_id === d.id),
        )
      : ownDepartments;

  // Flatten: pick the is_current profile (and aux) per student
  const rows: (StudentWithProfile & {
    aux: { collaboration_pref: string | null; participation_level: string | null } | null;
  })[] = (students ?? []).map((s) => {
    const profile = (s.profiles ?? []).find((p) => p.is_current) ?? null;
    const aux = (s.aux ?? []).find((a) => a.is_current) ?? null;
    return {
      id: s.id,
      institution_id: s.institution_id,
      department_id: s.department_id,
      external_id: s.external_id,
      full_name: s.full_name,
      email: s.email,
      program: s.program,
      batch: s.batch,
      current_semester: s.current_semester,
      profile,
      aux,
    };
  });

  return (
    <StudentsView
      students={rows}
      departments={allDepartments}
      creatableDepartments={creatableDepartments}
      canCreate={!!me && CAN_CREATE_STUDENTS.has(me.role)}
      restrictedToAssigned={me?.role === "hod"}
    />
  );
}

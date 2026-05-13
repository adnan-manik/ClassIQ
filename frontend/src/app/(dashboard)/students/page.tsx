import StudentsView from "./StudentsView";
import { createClient } from "@/lib/supabase/server";
import type { StudentWithProfile } from "@/lib/types";

export default async function StudentsPage() {
  const supabase = await createClient();

  const { data: students } = await supabase
    .from("students")
    .select(
      `
        id, institution_id, department_id, external_id, full_name, email,
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
    .order("full_name");

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
      profile,
      aux,
    };
  });

  return <StudentsView students={rows} />;
}

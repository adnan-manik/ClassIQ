import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import SectionsView from "./SectionsView";

export default async function SectionsPage() {
  const supabase = await createClient();

  const [
    { data: sections },
    { data: enrollments },
    { data: simResults },
    { data: teacherOpts },
    { data: courseOpts },
    { data: termOpts },
    { data: studentOpts },
  ] = await Promise.all([
    supabase
      .from("sections")
      .select(
        `
            id, label, state, created_at,
            course:courses(code, name),
            teacher:teachers(id, full_name, email,
              profile:teacher_profiles!teacher_profiles_teacher_id_fkey(
                is_current, teaching_style, interaction_level, pacing, approach
              )
            )
          `,
      )
      .order("label"),
    supabase.from("section_students").select(
      `
            section_id, student_id,
            student:students(
              id, full_name, external_id,
              profile:student_profiles!student_profiles_student_id_fkey(
                is_current, dominant_axis
              ),
              aux:student_aux_profiles!student_aux_profiles_student_id_fkey(
                is_current, collaboration_pref, participation_level
              )
            )
          `,
    ),
    // Newest first, so the grouping below can keep each section's latest
    // result. Unordered, PostgREST returned the runs in no particular order
    // and the card showed whichever one happened to come last.
    supabase
      .from("simulation_results")
      .select(
        `
            section_id, compatibility_score, predicted_outcome, social_graph_impact,
            created_at,
            recommended:teachers!simulation_results_recommended_teacher_id_fkey(full_name)
          `,
      )
      .not("section_id", "is", null)
      .order("created_at", { ascending: false }),
    // Option lists for the "New Section" / "Change teacher" forms.
    supabase.from("teachers").select("id, full_name").order("full_name"),
    supabase.from("courses").select("id, code, name").order("code"),
    supabase
      .from("academic_terms")
      .select("id, name, is_active")
      .order("name"),
    supabase
      .from("students")
      .select("id, full_name, external_id")
      .order("full_name"),
  ]);

  // Group enrollments + sim results by section_id
  const studentsBySection = new Map<string, NonNullable<typeof enrollments>>();
  for (const e of enrollments ?? []) {
    if (!studentsBySection.has(e.section_id)) {
      studentsBySection.set(e.section_id, []);
    }
    studentsBySection.get(e.section_id)!.push(e);
  }
  // First row wins, which with the newest-first ordering above is the latest
  // result for that section.
  type SimRow = NonNullable<typeof simResults>[number];
  const simBySec = new Map<string, SimRow>();
  for (const r of simResults ?? []) {
    if (r.section_id && !simBySec.has(r.section_id)) {
      simBySec.set(r.section_id, r);
    }
  }

  const cards = (sections ?? []).map((sec) => {
    type CT = { code: string; name: string };
    type Tp = {
      is_current: boolean;
      teaching_style: string;
      interaction_level: string;
      pacing: string;
      approach: string | null;
    };
    type Tr = { id: string; full_name: string; email: string; profile: Tp[] };
    const course = (Array.isArray(sec.course)
      ? sec.course[0]
      : sec.course) as CT | null;
    const teacher = (Array.isArray(sec.teacher)
      ? sec.teacher[0]
      : sec.teacher) as Tr | null;
    const teacherProfile = teacher?.profile?.find((p) => p.is_current) ?? null;
    const sim = simBySec.get(sec.id);

    const studs = (studentsBySection.get(sec.id) ?? []).map((e) => {
      type StP = { is_current: boolean; dominant_axis: string | null };
      type StA = {
        is_current: boolean;
        collaboration_pref: string | null;
        participation_level: string | null;
      };
      type St = {
        id: string;
        full_name: string;
        external_id: string | null;
        profile: StP[];
        aux: StA[];
      };
      const stud = (Array.isArray(e.student)
        ? e.student[0]
        : e.student) as St | null;
      return {
        id: stud?.id ?? e.student_id,
        full_name: stud?.full_name ?? "(unknown)",
        external_id: stud?.external_id ?? null,
        dominant:
          stud?.profile?.find((p) => p.is_current)?.dominant_axis ?? null,
        collab:
          stud?.aux?.find((a) => a.is_current)?.collaboration_pref ?? null,
        participation:
          stud?.aux?.find((a) => a.is_current)?.participation_level ?? null,
      };
    });

    type SimT = { full_name: string };
    const recommended = (Array.isArray(sim?.recommended)
      ? sim?.recommended[0]
      : sim?.recommended) as SimT | null;

    return {
      id: sec.id,
      label: sec.label,
      state: sec.state,
      courseCode: course?.code ?? "",
      courseName: course?.name ?? "",
      teacherId: teacher?.id ?? null,
      teacher: teacher
        ? {
            full_name: teacher.full_name,
            email: teacher.email,
            teaching_style: teacherProfile?.teaching_style ?? "—",
            interaction_level: teacherProfile?.interaction_level ?? "—",
            pacing: teacherProfile?.pacing ?? "—",
            approach: teacherProfile?.approach ?? null,
          }
        : null,
      students: studs,
      sim: sim
        ? {
            score: sim.compatibility_score,
            outcome: sim.predicted_outcome,
            social: sim.social_graph_impact,
            recommended_teacher: recommended?.full_name ?? null,
          }
        : null,
    };
  });

  // Option lists for the New Section / Change teacher forms.
  const teacherOptions = (teacherOpts ?? []).map((t) => ({
    id: t.id as string,
    full_name: t.full_name as string,
  }));
  const courseOptions = (courseOpts ?? []).map((c) => ({
    id: c.id as string,
    code: c.code as string,
    name: c.name as string,
  }));
  const termOptions = (termOpts ?? []).map((t) => ({
    id: t.id as string,
    name: t.name as string,
    is_active: t.is_active as boolean,
  }));
  const studentOptions = (studentOpts ?? []).map((s) => ({
    id: s.id as string,
    full_name: s.full_name as string,
    external_id: (s.external_id as string | null) ?? null,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          Section Builder
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Configure teacher and student assignments per section.
        </p>
      </div>

      <SectionsView
        sections={cards}
        teachers={teacherOptions}
        courses={courseOptions}
        terms={termOptions}
        students={studentOptions}
      />
    </div>
  );
}

import { ApiError, serverFetch } from "@/lib/api.server";
import { createClient } from "@/lib/supabase/server";
import type { ScenarioListItem } from "@/lib/types";
import ScenariosView, {
  type LiveSectionOpt,
  type ScenarioOptions,
} from "./ScenariosView";

/**
 * What-If Scenario Testing (F5).
 *
 * Option lists (courses, terms, teachers, students, live sections) are read
 * straight from Supabase under RLS; the scenario list and all writes go
 * through the FastAPI backend (/api/scenarios).
 */
export default async function ScenariosPage() {
  const supabase = await createClient();

  const [
    { data: courses },
    { data: terms },
    { data: teachers },
    { data: students },
    { data: sections },
    { data: enrollments },
  ] = await Promise.all([
    supabase.from("courses").select("id, code, name").order("code"),
    supabase
      .from("academic_terms")
      .select("id, name, is_active")
      .order("name"),
    supabase.from("teachers").select("id, full_name").order("full_name"),
    supabase
      .from("students")
      .select("id, full_name, external_id")
      .order("full_name"),
    supabase
      .from("sections")
      .select(
        "id, label, state, course_id, teacher_id, academic_term_id, course:courses(code, name), teacher:teachers(full_name)",
      )
      .order("label"),
    supabase
      .from("section_students")
      .select("section_id, student_id")
      .is("removed_at", null),
  ]);

  const rosterBySection = new Map<string, string[]>();
  for (const e of enrollments ?? []) {
    const list = rosterBySection.get(e.section_id) ?? [];
    list.push(e.student_id);
    rosterBySection.set(e.section_id, list);
  }

  const liveSections: LiveSectionOpt[] = (sections ?? []).map((sec) => {
    type Co = { code: string; name: string };
    type Tr = { full_name: string };
    const course = (Array.isArray(sec.course)
      ? sec.course[0]
      : sec.course) as Co | null;
    const teacher = (Array.isArray(sec.teacher)
      ? sec.teacher[0]
      : sec.teacher) as Tr | null;
    return {
      id: sec.id as string,
      label: sec.label as string,
      state: sec.state as string,
      courseId: sec.course_id as string,
      teacherId: (sec.teacher_id as string | null) ?? null,
      termId: sec.academic_term_id as string,
      courseCode: course?.code ?? "",
      courseName: course?.name ?? "",
      teacherName: teacher?.full_name ?? null,
      studentIds: rosterBySection.get(sec.id as string) ?? [],
    };
  });

  const options: ScenarioOptions = {
    courses: (courses ?? []).map((c) => ({
      id: c.id as string,
      code: c.code as string,
      name: c.name as string,
    })),
    terms: (terms ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      is_active: t.is_active as boolean,
    })),
    teachers: (teachers ?? []).map((t) => ({
      id: t.id as string,
      full_name: t.full_name as string,
    })),
    students: (students ?? []).map((s) => ({
      id: s.id as string,
      full_name: s.full_name as string,
      external_id: (s.external_id as string | null) ?? null,
    })),
    liveSections,
  };

  let scenarios: ScenarioListItem[] = [];
  let loadError: string | null = null;
  try {
    scenarios = await serverFetch<ScenarioListItem[]>("/api/scenarios");
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Could not load scenarios from the backend (${err.message}).`
        : "Could not reach the backend — is FastAPI running on :8000?";
  }

  return (
    <ScenariosView
      initialScenarios={scenarios}
      loadError={loadError}
      options={options}
    />
  );
}

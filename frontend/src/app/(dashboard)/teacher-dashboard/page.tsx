import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import SignOutButton from "@/components/SignOutButton";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { FSLSM_AXES, type FslsmAxis } from "@/lib/types";
import { BookOpen, Users } from "lucide-react";
import { redirect } from "next/navigation";

const AXES = Object.keys(FSLSM_AXES) as FslsmAxis[];

type StudentProfileRow = {
  is_current: boolean;
  dominant_axis: string | null;
  active_reflective_score: number;
  sensing_intuitive_score: number;
  visual_verbal_score: number;
  sequential_global_score: number;
};

export default async function TeacherDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("auth_users")
    .select("full_name, email, role, institution_id")
    .eq("id", user.id)
    .single();

  // Resolve the teacher row linked to this auth account.
  const { data: teacherRow } = await supabase
    .from("teachers")
    .select("id, full_name")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: sections } = teacherRow
    ? await supabase
        .from("sections")
        .select(
          `
            id, label, state,
            course:courses(code, name),
            section_students(
              student:students(
                id, full_name, external_id,
                profile:student_profiles!student_profiles_student_id_fkey(
                  is_current, dominant_axis,
                  active_reflective_score, sensing_intuitive_score,
                  visual_verbal_score, sequential_global_score
                )
              )
            )
          `,
        )
        .eq("teacher_id", teacherRow.id)
        .order("label")
    : { data: null };

  const classes = (sections ?? []).map((sec) => {
    type Co = { code: string; name: string };
    type St = {
      id: string;
      full_name: string;
      external_id: string | null;
      profile: StudentProfileRow[];
    };
    const course = (Array.isArray(sec.course)
      ? sec.course[0]
      : sec.course) as Co | null;

    const roster = ((sec.section_students ?? []) as { student: St | St[] }[]).map(
      (ss) => {
        const stud = (Array.isArray(ss.student)
          ? ss.student[0]
          : ss.student) as St | null;
        const prof =
          stud?.profile?.find((p) => p.is_current) ?? null;
        return {
          id: stud?.id ?? "",
          full_name: stud?.full_name ?? "(unknown)",
          external_id: stud?.external_id ?? null,
          prof,
        };
      },
    );

    const withProf = roster.filter((r) => r.prof) as {
      id: string;
      full_name: string;
      external_id: string | null;
      prof: StudentProfileRow;
    }[];

    // Per-axis pole share (matches the backend pipeline convention:
    // score > 0 → pole A, score < 0 → pole B).
    const distribution = AXES.map((axis) => {
      const field = `${axis}_score` as keyof StudentProfileRow;
      const a = withProf.filter((r) => (r.prof[field] as number) > 0).length;
      const b = withProf.filter((r) => (r.prof[field] as number) < 0).length;
      const total = a + b || 1;
      return {
        axis,
        aPct: Math.round((a / total) * 100),
        bPct: Math.round((b / total) * 100),
        scored: a + b,
      };
    });

    return {
      id: sec.id as string,
      label: sec.label as string,
      state: sec.state as string,
      courseCode: course?.code ?? "",
      courseName: course?.name ?? "",
      roster,
      withProfCount: withProf.length,
      distribution,
    };
  });

  return (
    <main
      className="min-h-screen px-8 py-10"
      style={{ backgroundColor: "var(--brand-mint)" }}
    >
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl grid place-items-center"
              style={{ backgroundColor: "var(--brand-teal)" }}
            >
              <span className="text-white text-lg font-extrabold">C</span>
            </div>
            <span
              className="text-xl font-bold tracking-tight"
              style={{ color: "var(--brand-purple)" }}
            >
              ClassIQ
            </span>
          </div>
          <SignOutButton />
        </header>

        <div className="mb-8">
          <span
            className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-3"
            style={{ backgroundColor: "var(--brand-teal)", color: "white" }}
          >
            Teacher Dashboard
          </span>
          <h1 className="text-3xl font-bold" style={{ color: BRAND.textHeading }}>
            Welcome, {teacherRow?.full_name ?? profile?.full_name ?? user.email}
          </h1>
          <p className="text-slate-500 mt-1 text-sm">
            A read-only view of your classes and their learning-style makeup.
          </p>
        </div>

        {!teacherRow ? (
          <EmptyState
            icon={BookOpen}
            title="No teacher profile linked"
            description="Your login isn't linked to a teacher record yet. Ask your HoD or admin to link your account."
          />
        ) : classes.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="No classes assigned yet"
            description="Once your HoD assigns you to a section, your class roster and learning-style breakdown appear here."
          />
        ) : (
          <div className="space-y-5">
            {classes.map((cls) => (
              <div
                key={cls.id}
                className="bg-white rounded-3xl p-6 md:p-8 shadow-sm"
                style={{ border: `1px solid ${BRAND.cardBorder}` }}
              >
                <div className="flex items-start justify-between flex-wrap gap-3 mb-5">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2
                        className="text-xl font-bold"
                        style={{ color: BRAND.textHeading }}
                      >
                        {cls.courseCode} &mdash; Section {cls.label}
                      </h2>
                      <Badge text={cls.state} />
                    </div>
                    <p className="text-sm mt-0.5" style={{ color: BRAND.textMuted }}>
                      {cls.courseName}
                    </p>
                  </div>
                  <div
                    className="flex items-center gap-1.5 text-sm"
                    style={{ color: BRAND.textMuted }}
                  >
                    <Users size={15} />
                    {cls.roster.length} students &middot; {cls.withProfCount}{" "}
                    profiled
                  </div>
                </div>

                {/* Class FSLSM distribution */}
                <h3
                  className="text-sm font-semibold mb-3"
                  style={{ color: BRAND.textMuted }}
                >
                  Class learning-style distribution
                </h3>
                {cls.withProfCount === 0 ? (
                  <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
                    No FSLSM profiles for this class yet — distribution appears
                    once survey data is ingested.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {cls.distribution.map((d) => {
                      const meta = FSLSM_AXES[d.axis];
                      return (
                        <div
                          key={d.axis}
                          className="rounded-xl p-4"
                          style={{ backgroundColor: BRAND.subtleBg }}
                        >
                          <div
                            className="text-xs font-medium mb-2"
                            style={{ color: BRAND.textMuted }}
                          >
                            {meta.label}
                          </div>
                          <div
                            className="flex h-3 rounded-full overflow-hidden"
                            style={{ backgroundColor: "white" }}
                          >
                            <div
                              style={{
                                width: `${d.aPct}%`,
                                backgroundColor: meta.color,
                              }}
                            />
                            <div
                              style={{
                                width: `${d.bPct}%`,
                                backgroundColor: `${meta.color}66`,
                              }}
                            />
                          </div>
                          <div
                            className="flex justify-between text-[11px] mt-1.5"
                            style={{ color: BRAND.textMuted }}
                          >
                            <span>
                              {meta.poleA} {d.aPct}%
                            </span>
                            <span>
                              {meta.poleB} {d.bPct}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Roster */}
                <h3
                  className="text-sm font-semibold mb-3 mt-6"
                  style={{ color: BRAND.textMuted }}
                >
                  Roster
                </h3>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${BRAND.cardBorder}` }}
                >
                  <table className="w-full text-sm">
                    <thead style={{ backgroundColor: BRAND.subtleBg }}>
                      <tr>
                        <th
                          className="text-left px-4 py-2 font-medium"
                          style={{ color: BRAND.textMuted }}
                        >
                          Name
                        </th>
                        <th
                          className="text-left px-4 py-2 font-medium hidden sm:table-cell"
                          style={{ color: BRAND.textMuted }}
                        >
                          ID
                        </th>
                        <th
                          className="text-left px-4 py-2 font-medium"
                          style={{ color: BRAND.textMuted }}
                        >
                          Dominant Style
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {cls.roster.map((s) => (
                        <tr
                          key={s.id || s.full_name}
                          style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                        >
                          <td
                            className="px-4 py-2.5 font-medium"
                            style={{ color: BRAND.text }}
                          >
                            {s.full_name}
                          </td>
                          <td
                            className="px-4 py-2.5 hidden sm:table-cell font-mono text-xs"
                            style={{ color: BRAND.textMuted }}
                          >
                            {s.external_id ?? "—"}
                          </td>
                          <td className="px-4 py-2.5">
                            {s.prof?.dominant_axis ? (
                              <Badge
                                text={
                                  FSLSM_AXES[s.prof.dominant_axis as FslsmAxis]
                                    ?.label ?? s.prof.dominant_axis
                                }
                              />
                            ) : (
                              <span style={{ color: BRAND.textMuted }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

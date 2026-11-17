import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import LearningStyleCard from "@/components/LearningStyleCard";
import ScoreRing from "@/components/ScoreRing";
import StatCard from "@/components/StatCard";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { type FslsmAxis } from "@/lib/types";
import {
  BookOpen,
  FlaskConical,
  GraduationCap,
  TrendingUp,
  Users,
} from "lucide-react";

export default async function HodDashboardPage() {
  const supabase = await createClient();

  // The simulation results are fetched after this, scoped to the sections it
  // returns, so the sections query leads. Everything else still goes out with it.
  const [
    { count: studentCount },
    { count: teacherCount },
    { data: sections },
    { data: profiles },
    { data: terms },
    { data: institutions },
  ] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }),
    supabase.from("teachers").select("*", { count: "exact", head: true }),
    supabase
      .from("sections")
      .select(
        "id, label, state, course:courses(code, name), teacher:teachers(full_name), section_students(count)",
      )
      .order("label"),
    // Same three conditions the backend's fslsm_distribution applies: the
    // current profile, not soft-deleted, for a student who is not soft-deleted
    // either. `!inner` makes the embed a join so the filter on it restricts
    // which profiles come back, rather than just nulling the nested object.
    // Without these, this tally counted removed students while the admin
    // analytics page did not, and the two screens disagreed.
    supabase
      .from("student_profiles")
      .select(
        "active_reflective_score, sensing_intuitive_score, visual_verbal_score, sequential_global_score, dominant_axis, students!inner(deleted_at)",
      )
      .eq("is_current", true)
      .is("deleted_at", null)
      .is("students.deleted_at", null),
    supabase
      .from("academic_terms")
      .select("name")
      .eq("is_active", true)
      .limit(1),
    supabase.from("institutions").select("name").limit(1),
  ]);

  const termName = terms?.[0]?.name ?? null;
  const institutionName = institutions?.[0]?.name ?? null;
  const subtitle =
    [termName, institutionName].filter(Boolean).join(" — ") ||
    "Your department overview";

  const sectionsArr = sections ?? [];
  const profilesArr = profiles ?? [];
  const sectionIds = sectionsArr.map((sec) => sec.id as string);

  // Results for the sections on this page, newest first. Unfiltered, this
  // selected every simulation_results row the caller can see — all history,
  // and scenario rows too, since what-if runs share the table and carry a
  // null section_id. `in` on the page's section ids excludes both.
  const { data: simResults } = sectionIds.length
    ? await supabase
        .from("simulation_results")
        .select(
          "section_id, compatibility_score, predicted_outcome, social_graph_impact, created_at",
        )
        .in("section_id", sectionIds)
        .order("created_at", { ascending: false })
    : { data: [] };

  // Newest first, so the first row seen for a section is its latest result.
  // Mapping the whole list kept whichever row happened to come last instead.
  type SimRow = NonNullable<typeof simResults>[number];
  const simBySec = new Map<string, SimRow>();
  for (const r of simResults ?? []) {
    if (r.section_id && !simBySec.has(r.section_id)) {
      simBySec.set(r.section_id, r);
    }
  }

  // Averaged over each section's current score, not over every run ever made.
  const latestScores = [...simBySec.values()].map((r) => r.compatibility_score);
  const avgScore = latestScores.length
    ? Math.round(
        latestScores.reduce((sum, score) => sum + score, 0) /
          latestScores.length,
      )
    : 0;

  // Tally dominant axis per FSLSM axis
  const axisCounts: Record<FslsmAxis, number> = {
    active_reflective: 0,
    sensing_intuitive: 0,
    visual_verbal: 0,
    sequential_global: 0,
  };
  for (const p of profilesArr) {
    if (p.dominant_axis && p.dominant_axis in axisCounts) {
      axisCounts[p.dominant_axis as FslsmAxis] += 1;
    }
  }
  const totalProfiles = Math.max(profilesArr.length, 1);

  const learningStyles: Array<{
    axis: FslsmAxis;
    title: string;
    description: string;
    primary: string;
    secondary: string;
  }> = [
    {
      axis: "active_reflective",
      title: "Active / Reflective",
      description: "Learn through doing and discussion vs. thinking quietly first.",
      primary: BRAND.teal,
      secondary: BRAND.tealLight,
    },
    {
      axis: "sensing_intuitive",
      title: "Sensing / Intuitive",
      description: "Prefer concrete facts and procedures vs. concepts and theories.",
      primary: BRAND.amber,
      secondary: "#FEF3C7",
    },
    {
      axis: "visual_verbal",
      title: "Visual / Verbal",
      description: "Learn best through images and diagrams vs. words and lectures.",
      primary: BRAND.indigo,
      secondary: "#E0E7FF",
    },
    {
      axis: "sequential_global",
      title: "Sequential / Global",
      description: "Build understanding in linear steps vs. big-picture leaps.",
      primary: BRAND.coral,
      secondary: "#FFE4E0",
    },
  ];

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page heading */}
      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          HoD Dashboard
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          {subtitle}
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Students"
          value={studentCount ?? 0}
          icon={Users}
          accent={BRAND.coral}
        />
        <StatCard
          label="Teachers"
          value={teacherCount ?? 0}
          icon={GraduationCap}
          accent={BRAND.teal}
        />
        <StatCard
          label="Sections"
          value={sectionsArr.length}
          icon={BookOpen}
          accent={BRAND.purple}
        />
        <StatCard
          label="Average Score"
          value={avgScore}
          icon={TrendingUp}
          accent={BRAND.amber}
        />
      </div>

      {/* Section cards */}
      {sectionsArr.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No sections yet"
          description="Create sections in the Section Builder to assign teachers and students."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {sectionsArr.map((sec) => {
            type SecCourse = { code: string; name: string };
            type SecTeacher = { full_name: string };
            const course = (Array.isArray(sec.course)
              ? sec.course[0]
              : sec.course) as SecCourse | null;
            const teacher = (Array.isArray(sec.teacher)
              ? sec.teacher[0]
              : sec.teacher) as SecTeacher | null;
            const sim = simBySec.get(sec.id);
            const studentCount =
              (
                sec.section_students as
                  | { count: number }[]
                  | null
                  | undefined
              )?.[0]?.count ?? 0;

            return (
              <div
                key={sec.id}
                className="rounded-2xl bg-white p-4 flex gap-4 items-center"
                style={{ border: `1px solid ${BRAND.cardBorder}` }}
              >
                <ScoreRing
                  score={sim?.compatibility_score ?? 0}
                  size={72}
                />
                <div className="flex-1 min-w-0">
                  <div
                    className="font-bold truncate"
                    style={{ color: BRAND.textHeading }}
                  >
                    {course?.code} &mdash; {course?.name}
                  </div>
                  <div
                    className="text-xs mt-1 truncate"
                    style={{ color: BRAND.textMuted }}
                  >
                    Teacher: {teacher?.full_name ?? "Unassigned"}
                  </div>
                  <div
                    className="text-xs flex items-center gap-1.5 mt-1"
                    style={{ color: BRAND.textMuted }}
                  >
                    <span>Students: {studentCount}</span>
                    <Badge text={sec.state} />
                  </div>
                  <div className="flex gap-1.5 mt-2 flex-wrap">
                    {sim?.predicted_outcome && (
                      <Badge text={`Outcome: ${sim.predicted_outcome}`} />
                    )}
                    {sim?.social_graph_impact && (
                      <Badge text={sim.social_graph_impact} />
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Learning Style Overview */}
      <div
        className="rounded-3xl p-6 md:p-8"
        style={{ backgroundColor: BRAND.mintSoft, border: `1px solid ${BRAND.cardBorder}` }}
      >
        <h2
          className="text-2xl font-extrabold tracking-tight mb-5"
          style={{ color: BRAND.textHeading }}
        >
          Learning Style Overview
        </h2>

        {profilesArr.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No student profiles yet"
            description="Once survey data is ingested, FSLSM scores populate here."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {learningStyles.map((ls) => {
              const count = axisCounts[ls.axis];
              const pct = Math.round((count / totalProfiles) * 100);
              return (
                <LearningStyleCard
                  key={ls.axis}
                  title={ls.title}
                  description={ls.description}
                  studentCount={count}
                  percent={pct}
                  primary={ls.primary}
                  secondary={ls.secondary}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

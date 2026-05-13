// ─── FSLSM (Felder-Silverman) ──────────────────────────────────────────────
// 4 axes; each profile carries an odd integer score in [-11, +11] per axis.
// Sign = pole; magnitude = strength.

export type FslsmAxis =
  | "active_reflective"
  | "sensing_intuitive"
  | "visual_verbal"
  | "sequential_global";

export const FSLSM_AXES: Record<
  FslsmAxis,
  { label: string; poleA: string; poleB: string; color: string }
> = {
  active_reflective: {
    label: "Active / Reflective",
    poleA: "Active",
    poleB: "Reflective",
    color: "#0D9488",
  },
  sensing_intuitive: {
    label: "Sensing / Intuitive",
    poleA: "Sensing",
    poleB: "Intuitive",
    color: "#F59E0B",
  },
  visual_verbal: {
    label: "Visual / Verbal",
    poleA: "Visual",
    poleB: "Verbal",
    color: "#6366F1",
  },
  sequential_global: {
    label: "Sequential / Global",
    poleA: "Sequential",
    poleB: "Global",
    color: "#F97066",
  },
};

export function strengthLabel(score: number): "mild" | "moderate" | "strong" {
  const m = Math.abs(score);
  if (m >= 9) return "strong";
  if (m >= 5) return "moderate";
  return "mild";
}

// ─── DB row shapes (subset of DATA_MODEL.md) ───────────────────────────────

export type UserRole = "super_admin" | "hod" | "teacher" | "student";

export interface AuthUser {
  id: string;
  institution_id: string;
  role: UserRole;
  full_name: string;
  email: string;
}

export interface Student {
  id: string;
  institution_id: string;
  department_id: string | null;
  external_id: string | null;
  full_name: string;
  email: string | null;
}

export interface StudentProfile {
  id: string;
  student_id: string;
  version: number;
  is_current: boolean;
  scored_at: string;
  active_reflective_score: number;
  sensing_intuitive_score: number;
  visual_verbal_score: number;
  sequential_global_score: number;
  dominant_axis: FslsmAxis | null;
}

export interface StudentWithProfile extends Student {
  profile: StudentProfile | null;
}

export interface Teacher {
  id: string;
  institution_id: string;
  department_id: string | null;
  full_name: string;
  email: string;
}

export type InteractionLevel = "low" | "medium" | "high";
export type PacingPref = "slow" | "moderate" | "fast";

export interface TeacherProfile {
  id: string;
  teacher_id: string;
  version: number;
  is_current: boolean;
  teaching_style: string;
  interaction_level: InteractionLevel;
  pacing: PacingPref;
  approach: string | null;
}

export interface TeacherWithProfile extends Teacher {
  profile: TeacherProfile | null;
}

export type SectionState = "draft" | "simulated" | "active" | "archived";

export interface Section {
  id: string;
  institution_id: string;
  course_id: string;
  academic_term_id: string;
  teacher_id: string | null;
  label: string;
  state: SectionState;
  created_at: string;
}

export interface Course {
  id: string;
  department_id: string;
  code: string;
  name: string;
}

export interface AcademicTerm {
  id: string;
  name: string;
  is_active: boolean;
}

export type PredictedOutcome = "high" | "medium" | "low";
export type SocialImpact = "supportive" | "neutral" | "hindering";
export type FactorImpact = "positive" | "neutral" | "negative";

export interface SimulationResult {
  id: string;
  simulation_run_id: string;
  section_id: string | null;
  scenario_section_id: string | null;
  compatibility_score: number;
  predicted_outcome: PredictedOutcome;
  social_graph_impact: SocialImpact;
  style_distribution: Record<string, Record<string, number>>;
  recommended_teacher_id: string | null;
}

export interface SimulationResultFactor {
  id: string;
  simulation_result_id: string;
  factor_name: string;
  score: number;
  weight: number;
  impact: FactorImpact;
}

export type RelationshipType =
  | "friend"
  | "study_partner"
  | "neutral"
  | "conflict";

export interface PeerRelationship {
  id: string;
  academic_term_id: string;
  from_student_id: string;
  to_student_id: string;
  type: RelationshipType;
  strength: number;
}

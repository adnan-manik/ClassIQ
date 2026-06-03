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

export type UserRole =
  | "super_admin"
  | "institution_admin"
  | "hod"
  | "teacher"
  | "student";

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

// ─── Admin / Institution-admin API shapes ──────────────────────────────────

export interface AdminInstitution {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  department_count: number;
  user_count: number;
  student_count: number;
}

export interface AdminInstitutionDetail extends AdminInstitution {
  departments: { id: string; name: string; code: string }[];
}

export interface RoleCount {
  role: UserRole;
  count: number;
}

export interface SystemOverview {
  institutions: number;
  users_by_role: RoleCount[];
  students: number;
  teachers: number;
  sections: number;
  simulations_last_30d: number;
}

export interface AuditEntry {
  id: string;
  institution_id: string;
  institution_name: string | null;
  actor_user_id: string | null;
  actor_email: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface IngestionJobItem {
  id: string;
  institution_id: string;
  institution_name: string | null;
  source: string;
  status: "pending" | "running" | "succeeded" | "failed" | "partial";
  started_at: string | null;
  finished_at: string | null;
  summary: Record<string, unknown> | null;
  created_at: string;
}

export interface HodRef {
  auth_user_id: string;
  full_name: string;
  email: string;
}

export interface DepartmentItem {
  id: string;
  name: string;
  code: string;
  created_at: string;
  member_count: number;
  teacher_count: number;
  student_count: number;
  course_count: number;
  hods: HodRef[];
}

export interface InstitutionUserListItem {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  department_codes: string[];
}

export interface UserImportPreviewRow {
  line: number;
  email: string;
  full_name: string;
  role: string;
  department_code: string | null;
  password: string | null;
}

export interface UserImportPreviewError {
  line: number;
  field: string;
  message: string;
}

export interface UserImportPreviewResp {
  total: number;
  valid: UserImportPreviewRow[];
  errors: UserImportPreviewError[];
}

export interface UserImportResult {
  ingestion_job_id: string;
  total: number;
  created: number;
  failed: number;
  status: "succeeded" | "failed" | "partial" | "pending" | "running";
  errors: UserImportPreviewError[];
}

export interface FslsmAxisCount {
  axis: FslsmAxis;
  pole_a_count: number;
  pole_b_count: number;
  pole_a_label: string;
  pole_b_label: string;
}

export interface FslsmDistributionResp {
  total_profiles: number;
  axes: FslsmAxisCount[];
}

export interface DepartmentRollup {
  department_id: string;
  department_name: string;
  department_code: string;
  student_count: number;
  teacher_count: number;
  section_count: number;
  avg_compatibility_score: number | null;
  simulations_run: number;
}

export interface InstitutionAnalyticsOverview {
  student_count: number;
  teacher_count: number;
  section_count: number;
  simulation_count: number;
  avg_compatibility_score: number | null;
  fslsm: FslsmDistributionResp;
  departments: DepartmentRollup[];
}

export interface ScoreTrendPoint {
  bucket_start: string;
  avg_score: number;
  runs: number;
}

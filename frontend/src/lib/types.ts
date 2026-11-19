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
  program: string | null;
  batch: string | null;
  current_semester: number | null;
}

/** Minimal department shape for pickers and labels. */
export interface DepartmentOption {
  id: string;
  code: string;
  name: string;
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

// ─── What-if scenarios (F5) — mirrors backend/app/schemas/scenarios.py ─────

export type ScenarioStatus = "draft" | "simulated" | "applied" | "archived";

export interface CourseRef {
  id: string;
  code: string;
  name: string;
}

export interface TeacherRef {
  id: string;
  full_name: string;
  email: string;
  profile: {
    version: number;
    is_current: boolean;
    teaching_style: string;
    interaction_level: InteractionLevel;
    pacing: PacingPref;
    approach: string | null;
    collected_at: string;
  } | null;
}

export interface SimulationFactorShape {
  factor_name: string;
  score: number;
  weight: number;
  impact: FactorImpact;
}

export interface SimulationResultShape {
  id: string;
  compatibility_score: number;
  predicted_outcome: PredictedOutcome;
  social_graph_impact: SocialImpact;
  style_distribution: Record<string, Record<string, number>>;
  recommended_teacher_id: string | null;
  recommended_teacher_name: string | null;
  factors: SimulationFactorShape[];
}

export interface StudentListItem {
  id: string;
  full_name: string;
  external_id: string | null;
  email: string | null;
  dominant_axis: FslsmAxis | null;
  collaboration_pref: string | null;
  participation_level: string | null;
}

export interface ScenarioSectionShape {
  id: string;
  course: CourseRef;
  teacher: TeacherRef | null;
  label: string;
  student_count: number;
  students: StudentListItem[];
  latest_result: SimulationResultShape | null;
}

export interface ScenarioListItem {
  id: string;
  name: string;
  notes: string | null;
  status: ScenarioStatus;
  academic_term_id: string;
  academic_term_name: string | null;
  department_id: string;
  created_at: string;
  updated_at: string | null;
  section_count: number;
  avg_score: number | null;
  last_simulated_at: string | null;
}

export interface ScenarioDetail extends ScenarioListItem {
  sections: ScenarioSectionShape[];
}

export interface ScenarioSectionInput {
  course_id: string;
  teacher_id: string;
  label: string;
  student_ids: string[];
}

export interface ScenarioCreateInput {
  name: string;
  notes?: string | null;
  academic_term_id: string;
  department_id?: string | null;
  sections: ScenarioSectionInput[];
}

export interface ScenarioUpdateInput {
  name?: string;
  notes?: string | null;
  sections?: ScenarioSectionInput[];
}

export interface ScenarioSimulateResponse {
  run_id: string;
  scenario_id: string;
  status: ScenarioStatus;
  avg_score: number | null;
  sections: ScenarioSectionShape[];
  skipped: string[];
}

export interface FactorDelta {
  factor_name: string;
  baseline_score: number | null;
  scenario_score: number;
  delta: number | null;
  weight: number;
}

export interface RosterDiff {
  added: number;
  removed: number;
  kept: number;
}

export interface ScenarioCompareRow {
  scenario_section_id: string;
  course: CourseRef;
  label: string;
  scenario_teacher: TeacherRef | null;
  scenario_student_count: number;
  scenario_result: SimulationResultShape | null;
  baseline_section_id: string | null;
  baseline_state: SectionState | null;
  baseline_teacher: TeacherRef | null;
  baseline_student_count: number | null;
  baseline_result: SimulationResultShape | null;
  score_delta: number | null;
  factor_deltas: FactorDelta[];
  roster: RosterDiff;
}

export interface ScenarioCompareResponse {
  scenario: ScenarioListItem;
  rows: ScenarioCompareRow[];
  baseline_avg: number | null;
  scenario_avg: number | null;
  avg_delta: number | null;
}

export interface AppliedSection {
  section_id: string;
  course: CourseRef;
  label: string;
  created: boolean;
  compatibility_score: number | null;
}

export interface ScenarioApplyResponse {
  scenario_id: string;
  status: ScenarioStatus;
  applied: AppliedSection[];
}

// ─── Survey ingestion — mirrors backend/app/schemas/ingestion.py ───────────

export type IngestionSource =
  | "rdf_bulk_import"
  | "form_app"
  | "classiq_internal"
  | "manual_admin";

export type IngestionStatus =
  | "pending"
  | "running"
  | "succeeded"
  | "failed"
  | "partial";

export interface IngestionIssue {
  ref: string;
  field: string;
  message: string;
}

export interface IngestionSummary {
  students_seen: number;
  students_created: number;
  students_matched: number;
  responses_ingested: number;
  responses_duplicate: number;
  responses_rejected: number;
  profiles_created: number;
  aux_profiles_created: number;
  errors: IngestionIssue[];
  errors_truncated: number;
}

export interface IngestionReport {
  job_id: string | null;
  status: IngestionStatus;
  dry_run: boolean;
  source: IngestionSource | string;
  summary: IngestionSummary;
}

export interface IngestionJob {
  id: string;
  source: IngestionSource | string;
  status: IngestionStatus;
  started_at: string | null;
  finished_at: string | null;
  file_path: string | null;
  summary: (Partial<IngestionSummary> & Record<string, unknown>) | null;
  triggered_by: string | null;
  triggered_by_name: string | null;
  created_at: string;
}

export interface InstrumentQuestion {
  sequence_no: number;
  prompt: string;
  answer_a: string;
  answer_b: string;
  axis: FslsmAxis;
  answer_a_pole: string;
  answer_b_pole: string;
}

export interface Instrument {
  id: string | null;
  name: string;
  version: string;
  total_questions: number;
  questions: InstrumentQuestion[];
}

export interface ManualSubmissionInput {
  student_id?: string | null;
  external_id?: string | null;
  email?: string | null;
  full_name?: string | null;
  answers: Record<number, "A" | "B">;
  collaboration_pref?: "solo" | "pair" | "group" | null;
  participation_level?: "low" | "medium" | "high" | null;
  notes?: string | null;
  academic_term_id?: string | null;
  department_id?: string | null;
}

export interface SimulationsByDepartment {
  department_id: string;
  department_name: string;
  department_code: string;
  runs_last_30d: number;
  avg_score: number | null;
}

export interface CourseListItem {
  id: string;
  code: string;
  name: string;
  department_id: string;
  department_code: string | null;
  department_name: string | null;
  section_count: number;
  created_at: string;
}

// ─── S3 Longitudinal — mirrors backend/app/schemas/longitudinal.py ────────

export interface AxisScores {
  active_reflective: number;
  sensing_intuitive: number;
  visual_verbal: number;
  sequential_global: number;
}

export interface ProfileVersion {
  id: string;
  version: number;
  is_current: boolean;
  scored_at: string;
  scoring_engine_version: string;
  active_reflective_score: number;
  sensing_intuitive_score: number;
  visual_verbal_score: number;
  sequential_global_score: number;
  dominant_axis: FslsmAxis | null;
  academic_term_id: string | null;
  academic_term_name: string | null;
  source: string | null;
  submitted_at: string | null;
}

export interface StudentProfileHistory {
  student_id: string;
  full_name: string;
  external_id: string | null;
  versions: ProfileVersion[];
  shift: AxisScores | null;
}

export interface TermBucket {
  academic_term_id: string | null;
  academic_term_name: string;
  starts_on: string | null;
  profiles: number;
  students: number;
  mean: AxisScores;
  pole_a_share: AxisScores;
}

export interface VersionBucket {
  version: number;
  profiles: number;
  mean: AxisScores;
}

export interface StudentShift {
  student_id: string;
  full_name: string;
  external_id: string | null;
  versions: number;
  first_scored_at: string;
  latest_scored_at: string;
  first: AxisScores;
  latest: AxisScores;
  delta: AxisScores;
  magnitude: number;
  dominant_from: FslsmAxis | null;
  dominant_to: FslsmAxis | null;
}

export interface LongitudinalOverview {
  department_id: string | null;
  students_total: number;
  students_with_history: number;
  versions_total: number;
  by_term: TermBucket[];
  by_version: VersionBucket[];
  axis_drift: AxisScores | null;
  dominant_changed: number;
  top_shifts: StudentShift[];
}

// ─── S1 Early warning — mirrors backend/app/schemas/early_warning.py ──────

export type WarningType = "engagement" | "performance" | "compatibility";
export type WarningSeverity = "low" | "medium" | "high";
export type WarningStatus = "open" | "acknowledged" | "resolved";

export interface OutcomeEntry {
  student_id: string | null;
  attendance_pct?: number | null;
  grade_pct?: number | null;
  engagement_level?: "low" | "medium" | "high" | null;
  notes?: string | null;
}

export interface OutcomeShape {
  id: string;
  section_id: string;
  student_id: string | null;
  student_name: string | null;
  week_no: number;
  attendance_pct: number | null;
  grade_pct: number | null;
  engagement_level: "low" | "medium" | "high" | null;
  notes: string | null;
  recorded_by_name: string | null;
  recorded_at: string;
}

export interface FlagShape {
  id: string;
  section_id: string;
  course: CourseRef | null;
  section_label: string | null;
  student_id: string | null;
  student_name: string | null;
  type: WarningType;
  severity: WarningSeverity;
  status: WarningStatus;
  message: string;
  predicted_outcome: PredictedOutcome | null;
  metric_name: string | null;
  expected_value: number | null;
  actual_value: number | null;
  deviation: number | null;
  week_no: number | null;
  evaluated_at: string;
  acknowledged_at: string | null;
  resolved_at: string | null;
  created_at: string;
}

export interface EvaluateResponse {
  section_id: string;
  predicted_outcome: PredictedOutcome | null;
  compatibility_score: number | null;
  weeks_recorded: number;
  flags: FlagShape[];
  opened: number;
  updated: number;
  auto_resolved: number;
}

export interface RecordOutcomesResponse {
  saved: number;
  evaluation: EvaluateResponse | null;
}

export interface SectionWarningSummary {
  section_id: string;
  course: CourseRef;
  label: string;
  state: string;
  teacher_name: string | null;
  predicted_outcome: PredictedOutcome | null;
  compatibility_score: number | null;
  weeks_recorded: number;
  latest_week: number | null;
  open_flags: number;
  high_flags: number;
}

export interface EarlyWarningOverview {
  open_total: number;
  by_severity: Record<string, number>;
  by_type: Record<string, number>;
  sections: SectionWarningSummary[];
}

// ─── S2 Ask ClassIQ — mirrors backend/app/schemas/llm.py ──────────────────

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface LLMQueryResponse {
  answer: string;
  model: string;
  refusal: boolean;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
  context: {
    sections: number;
    teachers: number;
    scenarios: number;
    open_flags: number;
    profiles: number;
  };
  request_id: string | null;
}

export interface LLMStatus {
  enabled: boolean;
  /** Active backend provider — "anthropic" | "groq". */
  provider: string;
  model: string;
  max_output_tokens: number;
  reason: string | null;
}

/** GET /api/sections/{id} — mirrors backend SectionDetail. */
export interface SectionDetailShape {
  id: string;
  label: string;
  state: SectionState;
  course: CourseRef;
  teacher: TeacherRef | null;
  student_count: number;
  latest_result: SimulationResultShape | null;
  students: StudentListItem[];
}

/**
 * Typed client for the ClassIQ FastAPI backend.
 *
 * Auth: pulls the current Supabase access token via createClient() and sends
 * it as `Authorization: Bearer <jwt>` so the backend can verify the user.
 */

import { createClient } from "@/lib/supabase/client";
import type {
  ChatTurn,
  EarlyWarningOverview,
  EvaluateResponse,
  FormMeta,
  FormSettings,
  FormStatus,
  FormSubmissionShape,
  SurveyFormShape,
  FlagShape,
  InstitutionAnalyticsOverview,
  IngestionJob,
  LLMQueryResponse,
  LLMStatus,
  LongitudinalOverview,
  OutcomeEntry,
  OutcomeShape,
  RecordOutcomesResponse,
  SectionDetailShape,
  StudentProfileHistory,
  WarningStatus,
  IngestionReport,
  Instrument,
  ManualSubmissionInput,
  ScenarioApplyResponse,
  ScenarioCompareResponse,
  ScenarioCreateInput,
  ScenarioDetail,
  ScenarioListItem,
  ScenarioSimulateResponse,
  ScenarioUpdateInput,
} from "@/lib/types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Not authenticated — sign in first.");
  }
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (
    !headers.has("Content-Type") &&
    init.body &&
    !(typeof FormData !== "undefined" && init.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export interface SimulateFactor {
  factor_name: string;
  score: number;
  weight: number;
  impact: "positive" | "neutral" | "negative";
}

export interface SimulateResponse {
  run_id: string;
  result_id: string;
  compatibility_score: number;
  predicted_outcome: "high" | "medium" | "low";
  social_graph_impact: "supportive" | "neutral" | "hindering";
  style_distribution: Record<string, Record<string, number>>;
  recommended_teacher_id: string | null;
  factors: SimulateFactor[];
}

export async function simulateSection(
  sectionId: string,
): Promise<SimulateResponse> {
  const res = await authedFetch(`/api/sections/${sectionId}/simulate`, {
    method: "POST",
  });
  if (!res.ok) {
    const detail = await safeError(res);
    throw new Error(`Simulate failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<SimulateResponse>;
}

export interface CreateSectionInput {
  course_id: string;
  academic_term_id: string;
  label: string;
  teacher_id?: string | null;
  student_ids?: string[];
}

/** Create a new draft section. Returns the created section's id. */
export async function createSection(
  input: CreateSectionInput,
): Promise<{ id: string }> {
  const res = await authedFetch(`/api/sections`, {
    method: "POST",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Create section failed (${res.status}): ${await safeError(res)}`);
  }
  return res.json() as Promise<{ id: string }>;
}

/** Patch a section's label and/or assigned teacher (null teacher = unassign). */
export async function updateSection(
  sectionId: string,
  input: { label?: string; teacher_id?: string | null },
): Promise<{ id: string }> {
  const res = await authedFetch(`/api/sections/${sectionId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Update section failed (${res.status}): ${await safeError(res)}`);
  }
  return res.json() as Promise<{ id: string }>;
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

// ─── Generic JSON helper ────────────────────────────────────────────────────

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  label = "Request",
): Promise<T> {
  const res = await authedFetch(path, init);
  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${await safeError(res)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// ─── What-if scenarios (F5) ─────────────────────────────────────────────────

export function listScenarios(): Promise<ScenarioListItem[]> {
  return requestJson("/api/scenarios", {}, "List scenarios");
}

export function getScenario(id: string): Promise<ScenarioDetail> {
  return requestJson(`/api/scenarios/${id}`, {}, "Load scenario");
}

export function createScenario(input: ScenarioCreateInput): Promise<ScenarioDetail> {
  return requestJson(
    "/api/scenarios",
    { method: "POST", body: JSON.stringify(input) },
    "Create scenario",
  );
}

export function updateScenario(
  id: string,
  input: ScenarioUpdateInput,
): Promise<ScenarioDetail> {
  return requestJson(
    `/api/scenarios/${id}`,
    { method: "PATCH", body: JSON.stringify(input) },
    "Update scenario",
  );
}

export function deleteScenario(id: string): Promise<void> {
  return requestJson(`/api/scenarios/${id}`, { method: "DELETE" }, "Delete scenario");
}

export function simulateScenario(id: string): Promise<ScenarioSimulateResponse> {
  return requestJson(
    `/api/scenarios/${id}/simulate`,
    { method: "POST" },
    "Simulate scenario",
  );
}

export function compareScenario(id: string): Promise<ScenarioCompareResponse> {
  return requestJson(`/api/scenarios/${id}/compare`, {}, "Compare scenario");
}

export function applyScenario(id: string): Promise<ScenarioApplyResponse> {
  return requestJson(`/api/scenarios/${id}/apply`, { method: "POST" }, "Apply scenario");
}

export function cloneScenarioFromSection(
  sectionId: string,
  name?: string,
): Promise<ScenarioDetail> {
  return requestJson(
    `/api/scenarios/from-section/${sectionId}`,
    { method: "POST", body: JSON.stringify(name ? { name } : {}) },
    "Clone section into scenario",
  );
}

// ─── Survey ingestion ───────────────────────────────────────────────────────

export interface IngestFileOptions {
  academicTermId?: string | null;
  departmentId?: string | null;
  dryRun?: boolean;
}

/** Upload an RDF/XML dump or a ClassIQ CSV export. `dryRun` validates only. */
export function ingestSurveyFile(
  kind: "rdf" | "csv",
  file: File,
  opts: IngestFileOptions = {},
): Promise<IngestionReport> {
  const fd = new FormData();
  fd.append("file", file);
  if (opts.academicTermId) fd.append("academic_term_id", opts.academicTermId);
  if (opts.departmentId) fd.append("department_id", opts.departmentId);
  fd.append("dry_run", opts.dryRun ? "true" : "false");
  return requestJson(
    `/api/ingestion/${kind}`,
    { method: "POST", body: fd },
    opts.dryRun ? "Preview import" : "Import",
  );
}

export function ingestManual(body: ManualSubmissionInput): Promise<IngestionReport> {
  return requestJson(
    "/api/ingestion/manual",
    { method: "POST", body: JSON.stringify(body) },
    "Manual entry",
  );
}

export function listIngestionJobs(limit = 50): Promise<IngestionJob[]> {
  return requestJson(`/api/ingestion/jobs?limit=${limit}`, {}, "List ingestion jobs");
}

export function getInstrument(): Promise<Instrument> {
  return requestJson("/api/ingestion/instrument", {}, "Load instrument");
}

// ─── Section lifecycle + roster (F4, BACKEND_ARCHITECTURE §7) ───────────────

export type SectionTransition = "activate" | "archive" | "reopen";

/** simulated → active, active → archived, or simulated → draft. */
export function transitionSection(
  sectionId: string,
  action: SectionTransition,
): Promise<{ id: string; state: string }> {
  return requestJson(
    `/api/sections/${sectionId}/${action}`,
    { method: "POST" },
    `Section ${action}`,
  );
}

/** Replace the enrolled roster; a simulated section returns to draft. */
export function updateSectionRoster(
  sectionId: string,
  studentIds: string[],
): Promise<{ id: string; state: string }> {
  return requestJson(
    `/api/sections/${sectionId}/students`,
    { method: "PUT", body: JSON.stringify({ student_ids: studentIds }) },
    "Update roster",
  );
}

export function deleteSection(sectionId: string): Promise<void> {
  return requestJson(`/api/sections/${sectionId}`, { method: "DELETE" }, "Delete section");
}

// ─── Institution analytics (client-side drill-down) ────────────────────────

export function getDepartmentAnalytics(
  departmentId: string,
): Promise<InstitutionAnalyticsOverview> {
    return requestJson(
    `/api/institution/analytics/departments/${departmentId}`,
    {},
    "Department analytics",
  );
}

// ─── Sections (read) ────────────────────────────────────────────────────────

export function getSection(sectionId: string): Promise<SectionDetailShape> {
  return requestJson(`/api/sections/${sectionId}`, {}, "Load section");
}

// ─── S3 Longitudinal ────────────────────────────────────────────────────────

export function getLongitudinal(
  scope: { departmentId?: string | null; sectionId?: string | null } = {},
  top = 15,
): Promise<LongitudinalOverview> {
  const q = new URLSearchParams({ top: String(top) });
  if (scope.departmentId) q.set("department_id", scope.departmentId);
  if (scope.sectionId) q.set("section_id", scope.sectionId);
  return requestJson(
    `/api/analytics/longitudinal?${q.toString()}`,
    {},
    "Longitudinal analytics",
  );
}

export function getStudentProfileHistory(
  studentId: string,
): Promise<StudentProfileHistory> {
  return requestJson(`/api/students/${studentId}/profile-history`, {}, "Profile history");
}

// ─── S1 Early warning ───────────────────────────────────────────────────────

export function getEarlyWarningOverview(): Promise<EarlyWarningOverview> {
  return requestJson("/api/early-warning/overview", {}, "Early-warning overview");
}

export function listFlags(
  opts: { sectionId?: string; status?: WarningStatus } = {},
): Promise<FlagShape[]> {
  const q = new URLSearchParams();
  if (opts.sectionId) q.set("section_id", opts.sectionId);
  if (opts.status) q.set("status", opts.status);
  const qs = q.toString();
  return requestJson(`/api/early-warning/flags${qs ? `?${qs}` : ""}`, {}, "List flags");
}

export function setFlagStatus(flagId: string, status: WarningStatus): Promise<FlagShape> {
  return requestJson(
    `/api/early-warning/flags/${flagId}`,
    { method: "PATCH", body: JSON.stringify({ status }) },
    "Update flag",
  );
}

export function listSectionOutcomes(sectionId: string): Promise<OutcomeShape[]> {
  return requestJson(`/api/early-warning/sections/${sectionId}/outcomes`, {}, "Outcomes");
}

export function recordSectionOutcomes(
  sectionId: string,
  weekNo: number,
  entries: OutcomeEntry[],
  evaluate = true,
): Promise<RecordOutcomesResponse> {
  return requestJson(
    `/api/early-warning/sections/${sectionId}/outcomes`,
    {
      method: "POST",
      body: JSON.stringify({ week_no: weekNo, entries, evaluate }),
    },
    "Record outcomes",
  );
}

export function evaluateSection(sectionId: string): Promise<EvaluateResponse> {
  return requestJson(
    `/api/early-warning/sections/${sectionId}/evaluate`,
    { method: "POST" },
    "Evaluate section",
  );
}

export function listSectionFlags(sectionId: string): Promise<FlagShape[]> {
  return requestJson(`/api/early-warning/sections/${sectionId}/flags`, {}, "Section flags");
}

// ─── S2 Ask ClassIQ ─────────────────────────────────────────────────────────

export function getLLMStatus(): Promise<LLMStatus> {
  return requestJson("/api/llm/status", {}, "Assistant status");
}

export function askClassIQ(
  question: string,
  history: ChatTurn[],
  departmentId?: string | null,
): Promise<LLMQueryResponse> {
  return requestJson(
    "/api/llm/query",
    {
      method: "POST",
      body: JSON.stringify({
        question,
        history,
        department_id: departmentId || null,
      }),
    },
    "Ask ClassIQ",
  );
}

// ─── Survey forms (staff) ───────────────────────────────────────────────────

export function listForms(): Promise<SurveyFormShape[]> {
  return requestJson("/api/forms", {}, "List forms");
}

export function getFormMeta(): Promise<FormMeta> {
  return requestJson("/api/forms/meta", {}, "Load form options");
}

export function createForm(input: Partial<FormSettings> & { title: string }): Promise<SurveyFormShape> {
  return requestJson(
    "/api/forms",
    { method: "POST", body: JSON.stringify(input) },
    "Create form",
  );
}

export function getForm(id: string): Promise<SurveyFormShape> {
  return requestJson(`/api/forms/${id}`, {}, "Load form");
}

export function updateForm(
  id: string,
  changes: Partial<FormSettings> & { status?: FormStatus },
): Promise<SurveyFormShape> {
  return requestJson(
    `/api/forms/${id}`,
    { method: "PATCH", body: JSON.stringify(changes) },
    "Save form",
  );
}

export function regenerateFormCode(id: string): Promise<SurveyFormShape> {
  return requestJson(`/api/forms/${id}/code`, { method: "POST" }, "Issue new code");
}

export function deleteForm(id: string): Promise<void> {
  return requestJson(`/api/forms/${id}`, { method: "DELETE" }, "Delete form");
}

export function listFormSubmissions(id: string): Promise<FormSubmissionShape[]> {
  return requestJson(`/api/forms/${id}/submissions`, {}, "Load submissions");
}

export function voidFormSubmission(formId: string, submissionId: string): Promise<void> {
  return requestJson(
    `/api/forms/${formId}/submissions/${submissionId}/void`,
    { method: "POST" },
    "Void submission",
  );
}

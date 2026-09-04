"use client";

import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import ScoreRing from "@/components/ScoreRing";
import {
  applyScenario,
  compareScenario,
  createScenario,
  deleteScenario,
  getScenario,
  listScenarios,
  simulateScenario,
  updateScenario,
} from "@/lib/api";
import { BRAND, scoreColor } from "@/lib/brand";
import type {
  ScenarioCompareResponse,
  ScenarioCompareRow,
  ScenarioListItem,
  ScenarioSectionInput,
  SimulationResultShape,
} from "@/lib/types";
import {
  ArrowLeftRight,
  Check,
  FlaskConical,
  Pencil,
  Play,
  Plus,
  Search,
  Trash2,
  TrendingDown,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

// ─── Option shapes passed from the server component ────────────────────────

export interface LiveSectionOpt {
  id: string;
  label: string;
  state: string;
  courseId: string;
  teacherId: string | null;
  termId: string;
  courseCode: string;
  courseName: string;
  teacherName: string | null;
  studentIds: string[];
}

export interface ScenarioOptions {
  courses: { id: string; code: string; name: string }[];
  terms: { id: string; name: string; is_active: boolean }[];
  teachers: { id: string; full_name: string }[];
  students: { id: string; full_name: string; external_id: string | null }[];
  liveSections: LiveSectionOpt[];
}

interface BuilderSection {
  key: string;
  course_id: string;
  teacher_id: string;
  label: string;
  student_ids: string[];
}

// ─── Root view ─────────────────────────────────────────────────────────────

export default function ScenariosView({
  initialScenarios,
  loadError,
  options,
}: {
  initialScenarios: ScenarioListItem[];
  loadError: string | null;
  options: ScenarioOptions;
}) {
  const router = useRouter();
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>(initialScenarios);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialScenarios[0]?.id ?? null,
  );
  // Comparison for whichever scenario is selected. Derived, not synced: the
  // loaded payload is only shown when it belongs to the current selection.
  const [loaded, setLoaded] = useState<ScenarioCompareResponse | null>(null);
  const compare = loaded && loaded.scenario.id === selectedId ? loaded : null;
  const compareLoading = selectedId !== null && compare === null;
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(loadError);
  const [notice, setNotice] = useState<string | null>(null);
  const [builder, setBuilder] = useState<
    { mode: "create" } | { mode: "edit"; scenario: ScenarioCompareResponse } | null
  >(null);

  const selected = scenarios.find((s) => s.id === selectedId) ?? null;

  const refreshList = useCallback(async () => {
    try {
      const list = await listScenarios();
      setScenarios(list);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh scenarios");
      return null;
    }
  }, []);

  const loadCompare = useCallback(async (id: string) => {
    try {
      const res = await compareScenario(id);
      setLoaded(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load comparison");
    }
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    compareScenario(selectedId)
      .then((res) => {
        if (!cancelled) setLoaded(res);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Could not load comparison");
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  async function handleSimulate(id: string) {
    setError(null);
    setNotice(null);
    setBusy(`sim:${id}`);
    try {
      const res = await simulateScenario(id);
      setNotice(
        res.skipped.length
          ? `Scored ${res.sections.length - res.skipped.length} section(s); skipped ${res.skipped.join("; ")}`
          : `Scored ${res.sections.length} section(s) — average ${res.avg_score ?? "—"}.`,
      );
      await refreshList();
      await loadCompare(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleApply(id: string) {
    setError(null);
    setNotice(null);
    setBusy(`apply:${id}`);
    try {
      const res = await applyScenario(id);
      setNotice(
        `Applied to ${res.applied.length} live section(s): ` +
          res.applied
            .map(
              (a) =>
                `${a.course.code} ${a.label}${a.created ? " (new)" : ""}${
                  a.compatibility_score != null ? ` → ${a.compatibility_score}` : ""
                }`,
            )
            .join(", "),
      );
      await refreshList();
      await loadCompare(id);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    setNotice(null);
    setBusy(`del:${id}`);
    try {
      await deleteScenario(id);
      const list = await refreshList();
      setSelectedId(list?.[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleSaved(id: string) {
    setBuilder(null);
    const list = await refreshList();
    if (list) setSelectedId(id);
    await loadCompare(id);
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* ── Header ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-4xl font-extrabold tracking-tight"
            style={{ color: BRAND.textHeading }}
          >
            What-If Scenario Testing
          </h1>
          <p
            className="text-base mt-1.5 max-w-2xl"
            style={{ color: BRAND.textHeading, opacity: 0.7 }}
          >
            Compose alternative teacher and student configurations, run them
            through the same scoring engine as live sections, and compare
            side by side before committing to a semester.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBuilder({ mode: "create" })}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND.teal }}
        >
          <Plus size={16} /> New Scenario
        </button>
      </div>

      {error && <Banner tone="error" text={error} onClose={() => setError(null)} />}
      {notice && <Banner tone="ok" text={notice} onClose={() => setNotice(null)} />}

      {scenarios.length === 0 ? (
        <EmptyState
          icon={FlaskConical}
          title="No scenarios yet"
          description="Create a scenario to test an alternative teacher or roster. Start from a live section to tweak the current assignment."
          action={
            <button
              type="button"
              onClick={() => setBuilder({ mode: "create" })}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND.teal }}
            >
              <Plus size={16} /> New Scenario
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5">
          {/* ── Scenario list ───────────────────────────────────── */}
          <div className="space-y-3">
            {scenarios.map((s) => {
              const active = s.id === selectedId;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className="w-full text-left rounded-2xl bg-white p-4 transition hover:shadow-md"
                  style={{
                    border: `1px solid ${active ? BRAND.teal : BRAND.cardBorder}`,
                    boxShadow: active ? `0 0 0 3px ${BRAND.tealLight}` : undefined,
                  }}
                >
                  <div className="flex items-start gap-3">
                    <ScoreRing score={s.avg_score != null ? Math.round(s.avg_score) : 0} size={56} />
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-bold truncate"
                        style={{ color: BRAND.textHeading }}
                      >
                        {s.name}
                      </div>
                      <div className="text-xs mt-0.5" style={{ color: BRAND.textMuted }}>
                        {s.academic_term_name ?? "—"} · {s.section_count} section
                        {s.section_count === 1 ? "" : "s"}
                      </div>
                      <div className="mt-1.5">
                        <Badge text={s.status} />
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Detail + compare ────────────────────────────────── */}
          <div className="space-y-4 min-w-0">
            {selected && (
              <div
                className="rounded-2xl bg-white p-5 md:p-6"
                style={{ border: `2px solid ${BRAND.teal}` }}
              >
                <div className="flex items-start justify-between flex-wrap gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2
                        className="text-2xl font-extrabold tracking-tight"
                        style={{ color: BRAND.textHeading }}
                      >
                        {selected.name}
                      </h2>
                      <Badge text={selected.status} />
                    </div>
                    <p className="text-sm mt-1" style={{ color: BRAND.textMuted }}>
                      {selected.academic_term_name ?? "—"}
                      {selected.notes ? ` · ${selected.notes}` : ""}
                      {selected.last_simulated_at
                        ? ` · last simulated ${new Date(selected.last_simulated_at).toLocaleString()}`
                        : " · not simulated yet"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleSimulate(selected.id)}
                      disabled={busy !== null || selected.status === "applied"}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: BRAND.purple }}
                    >
                      <Play size={14} />
                      {busy === `sim:${selected.id}` ? "Running…" : "Run Simulation"}
                    </button>
                    <button
                      type="button"
                      onClick={() => compare && setBuilder({ mode: "edit", scenario: compare })}
                      disabled={busy !== null || !compare || selected.status === "applied"}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark }}
                    >
                      <Pencil size={14} /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleApply(selected.id)}
                      disabled={busy !== null || selected.status !== "simulated"}
                      title={
                        selected.status !== "simulated"
                          ? "Simulate the scenario before applying it"
                          : "Copy this scenario onto the live sections"
                      }
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: BRAND.teal }}
                    >
                      <Check size={14} />
                      {busy === `apply:${selected.id}` ? "Applying…" : "Apply to sections"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(selected.id)}
                      disabled={busy !== null}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold transition hover:opacity-90 disabled:opacity-50"
                      style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                    >
                      <Trash2 size={14} />
                      {busy === `del:${selected.id}` ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>

                {/* Summary strip */}
                {compare && (
                  <div className="grid grid-cols-3 gap-3 mt-5">
                    <SummaryTile
                      label="Baseline average"
                      value={compare.baseline_avg}
                      hint="Latest live results for the same sections"
                    />
                    <SummaryTile
                      label="Scenario average"
                      value={compare.scenario_avg}
                      hint="Latest scenario simulation"
                    />
                    <DeltaTile value={compare.avg_delta} />
                  </div>
                )}
              </div>
            )}

            {compareLoading && (
              <p className="text-sm italic px-1" style={{ color: BRAND.textMuted }}>
                Loading comparison…
              </p>
            )}

            {compare && !compareLoading && (
              <div className="space-y-4">
                {compare.rows.map((row) => (
                  <CompareCard key={row.scenario_section_id} row={row} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {builder && (
        <ScenarioBuilder
          options={options}
          initial={
            builder.mode === "edit"
              ? {
                  id: builder.scenario.scenario.id,
                  name: builder.scenario.scenario.name,
                  notes: builder.scenario.scenario.notes ?? "",
                  termId: builder.scenario.scenario.academic_term_id,
                  sections: builder.scenario.rows.map((r, i) => ({
                    key: `s${i}`,
                    course_id: r.course.id,
                    teacher_id: r.scenario_teacher?.id ?? "",
                    label: r.label,
                    student_ids: [],
                  })),
                  rowsForRoster: builder.scenario.rows,
                }
              : null
          }
          onClose={() => setBuilder(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}

// ─── Compare card (one scenario section vs its live baseline) ──────────────

function CompareCard({ row }: { row: ScenarioCompareRow }) {
  return (
    <div
      className="rounded-2xl bg-white p-5"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
        <div>
          <div className="font-bold text-lg" style={{ color: BRAND.textHeading }}>
            {row.course.code} &mdash; Section {row.label}
          </div>
          <div className="text-xs" style={{ color: BRAND.textMuted }}>
            {row.course.name}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DeltaChip value={row.score_delta} label="score" />
          {(row.roster.added > 0 || row.roster.removed > 0) && (
            <span
              className="text-xs px-2.5 py-1 rounded-full font-semibold"
              style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark }}
            >
              <Users size={12} className="inline mr-1 -mt-0.5" />
              +{row.roster.added} / −{row.roster.removed} students
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <SidePanel
          title="Current (baseline)"
          tone="baseline"
          teacher={row.baseline_teacher?.full_name ?? null}
          studentCount={row.baseline_student_count}
          result={row.baseline_result}
          emptyText={
            row.baseline_section_id
              ? "Live section exists but has not been simulated yet."
              : "No live section with this course + label — this scenario would create one."
          }
          stateText={row.baseline_state}
        />
        <SidePanel
          title="Scenario"
          tone="scenario"
          teacher={row.scenario_teacher?.full_name ?? null}
          studentCount={row.scenario_student_count}
          result={row.scenario_result}
          emptyText="Run the simulation to score this scenario section."
          stateText={null}
        />
      </div>

      {row.factor_deltas.length > 0 && (
        <div className="mt-4">
          <div
            className="text-xs font-semibold uppercase tracking-wider mb-2"
            style={{ color: BRAND.textMuted }}
          >
            Factor deltas
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {row.factor_deltas.map((f) => (
              <div
                key={f.factor_name}
                className="flex items-center gap-3 rounded-xl px-3 py-2"
                style={{ backgroundColor: BRAND.subtleBg }}
              >
                <span
                  className="text-sm font-medium flex-1 truncate"
                  style={{ color: BRAND.text }}
                >
                  {f.factor_name}
                  <span className="ml-1.5 text-[11px]" style={{ color: BRAND.textSubtle }}>
                    w {(f.weight * 100).toFixed(0)}%
                  </span>
                </span>
                <span className="text-xs font-mono" style={{ color: BRAND.textMuted }}>
                  {f.baseline_score ?? "—"} → {f.scenario_score}
                </span>
                <DeltaChip value={f.delta} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SidePanel({
  title,
  tone,
  teacher,
  studentCount,
  result,
  emptyText,
  stateText,
}: {
  title: string;
  tone: "baseline" | "scenario";
  teacher: string | null;
  studentCount: number | null;
  result: SimulationResultShape | null;
  emptyText: string;
  stateText: string | null;
}) {
  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: tone === "scenario" ? BRAND.mintSoft : BRAND.subtleBg,
        border: `1px solid ${tone === "scenario" ? BRAND.teal : BRAND.cardBorder}`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div
            className="text-[10px] uppercase tracking-wider font-semibold"
            style={{ color: BRAND.textMuted }}
          >
            {title}
            {stateText && (
              <span className="ml-2">
                <Badge text={stateText} />
              </span>
            )}
          </div>
          <div className="font-semibold mt-1 truncate" style={{ color: BRAND.text }}>
            {teacher ?? "Unassigned"}
          </div>
          <div className="text-xs" style={{ color: BRAND.textMuted }}>
            {studentCount != null ? `${studentCount} students` : "—"}
          </div>
        </div>
        {result ? (
          <ScoreRing score={result.compatibility_score} size={64} />
        ) : (
          <div
            className="w-16 h-16 rounded-full grid place-items-center text-xs"
            style={{ border: `2px dashed ${BRAND.cardBorder}`, color: BRAND.textSubtle }}
          >
            n/a
          </div>
        )}
      </div>

      {result ? (
        <>
          <div className="mt-3 space-y-1.5">
            {result.factors.map((f) => (
              <div key={f.factor_name} className="flex items-center gap-2">
                <span
                  className="w-28 text-[11px] truncate"
                  style={{ color: BRAND.textMuted }}
                >
                  {f.factor_name}
                </span>
                <div
                  className="flex-1 rounded-full h-2 overflow-hidden"
                  style={{ backgroundColor: "#fff" }}
                >
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${f.score}%`,
                      backgroundColor:
                        f.impact === "positive"
                          ? BRAND.scoreHigh
                          : f.impact === "negative"
                            ? BRAND.scoreLow
                            : BRAND.scoreMid,
                    }}
                  />
                </div>
                <span className="w-7 text-[11px] text-right" style={{ color: BRAND.textMuted }}>
                  {f.score}
                </span>
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-3 flex-wrap">
            <Badge text={`Outcome: ${result.predicted_outcome}`} />
            <Badge text={result.social_graph_impact} />
            {result.recommended_teacher_name && (
              <span className="text-[11px] self-center" style={{ color: BRAND.textMuted }}>
                engine suggests {result.recommended_teacher_name}
              </span>
            )}
          </div>
        </>
      ) : (
        <p className="text-xs italic mt-3" style={{ color: BRAND.textMuted }}>
          {emptyText}
        </p>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: number | null;
  hint: string;
}) {
  return (
    <div className="rounded-xl p-4" style={{ backgroundColor: BRAND.subtleBg }}>
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: BRAND.textMuted }}>
        {label}
      </div>
      <div
        className="text-3xl font-extrabold leading-none mt-1"
        style={{ color: value != null ? scoreColor(value) : BRAND.textSubtle }}
      >
        {value != null ? value : "—"}
      </div>
      <div className="text-[11px] mt-1" style={{ color: BRAND.textSubtle }}>
        {hint}
      </div>
    </div>
  );
}

function DeltaTile({ value }: { value: number | null }) {
  const up = value != null && value > 0;
  const down = value != null && value < 0;
  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: up ? "#DCFCE7" : down ? "#FEE2E2" : BRAND.subtleBg,
      }}
    >
      <div className="text-[10px] uppercase tracking-wider font-semibold" style={{ color: BRAND.textMuted }}>
        Change
      </div>
      <div
        className="text-3xl font-extrabold leading-none mt-1 flex items-center gap-2"
        style={{ color: up ? "#166534" : down ? "#991B1B" : BRAND.textSubtle }}
      >
        {value != null ? (
          <>
            {up ? <TrendingUp size={24} /> : down ? <TrendingDown size={24} /> : <ArrowLeftRight size={22} />}
            {value > 0 ? "+" : ""}
            {value}
          </>
        ) : (
          "—"
        )}
      </div>
      <div className="text-[11px] mt-1" style={{ color: BRAND.textSubtle }}>
        Scenario minus baseline, averaged over compared sections
      </div>
    </div>
  );
}

function DeltaChip({ value, label }: { value: number | null; label?: string }) {
  if (value == null) {
    return (
      <span
        className="text-xs px-2 py-0.5 rounded-full font-semibold"
        style={{ backgroundColor: BRAND.subtleBg, color: BRAND.textSubtle }}
      >
        no baseline
      </span>
    );
  }
  const up = value > 0;
  const down = value < 0;
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full font-semibold inline-flex items-center gap-1"
      style={{
        backgroundColor: up ? "#DCFCE7" : down ? "#FEE2E2" : BRAND.subtleBg,
        color: up ? "#166534" : down ? "#991B1B" : BRAND.textMuted,
      }}
    >
      {up ? <TrendingUp size={12} /> : down ? <TrendingDown size={12} /> : null}
      {value > 0 ? "+" : ""}
      {value}
      {label ? ` ${label}` : ""}
    </span>
  );
}

function Banner({
  tone,
  text,
  onClose,
}: {
  tone: "error" | "ok";
  text: string;
  onClose: () => void;
}) {
  const isErr = tone === "error";
  return (
    <div
      className="text-sm rounded-xl px-4 py-3 flex items-start gap-3"
      style={{
        backgroundColor: isErr ? "#FEE2E2" : "#DCFCE7",
        color: isErr ? "#991B1B" : "#166534",
        border: `1px solid ${isErr ? "#FECACA" : "#BBF7D0"}`,
      }}
    >
      <span className="flex-1">{text}</span>
      <button type="button" onClick={onClose} aria-label="Dismiss">
        <X size={14} />
      </button>
    </div>
  );
}

// ─── Builder modal ─────────────────────────────────────────────────────────

interface BuilderInitial {
  id: string;
  name: string;
  notes: string;
  termId: string;
  sections: BuilderSection[];
  rowsForRoster: ScenarioCompareRow[];
}

function ScenarioBuilder({
  options,
  initial,
  onClose,
  onSaved,
}: {
  options: ScenarioOptions;
  initial: BuilderInitial | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [termId, setTermId] = useState(
    initial?.termId ??
      options.terms.find((t) => t.is_active)?.id ??
      options.terms[0]?.id ??
      "",
  );
  const [sections, setSections] = useState<BuilderSection[]>(
    initial?.sections ?? [newSection(options)],
  );
  const [openKey, setOpenKey] = useState<string | null>(
    initial?.sections[0]?.key ?? null,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // When editing, the compare rows don't carry rosters — hydrate from the
  // scenario detail so student checkboxes reflect the saved roster.
  useEffect(() => {
    if (!initial) return;
    let cancelled = false;
    getScenario(initial.id)
      .then((d) => {
        if (cancelled) return;
        setSections((prev) =>
          prev.map((s, i) => ({
            ...s,
            student_ids: d.sections[i]?.students.map((st) => st.id) ?? s.student_ids,
          })),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [initial]);

  const liveForTerm = useMemo(
    () => options.liveSections.filter((s) => s.termId === termId),
    [options.liveSections, termId],
  );

  function patch(key: string, changes: Partial<BuilderSection>) {
    setSections((prev) => prev.map((s) => (s.key === key ? { ...s, ...changes } : s)));
  }

  function prefillFromLive(key: string, liveId: string) {
    const live = options.liveSections.find((s) => s.id === liveId);
    if (!live) return;
    patch(key, {
      course_id: live.courseId,
      label: live.label,
      teacher_id: live.teacherId ?? "",
      student_ids: [...live.studentIds],
    });
  }

  function addSection() {
    const s = newSection(options);
    setSections((prev) => [...prev, s]);
    setOpenKey(s.key);
  }

  function removeSection(key: string) {
    setSections((prev) => prev.filter((s) => s.key !== key));
  }

  async function handleSave() {
    setError(null);
    if (!name.trim()) return setError("Give the scenario a name.");
    if (!termId) return setError("Pick an academic term.");
    if (sections.length === 0) return setError("Add at least one section.");
    for (const s of sections) {
      if (!s.course_id || !s.label.trim() || !s.teacher_id) {
        return setError("Every section needs a course, a label and a teacher.");
      }
    }
    const payload: ScenarioSectionInput[] = sections.map((s) => ({
      course_id: s.course_id,
      teacher_id: s.teacher_id,
      label: s.label.trim(),
      student_ids: s.student_ids,
    }));
    setSaving(true);
    try {
      const saved = initial
        ? await updateScenario(initial.id, {
            name: name.trim(),
            notes: notes.trim() || null,
            sections: payload,
          })
        : await createScenario({
            name: name.trim(),
            notes: notes.trim() || null,
            academic_term_id: termId,
            sections: payload,
          });
      onSaved(saved.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save scenario");
      setSaving(false);
    }
  }

  const canBuild = options.courses.length > 0 && options.teachers.length > 0 && options.terms.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl p-6 w-full max-w-3xl shadow-xl max-h-[92vh] overflow-auto"
        style={{ border: `2px solid ${BRAND.teal}` }}
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
              {initial ? "Edit Scenario" : "New Scenario"}
            </h2>
            <p className="text-xs mt-0.5" style={{ color: BRAND.textMuted }}>
              {initial
                ? "Saving replaces the section list and clears previous results."
                : "Each section is a hypothetical (course, label, teacher, roster)."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X size={20} />
          </button>
        </div>

        {!canBuild ? (
          <p className="text-sm" style={{ color: BRAND.textMuted }}>
            You need at least one course, one teacher and one academic term before
            building a scenario. Ask your admin to add them.
          </p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Scenario name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Swap Nadia onto CS201-A"
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                  style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
                />
              </Field>
              <Field label="Academic term">
                <select
                  value={termId}
                  disabled={!!initial}
                  onChange={(e) => setTermId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white disabled:opacity-60"
                  style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
                >
                  {options.terms.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                      {t.is_active ? " (active)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Notes (optional)">
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="What are you testing?"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
              />
            </Field>

            <div className="flex items-center justify-between">
              <div className="text-xs uppercase font-semibold" style={{ color: BRAND.textMuted }}>
                Sections ({sections.length})
              </div>
              <button
                type="button"
                onClick={addSection}
                className="inline-flex items-center gap-1 text-sm font-semibold"
                style={{ color: BRAND.teal }}
              >
                <Plus size={14} /> Add section
              </button>
            </div>

            <div className="space-y-3">
              {sections.map((s, idx) => {
                const course = options.courses.find((c) => c.id === s.course_id);
                const teacher = options.teachers.find((t) => t.id === s.teacher_id);
                const open = openKey === s.key;
                return (
                  <div
                    key={s.key}
                    className="rounded-xl"
                    style={{ border: `1px solid ${open ? BRAND.teal : BRAND.cardBorder}` }}
                  >
                    <button
                      type="button"
                      onClick={() => setOpenKey(open ? null : s.key)}
                      className="w-full flex items-center justify-between px-4 py-3 text-left"
                    >
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate" style={{ color: BRAND.textHeading }}>
                          {course ? `${course.code} — Section ${s.label || "?"}` : `Section ${idx + 1}`}
                        </div>
                        <div className="text-xs truncate" style={{ color: BRAND.textMuted }}>
                          {teacher?.full_name ?? "No teacher"} · {s.student_ids.length} students
                        </div>
                      </div>
                      <span className="text-xs" style={{ color: BRAND.textMuted }}>
                        {open ? "Collapse" : "Expand"}
                      </span>
                    </button>

                    {open && (
                      <div className="px-4 pb-4 space-y-3">
                        {liveForTerm.length > 0 && (
                          <Field label="Prefill from a live section">
                            <select
                              defaultValue=""
                              onChange={(e) => {
                                if (e.target.value) prefillFromLive(s.key, e.target.value);
                                e.target.value = "";
                              }}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
                              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
                            >
                              <option value="">— copy course, label, teacher and roster —</option>
                              {liveForTerm.map((l) => (
                                <option key={l.id} value={l.id}>
                                  {l.courseCode} {l.label} · {l.teacherName ?? "unassigned"} · {l.studentIds.length} students
                                </option>
                              ))}
                            </select>
                          </Field>
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <Field label="Course">
                            <select
                              value={s.course_id}
                              onChange={(e) => patch(s.key, { course_id: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
                              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
                            >
                              {options.courses.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.code} · {c.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Label">
                            <input
                              value={s.label}
                              onChange={(e) => patch(s.key, { label: e.target.value })}
                              placeholder="A"
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
                            />
                          </Field>
                          <Field label="Teacher">
                            <select
                              value={s.teacher_id}
                              onChange={(e) => patch(s.key, { teacher_id: e.target.value })}
                              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
                              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
                            >
                              <option value="">— choose —</option>
                              {options.teachers.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.full_name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        </div>
                        <StudentPicker
                          students={options.students}
                          selected={s.student_ids}
                          onChange={(ids) => patch(s.key, { student_ids: ids })}
                        />
                        {sections.length > 1 && (
                          <button
                            type="button"
                            onClick={() => removeSection(s.key)}
                            className="inline-flex items-center gap-1 text-xs font-semibold"
                            style={{ color: "#991B1B" }}
                          >
                            <Trash2 size={12} /> Remove this section
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {error && (
              <div
                className="text-sm rounded-lg px-3 py-2"
                style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
              >
                {error}
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2 rounded-full text-sm font-semibold"
                style={{ backgroundColor: BRAND.subtleBg, color: BRAND.text }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: BRAND.teal }}
              >
                {saving ? "Saving…" : initial ? "Save changes" : "Create scenario"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function newSection(options: ScenarioOptions): BuilderSection {
  return {
    key: `s${Math.random().toString(36).slice(2, 9)}`,
    course_id: options.courses[0]?.id ?? "",
    teacher_id: "",
    label: "",
    student_ids: [],
  };
}

function StudentPicker({
  students,
  selected,
  onChange,
}: {
  students: ScenarioOptions["students"];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const picked = useMemo(() => new Set(selected), [selected]);
  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return students;
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(needle) ||
        (s.external_id ?? "").toLowerCase().includes(needle),
    );
  }, [q, students]);

  function toggle(id: string) {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div className="text-xs uppercase font-semibold" style={{ color: BRAND.textMuted }}>
          Students ({selected.length} selected)
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onChange(filtered.map((s) => s.id))}
            className="text-[11px] font-semibold"
            style={{ color: BRAND.teal }}
          >
            select shown
          </button>
          <button
            type="button"
            onClick={() => onChange([])}
            className="text-[11px] font-semibold"
            style={{ color: BRAND.textMuted }}
          >
            clear
          </button>
        </div>
      </div>
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg mb-1"
        style={{ border: `1px solid ${BRAND.inputBorder}` }}
      >
        <Search size={13} style={{ color: BRAND.textMuted }} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or ID…"
          className="flex-1 bg-transparent outline-none text-sm"
        />
      </div>
      {students.length === 0 ? (
        <p className="text-xs italic" style={{ color: BRAND.textMuted }}>
          No students in your institution yet.
        </p>
      ) : (
        <div
          className="max-h-44 overflow-auto rounded-lg p-1"
          style={{ border: `1px solid ${BRAND.inputBorder}` }}
        >
          {filtered.map((s) => (
            <label
              key={s.id}
              className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50 text-sm"
              style={{ color: BRAND.text }}
            >
              <input type="checkbox" checked={picked.has(s.id)} onChange={() => toggle(s.id)} />
              <span className="truncate">{s.full_name}</span>
              {s.external_id && (
                <span className="ml-auto font-mono text-[11px]" style={{ color: BRAND.textMuted }}>
                  {s.external_id}
                </span>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-xs uppercase font-semibold mb-1" style={{ color: BRAND.textMuted }}>
        {label}
      </div>
      {children}
    </label>
  );
}

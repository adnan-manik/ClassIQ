"use client";

import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import {
  getInstrument,
  ingestManual,
  ingestSurveyFile,
  listIngestionJobs,
} from "@/lib/api";
import { BRAND } from "@/lib/brand";
import {
  FSLSM_AXES,
  type FslsmAxis,
  type IngestionJob,
  type IngestionReport,
  type Instrument,
  type ManualSubmissionInput,
} from "@/lib/types";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Database,
  FileUp,
  History,
  Search,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";

export interface IngestionOptions {
  terms: { id: string; name: string; is_active: boolean }[];
  departments: { id: string; name: string; code: string }[];
  students: {
    id: string;
    full_name: string;
    external_id: string | null;
    email: string | null;
  }[];
}

type Tab = "upload" | "manual" | "jobs";

const SOURCE_LABEL: Record<string, string> = {
  rdf_bulk_import: "RDF bulk import",
  form_app: "Form app",
  classiq_internal: "ClassIQ CSV",
  manual_admin: "Manual entry",
};

export default function IngestionView({
  options,
  initialJobs,
  instrument,
  loadError,
}: {
  options: IngestionOptions;
  initialJobs: IngestionJob[];
  instrument: Instrument | null;
  loadError: string | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("upload");
  const [jobs, setJobs] = useState<IngestionJob[]>(initialJobs);
  const [error, setError] = useState<string | null>(loadError);

  async function refreshJobs() {
    try {
      setJobs(await listIngestionJobs());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh jobs");
    }
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          Survey Ingestion
        </h1>
        <p
          className="text-base mt-1.5 max-w-2xl"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Load Index of Learning Styles (ILS) responses from a bulk RDF dump, a
          ClassIQ CSV export, or type them in for one student. Every response is
          stored verbatim and scored into a new FSLSM profile version.
        </p>
      </div>

      {error && (
        <div
          className="text-sm rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 flex-wrap">
        {(
          [
            ["upload", "Upload file", FileUp],
            ["manual", "Manual entry", ClipboardList],
            ["jobs", `Job history (${jobs.length})`, History],
          ] as const
        ).map(([key, label, Icon]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition"
              style={{
                backgroundColor: active ? BRAND.teal : "white",
                color: active ? "white" : BRAND.tealDark,
                border: `1px solid ${active ? BRAND.teal : BRAND.cardBorder}`,
              }}
            >
              <Icon size={15} /> {label}
            </button>
          );
        })}
      </div>

      {tab === "upload" && (
        <UploadPanel
          options={options}
          onDone={async () => {
            await refreshJobs();
            router.refresh();
          }}
          onError={setError}
        />
      )}
      {tab === "manual" && (
        <ManualPanel
          options={options}
          instrument={instrument}
          onDone={async () => {
            await refreshJobs();
            router.refresh();
          }}
          onError={setError}
        />
      )}
      {tab === "jobs" && <JobsPanel jobs={jobs} onRefresh={refreshJobs} />}
    </div>
  );
}

// ─── Upload panel ──────────────────────────────────────────────────────────

function UploadPanel({
  options,
  onDone,
  onError,
}: {
  options: IngestionOptions;
  onDone: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<"rdf" | "csv">("rdf");
  const [termId, setTermId] = useState(
    options.terms.find((t) => t.is_active)?.id ?? options.terms[0]?.id ?? "",
  );
  const [deptId, setDeptId] = useState("");
  const [preview, setPreview] = useState<IngestionReport | null>(null);
  const [result, setResult] = useState<IngestionReport | null>(null);
  const [busy, setBusy] = useState<"preview" | "import" | null>(null);

  function pick(f: File | null) {
    setFile(f);
    setPreview(null);
    setResult(null);
    if (f) {
      const ext = f.name.toLowerCase().split(".").pop();
      setKind(ext === "csv" ? "csv" : "rdf");
    }
  }

  async function run(dryRun: boolean) {
    if (!file) return;
    onError(null);
    setBusy(dryRun ? "preview" : "import");
    try {
      const rep = await ingestSurveyFile(kind, file, {
        academicTermId: termId || null,
        departmentId: deptId || null,
        dryRun,
      });
      if (dryRun) setPreview(rep);
      else {
        setResult(rep);
        setPreview(null);
        await onDone();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-5">
      <div
        className="rounded-3xl bg-white p-6 space-y-5"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <div
          className="rounded-2xl p-8 text-center cursor-pointer"
          style={{ border: `2px dashed ${file ? BRAND.teal : BRAND.cardBorder}`, backgroundColor: BRAND.mintSoft }}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            pick(e.dataTransfer.files?.[0] ?? null);
          }}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".rdf,.xml,.owl,.csv,text/csv,application/rdf+xml,text/xml"
            className="hidden"
            onChange={(e) => pick(e.target.files?.[0] ?? null)}
          />
          <div
            className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-3"
            style={{ backgroundColor: BRAND.tealLight }}
          >
            <Upload size={24} style={{ color: BRAND.teal }} />
          </div>
          {file ? (
            <>
              <div className="font-semibold" style={{ color: BRAND.text }}>
                {file.name}
              </div>
              <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                {(file.size / 1024).toFixed(0)} KB · detected as {kind.toUpperCase()}
              </div>
            </>
          ) : (
            <>
              <div className="font-semibold" style={{ color: BRAND.text }}>
                Drop an RDF/XML dump or a CSV export here
              </div>
              <div className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                or click to browse — the repo ships
                <code className="mx-1">Data_File_Collected_Data_for_KG_in_RDF_Triples.rdf</code>
                (176 students)
              </div>
            </>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Format">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as "rdf" | "csv")}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="rdf">RDF / OWL (rdf_bulk_import)</option>
              <option value="csv">ClassIQ CSV (classiq_internal)</option>
            </select>
          </Field>
          <Field label="Academic term">
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="">— active term —</option>
              {options.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_active ? " (active)" : ""}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Department for new students">
            <select
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="">— none —</option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex gap-2 flex-wrap">
          <button
            type="button"
            disabled={!file || busy !== null}
            onClick={() => run(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition disabled:opacity-50"
            style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark }}
          >
            <Search size={14} />
            {busy === "preview" ? "Checking…" : "Preview (dry run)"}
          </button>
          <button
            type="button"
            disabled={!file || busy !== null}
            onClick={() => run(false)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND.teal }}
          >
            <Database size={14} />
            {busy === "import" ? "Importing…" : "Import"}
          </button>
        </div>

        {preview && <ReportCard report={preview} title="Dry-run preview — nothing was written" />}
        {result && <ReportCard report={result} title="Import result" />}
      </div>

      <aside
        className="rounded-3xl p-6 text-sm space-y-3 h-fit"
        style={{ backgroundColor: BRAND.mintSoft, border: `1px solid ${BRAND.cardBorder}` }}
      >
        <h3 className="font-bold" style={{ color: BRAND.textHeading }}>
          How the pipeline works
        </h3>
        <ol className="list-decimal pl-4 space-y-1.5" style={{ color: BRAND.textMuted }}>
          <li>Each submission is normalised to one internal shape (44 A/B answers + identity).</li>
          <li>Students are matched by roster ID, then email; otherwise created.</li>
          <li>Responses are idempotent — re-importing the same file skips duplicates.</li>
          <li>Answers are stored verbatim, then scored (A − B per axis, −11…+11).</li>
          <li>A new profile version becomes current; the previous one is kept for longitudinal analytics.</li>
        </ol>
        <div className="pt-2" style={{ color: BRAND.textMuted }}>
          <div className="font-semibold mb-1" style={{ color: BRAND.text }}>
            CSV columns
          </div>
          <code className="text-[11px] break-all">
            external_id, email, full_name, q1 … q44 [, collaboration_pref, participation_level, response_id, submitted_at]
          </code>
        </div>
      </aside>
    </div>
  );
}

// ─── Manual entry panel ────────────────────────────────────────────────────

function ManualPanel({
  options,
  instrument,
  onDone,
  onError,
}: {
  options: IngestionOptions;
  instrument: Instrument | null;
  onDone: () => Promise<void>;
  onError: (msg: string | null) => void;
}) {
  const [inst, setInst] = useState<Instrument | null>(instrument);
  const [mode, setMode] = useState<"existing" | "new">(
    options.students.length ? "existing" : "new",
  );
  const [studentId, setStudentId] = useState(options.students[0]?.id ?? "");
  const [studentQuery, setStudentQuery] = useState("");
  const [externalId, setExternalId] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [collab, setCollab] = useState("");
  const [part, setPart] = useState("");
  const [termId, setTermId] = useState(
    options.terms.find((t) => t.is_active)?.id ?? options.terms[0]?.id ?? "",
  );
  const [answers, setAnswers] = useState<Record<number, "A" | "B">>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<IngestionReport | null>(null);

  const filteredStudents = useMemo(() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q) return options.students;
    return options.students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.external_id ?? "").toLowerCase().includes(q) ||
        (s.email ?? "").toLowerCase().includes(q),
    );
  }, [studentQuery, options.students]);

  const answered = Object.keys(answers).length;
  const total = inst?.total_questions ?? 44;

  const byAxis = useMemo(() => {
    const groups: Record<FslsmAxis, Instrument["questions"]> = {
      active_reflective: [],
      sensing_intuitive: [],
      visual_verbal: [],
      sequential_global: [],
    };
    for (const q of inst?.questions ?? []) groups[q.axis]?.push(q);
    return groups;
  }, [inst]);

  async function loadInstrument() {
    try {
      setInst(await getInstrument());
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not load instrument");
    }
  }

  function randomFill() {
    const next: Record<number, "A" | "B"> = {};
    for (let i = 1; i <= total; i++) next[i] = Math.random() < 0.5 ? "A" : "B";
    setAnswers(next);
  }

  async function submit() {
    onError(null);
    if (answered < total) {
      onError(`Answer all ${total} questions (${total - answered} left).`);
      return;
    }
    const body: ManualSubmissionInput = {
      answers,
      academic_term_id: termId || null,
      collaboration_pref: (collab || null) as ManualSubmissionInput["collaboration_pref"],
      participation_level: (part || null) as ManualSubmissionInput["participation_level"],
    };
    if (mode === "existing") {
      if (!studentId) return onError("Pick a student.");
      body.student_id = studentId;
    } else {
      if (!externalId && !email) return onError("Give a student ID or an email.");
      body.external_id = externalId || null;
      body.email = email || null;
      body.full_name = fullName || null;
    }
    setBusy(true);
    try {
      const rep = await ingestManual(body);
      setResult(rep);
      setAnswers({});
      await onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div
        className="rounded-3xl bg-white p-6 space-y-4"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
            Who is this response for?
          </h2>
          <div className="flex gap-1 rounded-full p-1" style={{ backgroundColor: BRAND.subtleBg }}>
            {(["existing", "new"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className="px-3 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: mode === m ? "white" : "transparent",
                  color: mode === m ? BRAND.tealDark : BRAND.textMuted,
                }}
              >
                {m === "existing" ? "Existing student" : "New student"}
              </button>
            ))}
          </div>
        </div>

        {mode === "existing" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Search">
              <input
                value={studentQuery}
                onChange={(e) => setStudentQuery(e.target.value)}
                placeholder="Name, ID or email…"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
              />
            </Field>
            <Field label={`Student (${filteredStudents.length})`}>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
                style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
              >
                {filteredStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {s.external_id ? ` · ${s.external_id}` : ""}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Field label="Student ID">
              <input
                value={externalId}
                onChange={(e) => setExternalId(e.target.value)}
                placeholder="SP26-BSCS-0001"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
              />
            </Field>
            <Field label="Full name">
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
              />
            </Field>
            <Field label="Email">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Field label="Academic term">
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="">— active term —</option>
              {options.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Collaboration preference (aux)">
            <select
              value={collab}
              onChange={(e) => setCollab(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="">— skip —</option>
              <option value="solo">Solo</option>
              <option value="pair">Pair</option>
              <option value="group">Group</option>
            </select>
          </Field>
          <Field label="Participation level (aux)">
            <select
              value={part}
              onChange={(e) => setPart(e.target.value)}
              className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="">— skip —</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </Field>
        </div>
      </div>

      <div
        className="rounded-3xl bg-white p-6 space-y-5"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
              ILS answers ({answered}/{total})
            </h2>
            <p className="text-xs" style={{ color: BRAND.textMuted }}>
              {inst ? `${inst.name} v${inst.version}` : "Instrument not loaded"} · A = first pole, B = second pole
            </p>
          </div>
          <div className="flex gap-2">
            {!inst && (
              <button
                type="button"
                onClick={loadInstrument}
                className="px-3 py-1.5 rounded-full text-xs font-semibold"
                style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark }}
              >
                Load questions
              </button>
            )}
            <button
              type="button"
              onClick={randomFill}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: BRAND.subtleBg, color: BRAND.textMuted }}
              title="Fill random answers (demo helper)"
            >
              Random fill
            </button>
            <button
              type="button"
              onClick={() => setAnswers({})}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: BRAND.subtleBg, color: BRAND.textMuted }}
            >
              Clear
            </button>
          </div>
        </div>

        {inst ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {(Object.keys(byAxis) as FslsmAxis[]).map((axis) => {
              const meta = FSLSM_AXES[axis];
              return (
                <div key={axis} className="rounded-2xl p-4" style={{ backgroundColor: BRAND.subtleBg }}>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-bold text-sm" style={{ color: meta.color }}>
                      {meta.label}
                    </span>
                    <span className="text-[11px]" style={{ color: BRAND.textMuted }}>
                      A → {meta.poleA} · B → {meta.poleB}
                    </span>
                  </div>
                  <div className="space-y-2">
                    {byAxis[axis].map((q) => (
                      <div key={q.sequence_no} className="rounded-xl bg-white p-3">
                        <div className="text-xs font-semibold mb-1.5" style={{ color: BRAND.text }}>
                          {q.sequence_no}. {q.prompt}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {(["A", "B"] as const).map((c) => {
                            const on = answers[q.sequence_no] === c;
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() =>
                                  setAnswers((prev) => ({ ...prev, [q.sequence_no]: c }))
                                }
                                className="text-left rounded-lg px-2.5 py-1.5 text-[11px] transition"
                                style={{
                                  border: `1px solid ${on ? meta.color : BRAND.cardBorder}`,
                                  backgroundColor: on ? `${meta.color}22` : "white",
                                  color: BRAND.text,
                                }}
                              >
                                <span className="font-bold mr-1">{c}.</span>
                                {c === "A" ? q.answer_a : q.answer_b}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm italic" style={{ color: BRAND.textMuted }}>
            The 44-question instrument could not be loaded from the backend.
          </p>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <button
            type="button"
            disabled={busy || !inst}
            onClick={submit}
            className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: BRAND.teal }}
          >
            <CheckCircle2 size={15} />
            {busy ? "Scoring…" : "Score & save profile"}
          </button>
          <span className="text-xs" style={{ color: BRAND.textMuted }}>
            Creates a new profile version for the student and flips it to current.
          </span>
        </div>

        {result && <ReportCard report={result} title="Saved" />}
      </div>
    </div>
  );
}

// ─── Jobs panel ────────────────────────────────────────────────────────────

function JobsPanel({ jobs, onRefresh }: { jobs: IngestionJob[]; onRefresh: () => Promise<void> }) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
          Ingestion jobs
        </h2>
        <button
          type="button"
          onClick={onRefresh}
          className="px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark }}
        >
          Refresh
        </button>
      </div>
      {jobs.length === 0 ? (
        <EmptyState
          icon={History}
          title="No ingestion jobs yet"
          description="Every import — file, form app or manual entry — is recorded here with its summary."
        />
      ) : (
        <div className="overflow-x-auto rounded-xl" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
          <table className="w-full text-sm">
            <thead style={{ backgroundColor: BRAND.subtleBg }}>
              <tr>
                {["When", "Source", "Status", "Ingested", "Students", "Rejected", "By", "File"].map((h) => (
                  <th
                    key={h}
                    className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider"
                    style={{ color: BRAND.textMuted }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const s = j.summary ?? {};
                const errs = (s.errors as IngestionJob["summary"] extends null ? never : unknown[]) ?? [];
                const open = openId === j.id;
                return (
                  <FragmentRow
                    key={j.id}
                    job={j}
                    open={open}
                    onToggle={() => setOpenId(open ? null : j.id)}
                    ingested={Number(s.responses_ingested ?? 0)}
                    created={Number(s.students_created ?? 0)}
                    matched={Number(s.students_matched ?? 0)}
                    rejected={Number(s.responses_rejected ?? 0)}
                    duplicates={Number(s.responses_duplicate ?? 0)}
                    errors={Array.isArray(errs) ? (errs as { ref: string; field: string; message: string }[]) : []}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FragmentRow({
  job,
  open,
  onToggle,
  ingested,
  created,
  matched,
  rejected,
  duplicates,
  errors,
}: {
  job: IngestionJob;
  open: boolean;
  onToggle: () => void;
  ingested: number;
  created: number;
  matched: number;
  rejected: number;
  duplicates: number;
  errors: { ref: string; field: string; message: string }[];
}) {
  return (
    <>
      <tr
        onClick={onToggle}
        className="cursor-pointer hover:bg-slate-50"
        style={{ borderTop: `1px solid ${BRAND.cardBorder}55` }}
      >
        <td className="px-3 py-2 text-xs whitespace-nowrap" style={{ color: BRAND.textMuted }}>
          {new Date(job.created_at).toLocaleString()}
        </td>
        <td className="px-3 py-2 text-xs" style={{ color: BRAND.text }}>
          {SOURCE_LABEL[job.source] ?? job.source}
        </td>
        <td className="px-3 py-2">
          <StatusChip status={job.status} />
        </td>
        <td className="px-3 py-2 text-xs" style={{ color: BRAND.text }}>
          {ingested}
          {duplicates > 0 && (
            <span style={{ color: BRAND.textSubtle }}> (+{duplicates} dup)</span>
          )}
        </td>
        <td className="px-3 py-2 text-xs" style={{ color: BRAND.text }}>
          +{created} new · {matched} matched
        </td>
        <td className="px-3 py-2 text-xs" style={{ color: rejected ? "#991B1B" : BRAND.text }}>
          {rejected}
        </td>
        <td className="px-3 py-2 text-xs truncate max-w-[140px]" style={{ color: BRAND.textMuted }}>
          {job.triggered_by_name ?? "—"}
        </td>
        <td className="px-3 py-2 text-xs font-mono truncate max-w-[200px]" style={{ color: BRAND.textMuted }}>
          {job.file_path ?? "—"}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="px-4 py-3" style={{ backgroundColor: BRAND.mintSoft }}>
            {errors.length === 0 ? (
              <span className="text-xs" style={{ color: BRAND.textMuted }}>
                No row-level errors.
              </span>
            ) : (
              <ul className="text-xs space-y-1 max-h-48 overflow-auto" style={{ color: "#991B1B" }}>
                {errors.slice(0, 50).map((e, i) => (
                  <li key={i}>
                    <span className="font-mono">{e.ref}</span> · {e.field}: {e.message}
                  </li>
                ))}
                {errors.length > 50 && <li>… and {errors.length - 50} more</li>}
              </ul>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Shared bits ───────────────────────────────────────────────────────────

function ReportCard({ report, title }: { report: IngestionReport; title: string }) {
  const s = report.summary;
  const tiles: [string, number][] = [
    ["Responses ingested", s.responses_ingested],
    ["Duplicates skipped", s.responses_duplicate],
    ["Rejected", s.responses_rejected],
    ["Students created", s.students_created],
    ["Students matched", s.students_matched],
    ["Profiles created", s.profiles_created],
  ];
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: BRAND.mintSoft, border: `1px solid ${BRAND.cardBorder}` }}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="font-semibold" style={{ color: BRAND.textHeading }}>
          {title}
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={report.status} />
          <Badge text={report.dry_run ? "dry run" : (SOURCE_LABEL[report.source] ?? report.source)} />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2">
        {tiles.map(([k, v]) => (
          <div key={k} className="rounded-xl bg-white p-3">
            <div className="text-[10px] uppercase tracking-wider" style={{ color: BRAND.textMuted }}>
              {k}
            </div>
            <div className="text-xl font-extrabold" style={{ color: BRAND.textHeading }}>
              {v}
            </div>
          </div>
        ))}
      </div>
      {s.errors.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1" style={{ color: "#991B1B" }}>
            {s.errors.length} issue{s.errors.length === 1 ? "" : "s"}
            {s.errors_truncated > 0 ? ` (+${s.errors_truncated} not shown)` : ""}
          </div>
          <ul className="text-xs space-y-0.5 max-h-40 overflow-auto" style={{ color: "#991B1B" }}>
            {s.errors.slice(0, 40).map((e, i) => (
              <li key={i}>
                <span className="font-mono">{e.ref}</span> · {e.field}: {e.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const bg =
    status === "succeeded" ? "#DCFCE7" : status === "failed" ? "#FEE2E2" : status === "partial" ? "#FEF3C7" : BRAND.subtleBg;
  const fg =
    status === "succeeded" ? "#166534" : status === "failed" ? "#991B1B" : status === "partial" ? "#92400E" : BRAND.textMuted;
  return (
    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: bg, color: fg }}>
      {status}
    </span>
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

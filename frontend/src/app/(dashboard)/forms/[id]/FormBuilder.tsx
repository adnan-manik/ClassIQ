"use client";

import Modal from "@/components/Modal";
import Select from "@/components/Select";
import {
  deleteForm,
  listFormSubmissions,
  regenerateFormCode,
  updateForm,
  voidFormSubmission,
} from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type {
  FormExtraQuestion,
  FormMeta,
  FormPeerOption,
  FormQuestionKind,
  FormRelationType,
  FormSettings,
  FormStatus,
  FormSubmissionShape,
  SurveyFormShape,
} from "@/lib/types";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Check,
  Copy,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore, type ReactNode } from "react";
import { StatusBadge } from "../FormsView";

export interface BuilderScope {
  terms: { id: string; name: string; is_active: boolean }[];
  departments: { id: string; name: string; code: string }[];
  sections: { id: string; label: string; course_code: string }[];
}

const SETTING_KEYS = [
  "title",
  "description",
  "department_id",
  "section_id",
  "academic_term_id",
  "include_ils",
  "ils_wording",
  "collect_collaboration",
  "collect_participation",
  "collect_peers",
  "peer_options",
  "max_peer_picks",
  "extra_questions",
  "allow_new_students",
  "closes_at",
] as const satisfies readonly (keyof FormSettings)[];

function pickSettings(f: SurveyFormShape): FormSettings {
  return {
    title: f.title,
    description: f.description,
    department_id: f.department_id,
    section_id: f.section_id,
    academic_term_id: f.academic_term_id,
    include_ils: f.include_ils,
    ils_wording: f.ils_wording,
    collect_collaboration: f.collect_collaboration,
    collect_participation: f.collect_participation,
    collect_peers: f.collect_peers,
    peer_options: f.peer_options.map((o) => ({ ...o })),
    max_peer_picks: f.max_peer_picks,
    extra_questions: f.extra_questions.map((q) => ({ ...q, options: [...q.options] })),
    allow_new_students: f.allow_new_students,
    closes_at: f.closes_at,
  };
}

function sameSettings(a: FormSettings, b: FormSettings): boolean {
  return SETTING_KEYS.every((k) => JSON.stringify(a[k]) === JSON.stringify(b[k]));
}

function rand(n = 6): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let s = "";
  for (let i = 0; i < n; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const KIND_LABELS: Record<FormQuestionKind, string> = {
  short_text: "Short text",
  long_text: "Long text",
  single_choice: "Single choice",
  multi_choice: "Multiple choice",
  scale: "Scale",
  number: "Number",
};

const RELATION_LABELS: Record<FormRelationType, string> = {
  friend: "Friend",
  study_partner: "Study partner",
  neutral: "Neutral",
  conflict: "Conflict / avoid",
};

const WORDING_LABELS: Record<string, string> = {
  rdf: "ClassIQ Algorithms wording (from RDF survey)",
  standard: "Standard Felder–Soloman ILS wording",
};

const fieldCls = "w-full px-3 py-2 rounded-lg text-sm outline-none bg-white";
const fieldStyle = { border: `1px solid ${BRAND.inputBorder}` };

function Card({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
      <h2 className="text-lg font-bold" style={{ color: BRAND.textHeading }}>
        {title}
      </h2>
      {hint && (
        <p className="text-sm mt-1 mb-4" style={{ color: BRAND.textMuted }}>
          {hint}
        </p>
      )}
      {!hint && <div className="h-3" />}
      {children}
    </section>
  );
}

function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="block text-xs font-medium mb-1" style={{ color: BRAND.textMuted }}>
      {children}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  help,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  help?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 py-1.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 accent-teal-600"
      />
      <span>
        <span className="text-sm font-medium" style={{ color: BRAND.text }}>
          {label}
        </span>
        {help && (
          <span className="block text-xs" style={{ color: BRAND.textMuted }}>
            {help}
          </span>
        )}
      </span>
    </label>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 break-words">
      {children}
    </div>
  );
}

function PillButton({
  children,
  onClick,
  disabled,
  variant = "solid",
  danger,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  variant?: "solid" | "outline";
  danger?: boolean;
}) {
  const color = danger ? "#DC2626" : BRAND.teal;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold disabled:opacity-50"
      style={
        variant === "solid"
          ? { backgroundColor: color, color: "#fff" }
          : { border: `1px solid ${color}`, color, backgroundColor: "#fff" }
      }
    >
      {children}
    </button>
  );
}

export default function FormBuilder({
  initialForm,
  meta,
  scope,
}: {
  initialForm: SurveyFormShape;
  meta: FormMeta;
  scope: BuilderScope;
}) {
  const router = useRouter();
  const [form, setForm] = useState(initialForm);
  const [s, setS] = useState<FormSettings>(() => pickSettings(initialForm));
  const [saved, setSaved] = useState<FormSettings>(() => pickSettings(initialForm));
  const [tab, setTab] = useState<"build" | "submissions">("build");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"code" | "delete" | null>(null);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => "",
  );

  const dirty = !sameSettings(s, saved);
  const link = `${origin}/survey/${form.code}`;
  const standardAvailable = meta.wordings.includes("standard");

  const patch = useCallback(<K extends keyof FormSettings>(key: K, value: FormSettings[K]) => {
    setS((prev) => ({ ...prev, [key]: value }));
    setNotice(null);
  }, []);

  function adopt(next: SurveyFormShape, resetSettings: boolean) {
    setForm(next);
    if (resetSettings) {
      const fresh = pickSettings(next);
      setS(fresh);
      setSaved(fresh);
    }
  }

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    setNotice(null);
    try {
      return await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      return undefined;
    } finally {
      setBusy(null);
    }
  }

  async function save() {
    const body: Partial<FormSettings> = {};
    for (const k of SETTING_KEYS) (body as Record<string, unknown>)[k] = s[k];
    const next = await run("save", () => updateForm(form.id, body));
    if (next) {
      adopt(next, true);
      setNotice("Saved.");
    }
  }

  async function setStatus(status: FormStatus) {
    if (dirty) {
      setError("Save your changes before changing the status.");
      return;
    }
    const next = await run("status", () => updateForm(form.id, { status }));
    if (next) {
      adopt(next, false);
      setNotice(
        status === "open"
          ? "The form is open for responses."
          : status === "closed"
            ? "The form is closed."
            : "The form is back to draft.",
      );
    }
  }

  async function newCode() {
    setConfirm(null);
    const next = await run("code", () => regenerateFormCode(form.id));
    if (next) {
      adopt(next, false);
      setNotice("New code issued. The old link no longer works.");
    }
  }

  async function remove() {
    setConfirm(null);
    const ok = await run("delete", async () => {
      await deleteForm(form.id);
      return true;
    });
    if (ok) {
      router.push("/forms");
      router.refresh();
    }
  }

  const [copied, setCopied] = useState<"code" | "link" | null>(null);
  async function copy(what: "code" | "link") {
    try {
      await navigator.clipboard.writeText(what === "code" ? form.code : link);
      setCopied(what);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      setError("Could not copy automatically. Select the text and copy it manually.");
    }
  }

  // peers
  function setPeersEnabled(on: boolean) {
    setS((prev) => ({
      ...prev,
      collect_peers: on,
      peer_options:
        on && prev.peer_options.length === 0
          ? meta.default_peer_options.map((o) => ({ ...o }))
          : prev.peer_options,
      max_peer_picks: on && prev.max_peer_picks === 0 ? 5 : prev.max_peer_picks,
    }));
    setNotice(null);
  }
  function updatePeer(i: number, change: Partial<FormPeerOption>) {
    patch(
      "peer_options",
      s.peer_options.map((o, idx) => (idx === i ? { ...o, ...change } : o)),
    );
  }
  function addPeer() {
    patch("peer_options", [
      ...s.peer_options,
      { key: `r_${rand()}`, label: "", base_type: "neutral", strength: 3 },
    ]);
  }

  // extra questions
  function updateQ(i: number, change: Partial<FormExtraQuestion>) {
    patch(
      "extra_questions",
      s.extra_questions.map((q, idx) => (idx === i ? { ...q, ...change } : q)),
    );
  }
  function addQ() {
    patch("extra_questions", [
      ...s.extra_questions,
      { id: `q_${rand()}`, prompt: "", kind: "short_text", options: [], required: false, scale_max: 5 },
    ]);
  }
  function moveQ(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= s.extra_questions.length) return;
    const copyQs = [...s.extra_questions];
    [copyQs[i], copyQs[j]] = [copyQs[j]!, copyQs[i]!];
    patch("extra_questions", copyQs);
  }

  const sectionsForScope = scope.sections;

  return (
    <div className="p-4 sm:p-8 max-w-4xl">
      <Link href="/forms" className="inline-flex items-center gap-1 text-sm mb-3" style={{ color: BRAND.teal }}>
        <ArrowLeft size={14} /> All forms
      </Link>

      <div className="flex flex-wrap items-center gap-3 mb-1">
        <h1 className="text-3xl font-extrabold tracking-tight break-words min-w-0" style={{ color: BRAND.textHeading }}>
          {form.title}
        </h1>
        <StatusBadge status={form.status} />
      </div>
      <p className="text-sm mb-5" style={{ color: BRAND.textMuted }}>
        {form.submission_count} response{form.submission_count === 1 ? "" : "s"} · created{" "}
        {new Date(form.created_at).toLocaleDateString()}
      </p>

      <div className="flex gap-2 mb-5" role="tablist">
        {(["build", "submissions"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className="px-4 py-2 rounded-full text-sm font-semibold"
            style={{
              backgroundColor: tab === t ? BRAND.teal : "#fff",
              color: tab === t ? "#fff" : BRAND.teal,
              border: `1px solid ${BRAND.teal}`,
            }}
          >
            {t === "build" ? "Builder" : `Submissions (${form.submission_count})`}
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {notice && (
        <div className="mb-4 text-sm text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
          {notice}
        </div>
      )}

      {tab === "submissions" ? (
        <SubmissionsTab form={form} onChanged={(count) => setForm((f) => ({ ...f, submission_count: count }))} />
      ) : (
        <div className="space-y-5">
          {/* Share + status */}
          <Card
            title="Share"
            hint={
              form.status === "open"
                ? "Students can open this survey now with the code or link."
                : form.status === "draft"
                  ? "Draft: students cannot open this yet. Open the form for responses when it is ready."
                  : "Closed: students can no longer open this survey."
            }
          >
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span
                className="font-mono font-extrabold text-4xl tracking-[0.25em] px-4 py-2 rounded-2xl"
                style={{ backgroundColor: BRAND.tealLight, color: BRAND.tealDark }}
              >
                {form.code}
              </span>
              <PillButton variant="outline" onClick={() => copy("code")}>
                {copied === "code" ? <Check size={14} /> : <Copy size={14} />} Copy code
              </PillButton>
            </div>
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <input
                readOnly
                value={link}
                aria-label="Survey link"
                onFocus={(e) => e.currentTarget.select()}
                className={`${fieldCls} flex-1 min-w-[12rem] font-mono`}
                style={fieldStyle}
              />
              <PillButton variant="outline" onClick={() => copy("link")}>
                {copied === "link" ? <Check size={14} /> : <Copy size={14} />} Copy link
              </PillButton>
            </div>
            <div className="flex flex-wrap gap-2">
              {form.status !== "open" && (
                <PillButton onClick={() => setStatus("open")} disabled={busy !== null}>
                  Open for responses
                </PillButton>
              )}
              {form.status === "open" && (
                <PillButton onClick={() => setStatus("closed")} disabled={busy !== null}>
                  Close
                </PillButton>
              )}
              {form.status !== "draft" && (
                <PillButton variant="outline" onClick={() => setStatus("draft")} disabled={busy !== null}>
                  Back to draft
                </PillButton>
              )}
              <PillButton variant="outline" onClick={() => setConfirm("code")} disabled={busy !== null}>
                <RefreshCw size={14} /> Issue new code
              </PillButton>
            </div>
          </Card>

          {/* Basics */}
          <Card title="Basics">
            <div className="space-y-4">
              <div>
                <Label htmlFor="f-title">Title</Label>
                <input
                  id="f-title"
                  value={s.title}
                  maxLength={200}
                  onChange={(e) => patch("title", e.target.value)}
                  className={fieldCls}
                  style={fieldStyle}
                />
              </div>
              <div>
                <Label htmlFor="f-desc">Description (shown to students)</Label>
                <textarea
                  id="f-desc"
                  rows={3}
                  maxLength={4000}
                  value={s.description ?? ""}
                  onChange={(e) => patch("description", e.target.value || null)}
                  className={fieldCls}
                  style={fieldStyle}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <Label htmlFor="f-dept">Department</Label>
                  <Select
                    id="f-dept"
                    value={s.department_id ?? ""}
                    onChange={(v) => patch("department_id", v || null)}
                    options={[
                      { value: "", label: "Whole institution" },
                      ...scope.departments.map((d) => ({
                        value: d.id,
                        label: `${d.name} (${d.code})`,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <Label htmlFor="f-section">Section</Label>
                  <Select
                    id="f-section"
                    value={s.section_id ?? ""}
                    onChange={(v) => patch("section_id", v || null)}
                    options={[
                      { value: "", label: "Any section" },
                      ...sectionsForScope.map((x) => ({
                        value: x.id,
                        label: `${x.course_code ? `${x.course_code} · ` : ""}${x.label}`,
                      })),
                    ]}
                  />
                </div>
                <div>
                  <Label htmlFor="f-term">Academic term</Label>
                  <Select
                    id="f-term"
                    value={s.academic_term_id ?? ""}
                    onChange={(v) => patch("academic_term_id", v || null)}
                    options={[
                      { value: "", label: "No specific term" },
                      ...scope.terms.map((t) => ({
                        value: t.id,
                        label: `${t.name}${t.is_active ? " (active)" : ""}`,
                      })),
                    ]}
                  />
                </div>
              </div>
              <p className="text-xs" style={{ color: BRAND.textMuted }}>
                Scope decides which students can be matched and which classmates are listed.
                Leave all three empty to allow anyone in your institution.
              </p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="f-close">Close automatically at (optional)</Label>
                  <input
                    id="f-close"
                    type="datetime-local"
                    value={toLocalInput(s.closes_at)}
                    onChange={(e) =>
                      patch("closes_at", e.target.value ? new Date(e.target.value).toISOString() : null)
                    }
                    className={fieldCls}
                    style={fieldStyle}
                  />
                </div>
                <div className="self-end">
                  <Toggle
                    checked={s.allow_new_students}
                    onChange={(v) => patch("allow_new_students", v)}
                    label="Allow students not on the roster"
                    help="They enter their full name and a new student record is created."
                  />
                </div>
              </div>
            </div>
          </Card>

          {/* Learning styles */}
          <Card title="Learning styles">
            <Toggle
              checked={s.include_ils}
              onChange={(v) => patch("include_ils", v)}
              label="Include the 44 learning-style questions (FSLSM)"
              help="Students answer A or B on each. Scores are computed on submit."
            />
            {s.include_ils && (
              <div className="mt-3 max-w-md">
                <Label htmlFor="f-wording">Question wording</Label>
                <Select
                  id="f-wording"
                  value={s.ils_wording}
                  onChange={(v) => patch("ils_wording", v as "rdf" | "standard")}
                  options={[
                    { value: "rdf", label: WORDING_LABELS.rdf },
                    {
                      value: "standard",
                      label: `${WORDING_LABELS.standard}${standardAvailable ? "" : " (not installed)"}`,
                      disabled: !standardAvailable,
                    },
                  ]}
                />
                {!standardAvailable && (
                  <p className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
                    The standard wording is licensed text and must be installed on the server
                    (<code>backend/app/ingestion/ils_standard_stems.json</code>) before it can be selected.
                  </p>
                )}
              </div>
            )}
          </Card>

          {/* Profiling */}
          <Card
            title="Profiling"
            hint="Collaboration preference and participation level feed the compatibility score. Custom questions are stored and shown in submissions but are not scored."
          >
            <Toggle
              checked={s.collect_collaboration}
              onChange={(v) => patch("collect_collaboration", v)}
              label="Ask collaboration preference (solo / pair / group)"
            />
            <Toggle
              checked={s.collect_participation}
              onChange={(v) => patch("collect_participation", v)}
              label="Ask participation level (low / medium / high)"
            />
          </Card>

          {/* Classmate relations */}
          <Card
            title="Classmate relations"
            hint="Students pick classmates and say how they relate. The base type is what the social-graph score uses (friend and study partner help, conflict hurts); the label is just what students see. Strength is 1 (weak) to 5 (strong)."
          >
            <Toggle
              checked={s.collect_peers}
              onChange={setPeersEnabled}
              label="Ask students about their classmates"
            />
            {s.collect_peers && (
              <div className="mt-3 space-y-4">
                <div className="max-w-xs">
                  <Label htmlFor="f-maxpeers">Max classmates per student</Label>
                  <input
                    id="f-maxpeers"
                    type="number"
                    min={1}
                    max={30}
                    value={s.max_peer_picks}
                    onChange={(e) =>
                      patch("max_peer_picks", Math.max(0, Math.min(30, Number(e.target.value) || 0)))
                    }
                    className={fieldCls}
                    style={fieldStyle}
                  />
                </div>
                <div className="space-y-3">
                  {s.peer_options.map((o, i) => (
                    <div
                      key={o.key}
                      className="grid gap-2 sm:grid-cols-[1fr_11rem_6rem_auto] items-end rounded-2xl p-3"
                      style={{ backgroundColor: BRAND.mintSoft, border: `1px solid ${BRAND.cardBorder}` }}
                    >
                      <div>
                        <Label htmlFor={`po-l-${o.key}`}>Label</Label>
                        <input
                          id={`po-l-${o.key}`}
                          value={o.label}
                          maxLength={60}
                          onChange={(e) => updatePeer(i, { label: e.target.value })}
                          className={fieldCls}
                          style={fieldStyle}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`po-t-${o.key}`}>Base type</Label>
                        <Select
                          id={`po-t-${o.key}`}
                          value={o.base_type}
                          onChange={(v) => updatePeer(i, { base_type: v as FormRelationType })}
                          options={(meta.relationship_types.length
                            ? (meta.relationship_types as FormRelationType[])
                            : (Object.keys(RELATION_LABELS) as FormRelationType[])
                          ).map((t) => ({ value: t, label: RELATION_LABELS[t] ?? t }))}
                        />
                      </div>
                      <div>
                        <Label htmlFor={`po-s-${o.key}`}>Strength</Label>
                        <Select
                          id={`po-s-${o.key}`}
                          value={String(o.strength)}
                          onChange={(v) => updatePeer(i, { strength: Number(v) })}
                          options={[1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: String(n) }))}
                        />
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove relation option ${o.label || i + 1}`}
                        onClick={() =>
                          patch(
                            "peer_options",
                            s.peer_options.filter((_, idx) => idx !== i),
                          )
                        }
                        className="p-2 rounded-lg hover:bg-red-50 justify-self-start"
                        style={{ color: "#DC2626" }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <PillButton
                  variant="outline"
                  onClick={addPeer}
                  disabled={s.peer_options.length >= meta.max_peer_options}
                >
                  <Plus size={14} /> Add relation option
                </PillButton>
              </div>
            )}
          </Card>

          {/* Extra questions */}
          <Card
            title="Extra questions"
            hint="Add your own questions after the standard ones. Answers appear in the Submissions tab."
          >
            <div className="space-y-4">
              {s.extra_questions.map((q, i) => (
                <div
                  key={q.id}
                  className="rounded-2xl p-4 space-y-3"
                  style={{ backgroundColor: BRAND.mintSoft, border: `1px solid ${BRAND.cardBorder}` }}
                >
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold mt-2.5" style={{ color: BRAND.textMuted }}>
                      {i + 1}.
                    </span>
                    <div className="flex-1 min-w-0">
                      <Label htmlFor={`q-p-${q.id}`}>Question</Label>
                      <input
                        id={`q-p-${q.id}`}
                        value={q.prompt}
                        maxLength={500}
                        onChange={(e) => updateQ(i, { prompt: e.target.value })}
                        className={fieldCls}
                        style={fieldStyle}
                      />
                    </div>
                    <div className="flex gap-1 mt-5 shrink-0">
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={i === 0}
                        onClick={() => moveQ(i, -1)}
                        className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30"
                      >
                        <ArrowUp size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={i === s.extra_questions.length - 1}
                        onClick={() => moveQ(i, 1)}
                        className="p-1.5 rounded-lg hover:bg-white disabled:opacity-30"
                      >
                        <ArrowDown size={16} />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove question"
                        onClick={() =>
                          patch(
                            "extra_questions",
                            s.extra_questions.filter((_, idx) => idx !== i),
                          )
                        }
                        className="p-1.5 rounded-lg hover:bg-red-50"
                        style={{ color: "#DC2626" }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3 items-end">
                    <div>
                      <Label htmlFor={`q-k-${q.id}`}>Type</Label>
                      <Select
                        id={`q-k-${q.id}`}
                        value={q.kind}
                        onChange={(v) => {
                          const kind = v as FormQuestionKind;
                          const isChoice = kind === "single_choice" || kind === "multi_choice";
                          updateQ(i, {
                            kind,
                            options: isChoice ? (q.options.length ? q.options : ["", ""]) : [],
                          });
                        }}
                        options={(Object.keys(KIND_LABELS) as FormQuestionKind[]).map((k) => ({
                          value: k,
                          label: KIND_LABELS[k],
                        }))}
                      />
                    </div>
                    {q.kind === "scale" && (
                      <div>
                        <Label htmlFor={`q-m-${q.id}`}>Scale 1 to</Label>
                        <Select
                          id={`q-m-${q.id}`}
                          value={String(q.scale_max)}
                          onChange={(v) => updateQ(i, { scale_max: Number(v) })}
                          options={[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
                            value: String(n),
                            label: String(n),
                          }))}
                        />
                      </div>
                    )}
                    <Toggle
                      checked={q.required}
                      onChange={(v) => updateQ(i, { required: v })}
                      label="Required"
                    />
                  </div>
                  {(q.kind === "single_choice" || q.kind === "multi_choice") && (
                    <div className="space-y-2">
                      <Label>Options (at least two, all different)</Label>
                      {q.options.map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <input
                            aria-label={`Option ${oi + 1}`}
                            value={opt}
                            maxLength={200}
                            onChange={(e) =>
                              updateQ(i, {
                                options: q.options.map((x, xi) => (xi === oi ? e.target.value : x)),
                              })
                            }
                            className={fieldCls}
                            style={fieldStyle}
                          />
                          <button
                            type="button"
                            aria-label={`Remove option ${oi + 1}`}
                            onClick={() => updateQ(i, { options: q.options.filter((_, xi) => xi !== oi) })}
                            className="p-2 rounded-lg hover:bg-red-50 shrink-0"
                            style={{ color: "#DC2626" }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                      <PillButton
                        variant="outline"
                        onClick={() => updateQ(i, { options: [...q.options, ""] })}
                        disabled={q.options.length >= 20}
                      >
                        <Plus size={14} /> Add option
                      </PillButton>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <PillButton
                variant="outline"
                onClick={addQ}
                disabled={s.extra_questions.length >= meta.max_extra_questions}
              >
                <Plus size={14} /> Add question
              </PillButton>
            </div>
          </Card>

          {/* Save bar */}
          <div
            className="sticky bottom-0 -mx-1 px-4 py-3 rounded-2xl flex flex-wrap items-center gap-3 shadow-lg"
            style={{ backgroundColor: "#fff", border: `1px solid ${BRAND.cardBorder}` }}
          >
            <PillButton onClick={save} disabled={!dirty || busy !== null || !s.title.trim()}>
              {busy === "save" ? "Saving…" : "Save changes"}
            </PillButton>
            {dirty && (
              <>
                <PillButton variant="outline" onClick={() => setS(saved)} disabled={busy !== null}>
                  Discard
                </PillButton>
                <span className="text-xs" style={{ color: BRAND.textMuted }}>
                  Unsaved changes
                </span>
              </>
            )}
            <span className="flex-1" />
            <PillButton variant="outline" danger onClick={() => setConfirm("delete")} disabled={busy !== null}>
              <Trash2 size={14} /> Delete form
            </PillButton>
          </div>
        </div>
      )}

      <Modal isOpen={confirm === "code"} onClose={() => setConfirm(null)} title="Issue a new code?" size="sm">
        <p className="text-sm mb-5" style={{ color: BRAND.text }}>
          The current code <strong className="font-mono">{form.code}</strong> and its link will stop
          working immediately. Anyone you already shared it with will need the new one.
        </p>
        <div className="flex gap-2 justify-end">
          <PillButton variant="outline" onClick={() => setConfirm(null)}>
            Cancel
          </PillButton>
          <PillButton onClick={newCode}>Issue new code</PillButton>
        </div>
      </Modal>
      <Modal isOpen={confirm === "delete"} onClose={() => setConfirm(null)} title="Delete this form?" size="sm">
        <p className="text-sm mb-5" style={{ color: BRAND.text }}>
          “{form.title}” and its link will be removed. Students can no longer open it.
        </p>
        <div className="flex gap-2 justify-end">
          <PillButton variant="outline" onClick={() => setConfirm(null)}>
            Cancel
          </PillButton>
          <PillButton danger onClick={remove}>
            Delete
          </PillButton>
        </div>
      </Modal>
    </div>
  );
}

// Submissions

const AXIS_SHORT: [string, string][] = [
  ["active_reflective", "AR"],
  ["sensing_intuitive", "SI"],
  ["visual_verbal", "VV"],
  ["sequential_global", "SG"],
];

function fmtAnswer(v: unknown): string {
  if (Array.isArray(v)) return v.join(", ");
  if (v === null || v === undefined) return "";
  return String(v);
}

function SubmissionsTab({
  form,
  onChanged,
}: {
  form: SurveyFormShape;
  onChanged: (count: number) => void;
}) {
  const [rows, setRows] = useState<FormSubmissionShape[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [toVoid, setToVoid] = useState<FormSubmissionShape | null>(null);
  const [voiding, setVoiding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listFormSubmissions(form.id)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not load submissions.");
      });
    return () => {
      cancelled = true;
    };
  }, [form.id]);

  async function doVoid() {
    if (!toVoid) return;
    setVoiding(true);
    setError(null);
    try {
      await voidFormSubmission(form.id, toVoid.id);
      const now = new Date().toISOString();
      const next = (rows ?? []).map((r) => (r.id === toVoid.id ? { ...r, voided_at: now } : r));
      setRows(next);
      onChanged(next.filter((r) => !r.voided_at).length);
      setToVoid(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not void the submission.");
      setToVoid(null);
    } finally {
      setVoiding(false);
    }
  }

  const prompts = new Map(form.extra_questions.map((q) => [q.id, q.prompt]));

  return (
    <div className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
      {error && (
        <div className="mb-4">
          <ErrorBox>{error}</ErrorBox>
        </div>
      )}
      {rows === null && !error && (
        <p className="text-sm" style={{ color: BRAND.textMuted }}>
          Loading submissions…
        </p>
      )}
      {rows && rows.length === 0 && (
        <p className="text-sm" style={{ color: BRAND.textMuted }}>
          No one has answered yet.
        </p>
      )}
      {rows && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide" style={{ color: BRAND.textMuted }}>
                <th className="py-2 pr-4 font-semibold">Student</th>
                <th className="py-2 pr-4 font-semibold">ID</th>
                <th className="py-2 pr-4 font-semibold">Submitted</th>
                <th className="py-2 pr-4 font-semibold" title="Active/Reflective, Sensing/Intuitive, Visual/Verbal, Sequential/Global (+ = first pole)">
                  FSLSM
                </th>
                <th className="py-2 pr-4 font-semibold">Profile</th>
                <th className="py-2 pr-4 font-semibold text-right">Peers</th>
                <th className="py-2 pr-4 font-semibold">Extra</th>
                <th className="py-2 pr-4 font-semibold">Status</th>
                <th className="py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const extraKeys = Object.keys(r.extra_answers);
                const open = expanded === r.id;
                return (
                  <tr
                    key={r.id}
                    className={`border-t align-top ${r.voided_at ? "opacity-60" : ""}`}
                    style={{ borderColor: BRAND.cardBorder }}
                  >
                    <td className="py-2 pr-4 font-medium">{r.student_name}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.student_external_id ?? "—"}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">{new Date(r.submitted_at).toLocaleString()}</td>
                    <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap">
                      {r.fslsm
                        ? AXIS_SHORT.map(([k, short]) => {
                            const v = r.fslsm?.[k];
                            return (
                              <span key={k} className="mr-2">
                                {short} {v !== undefined && v > 0 ? "+" : ""}
                                {v ?? "?"}
                              </span>
                            );
                          })
                        : "—"}
                    </td>
                    <td className="py-2 pr-4 text-xs">
                      {Object.entries(r.profile).length === 0
                        ? "—"
                        : Object.entries(r.profile).map(([k, v]) => (
                            <div key={k}>
                              <span style={{ color: BRAND.textMuted }}>{k.replace(/_/g, " ")}:</span> {fmtAnswer(v)}
                            </div>
                          ))}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.peers.length}</td>
                    <td className="py-2 pr-4 text-xs">
                      {extraKeys.length === 0 ? (
                        "—"
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpanded(open ? null : r.id)}
                            className="font-semibold"
                            style={{ color: BRAND.teal }}
                            aria-expanded={open}
                          >
                            {open ? "Hide" : `${extraKeys.length} answer${extraKeys.length === 1 ? "" : "s"}`}
                          </button>
                          {open && (
                            <dl className="mt-1 space-y-1 min-w-[12rem]">
                              {extraKeys.map((k) => (
                                <div key={k}>
                                  <dt style={{ color: BRAND.textMuted }}>{prompts.get(k) ?? k}</dt>
                                  <dd className="break-words">{fmtAnswer(r.extra_answers[k])}</dd>
                                </div>
                              ))}
                            </dl>
                          )}
                        </>
                      )}
                    </td>
                    <td className="py-2 pr-4">
                      {r.voided_at ? (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-100 text-rose-800">
                          Voided
                        </span>
                      ) : (
                        <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                          Counted
                        </span>
                      )}
                    </td>
                    <td className="py-2">
                      {!r.voided_at && (
                        <button
                          type="button"
                          onClick={() => setToVoid(r)}
                          className="px-3 py-1 rounded-full text-xs font-semibold border"
                          style={{ borderColor: "#DC2626", color: "#DC2626" }}
                        >
                          Void
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal isOpen={toVoid !== null} onClose={() => !voiding && setToVoid(null)} title="Void this submission?" size="sm">
        <p className="text-sm mb-5" style={{ color: BRAND.text }}>
          This removes the learning-style profile and classmate relations created from{" "}
          <strong>{toVoid?.student_name}</strong>&apos;s answers, and lets them answer the survey again.
        </p>
        <div className="flex gap-2 justify-end">
          <PillButton variant="outline" onClick={() => setToVoid(null)} disabled={voiding}>
            Cancel
          </PillButton>
          <PillButton danger onClick={doVoid} disabled={voiding}>
            {voiding ? "Voiding…" : "Void submission"}
          </PillButton>
        </div>
      </Modal>
    </div>
  );
}

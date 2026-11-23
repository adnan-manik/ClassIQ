"use client";

import FslsmBars from "@/components/FslsmBars";
import { SurveyError, fetchPublicForm, identifyStudent, submitSurvey } from "@/lib/surveyApi";
import type {
  FormExtraQuestion,
  PublicForm,
  PublicIdentifyResponse,
} from "@/lib/types";
import { AlertCircle, CheckCircle2, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

const TEAL = "var(--brand-teal)";
const PAGE_SIZE = 11;
type Choice = "A" | "B";
type Collab = "solo" | "pair" | "group";
type Level = "low" | "medium" | "high";
type Phase = "loading" | "unavailable" | "identify" | "answer" | "done";

type Step =
  | { kind: "ils"; page: number }
  | { kind: "profile" }
  | { kind: "peers" }
  | { kind: "extra" };

const inputCls = "w-full h-12 px-4 border rounded-2xl outline-none text-base bg-white";
const inputStyle = { borderColor: "var(--brand-input)" };

function Alert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4 break-words"
    >
      <AlertCircle size={16} className="shrink-0 mt-0.5" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}

function PrimaryButton({
  children,
  disabled,
  type = "button",
  onClick,
}: {
  children: ReactNode;
  disabled?: boolean;
  type?: "button" | "submit";
  onClick?: () => void;
}) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className="flex-1 h-12 rounded-full text-white text-sm font-semibold tracking-wider uppercase transition hover:opacity-90 disabled:opacity-50"
      style={{ backgroundColor: TEAL }}
    >
      {children}
    </button>
  );
}

function GhostButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-12 px-5 rounded-full text-sm font-semibold border bg-white"
      style={{ borderColor: TEAL, color: TEAL }}
    >
      {children}
    </button>
  );
}

export default function SurveyFlow({ code }: { code: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [form, setForm] = useState<PublicForm | null>(null);
  const [loadError, setLoadError] = useState<{ status: number; message: string } | null>(null);

  // identity
  const [externalId, setExternalId] = useState("");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [ident, setIdent] = useState<PublicIdentifyResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // answers
  const [stepIdx, setStepIdx] = useState(0);
  const [ils, setIls] = useState<Record<number, Choice>>({});
  const [collab, setCollab] = useState<Collab | null>(null);
  const [level, setLevel] = useState<Level | null>(null);
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [extra, setExtra] = useState<Record<string, unknown>>({});
  const [result, setResult] = useState<{ fslsm: Record<string, number> | null } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPublicForm(code)
      .then((f) => {
        if (cancelled) return;
        setForm(f);
        setPhase("identify");
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoadError({
          status: e instanceof SurveyError ? e.status : 0,
          message: e instanceof Error ? e.message : "Could not load the survey.",
        });
        setPhase("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const steps = useMemo<Step[]>(() => {
    if (!form) return [];
    const out: Step[] = [];
    if (form.include_ils && form.questions.length > 0) {
      const pages = Math.ceil(form.questions.length / PAGE_SIZE);
      for (let p = 0; p < pages; p++) out.push({ kind: "ils", page: p });
    }
    if (form.collect_collaboration || form.collect_participation) out.push({ kind: "profile" });
    if (form.collect_peers && form.peer_options.length > 0 && form.max_peer_picks > 0) {
      out.push({ kind: "peers" });
    }
    if (form.extra_questions.length > 0) out.push({ kind: "extra" });
    return out;
  }, [form]);

  function scrollTop() {
    topRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  // identify
  async function onIdentify(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setBusy(true);
    try {
      const res = await identifyStudent(code, {
        external_id: externalId.trim() || null,
        email: email.trim() || null,
        full_name: form.allow_new_students ? fullName.trim() || null : null,
      });
      setIdent(res);
      if (!res.already_submitted) {
        setStepIdx(0);
        setPhase("answer");
      }
    } catch (err) {
      setError(friendly(err, "identify"));
    } finally {
      setBusy(false);
    }
  }

  // validation
  function stepProblem(s: Step | undefined): string | null {
    if (!form || !s) return null;
    if (s.kind === "ils") {
      const qs = form.questions.slice(s.page * PAGE_SIZE, (s.page + 1) * PAGE_SIZE);
      const missing = qs.filter((q) => !ils[q.sequence_no]).length;
      return missing ? `Please answer all questions on this page (${missing} left).` : null;
    }
    if (s.kind === "profile") {
      if (form.collect_collaboration && !collab) return "Choose how you prefer to work.";
      if (form.collect_participation && !level) return "Choose your usual participation level.";
      return null;
    }
    if (s.kind === "peers") return null;
    for (const q of form.extra_questions) {
      if (q.required && isBlank(extra[q.id])) return `Please answer: ${q.prompt}`;
    }
    return null;
  }

  const step = steps[stepIdx];
  const problem = stepProblem(step);
  const isLast = stepIdx === steps.length - 1;

  async function onSubmit() {
    if (!form) return;
    setError(null);
    setBusy(true);
    try {
      const peers = Object.entries(picks).flatMap(([id, opts]) =>
        opts.map((option) => ({ student_id: id, option })),
      );
      const res = await submitSurvey(code, {
        external_id: externalId.trim() || null,
        email: email.trim() || null,
        full_name: form.allow_new_students ? fullName.trim() || null : null,
        answers: form.include_ils ? ils : {},
        collaboration_pref: form.collect_collaboration ? collab : null,
        participation_level: form.collect_participation ? level : null,
        peers,
        extra_answers: cleanExtras(form.extra_questions, extra),
      });
      setResult({ fslsm: res.fslsm });
      setPhase("done");
      scrollTop();
    } catch (err) {
      if (err instanceof SurveyError && err.status === 409) {
        setIdent((p) =>
          p
            ? { ...p, already_submitted: true }
            : { student_name: "", new_student: false, already_submitted: true, classmates: [] },
        );
        setPhase("identify");
        setError(null);
      } else {
        setError(friendly(err, "submit"));
      }
    } finally {
      setBusy(false);
    }
  }

  function next() {
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);
    if (isLast) void onSubmit();
    else {
      setStepIdx((i) => i + 1);
      scrollTop();
    }
  }

  function back() {
    setError(null);
    if (stepIdx === 0) setPhase("identify");
    else setStepIdx((i) => i - 1);
    scrollTop();
  }

  // render
  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-slate-600" role="status">
        <Loader2 className="animate-spin" size={18} /> Loading survey…
      </div>
    );
  }

  if (phase === "unavailable" || !form) {
    const missing = loadError?.status === 404;
    return (
      <div className="text-center py-4">
        <AlertCircle className="mx-auto mb-3 text-red-500" size={36} />
        <h1 className="text-xl font-bold mb-2" style={{ color: TEAL }}>
          {missing ? "Survey not available" : "Could not load the survey"}
        </h1>
        <p className="text-sm text-slate-600 mb-6 break-words">
          {missing
            ? "This code isn't valid, or the survey is closed. Check the code with your teacher."
            : (loadError?.message ?? "Please try again.")}
        </p>
        <Link
          href="/survey"
          className="inline-block h-12 leading-[3rem] px-8 rounded-full text-white text-sm font-semibold"
          style={{ backgroundColor: TEAL }}
        >
          Enter a different code
        </Link>
      </div>
    );
  }

  if (phase === "done") {
    return (
      <div ref={topRef}>
        <div className="text-center mb-5">
          <CheckCircle2 className="mx-auto mb-3" size={44} style={{ color: TEAL }} />
          <h1 className="text-2xl font-bold" style={{ color: TEAL }}>
            Thank you{ident?.student_name ? `, ${firstName(ident.student_name)}` : ""}!
          </h1>
          <p className="text-sm text-slate-600 mt-1">Your answers were submitted.</p>
        </div>
        {result?.fslsm && (
          <div className="rounded-2xl p-4" style={{ backgroundColor: "var(--brand-mint-soft)" }}>
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--brand-teal-dark)" }}>
              Your learning style
            </h2>
            <p className="text-xs text-slate-600 mb-3">
              Scores run from −11 to +11. A positive score leans toward the left label
              (active, sensing, visual, sequential); a negative score toward the right
              (reflective, intuitive, verbal, global). Everyone has a mix.
            </p>
            <FslsmBars
              active_reflective_score={result.fslsm.active_reflective ?? 0}
              sensing_intuitive_score={result.fslsm.sensing_intuitive ?? 0}
              visual_verbal_score={result.fslsm.visual_verbal ?? 0}
              sequential_global_score={result.fslsm.sequential_global ?? 0}
            />
          </div>
        )}
        <p className="text-xs text-slate-500 text-center mt-5">You can close this page now.</p>
      </div>
    );
  }

  const header = (
    <div ref={topRef} className="mb-5 scroll-mt-4">
      <p className="text-xs uppercase tracking-wide text-slate-500 break-words">
        {form.institution_name}
      </p>
      <h1 className="text-2xl font-bold break-words" style={{ color: TEAL }}>
        {form.title}
      </h1>
      {form.description && (
        <p className="text-sm text-slate-600 mt-1 whitespace-pre-wrap break-words">
          {form.description}
        </p>
      )}
      {form.closes_at && (
        <p className="text-xs text-slate-500 mt-1">
          Closes {new Date(form.closes_at).toLocaleString()}
        </p>
      )}
    </div>
  );

  if (phase === "identify") {
    if (ident?.already_submitted) {
      return (
        <div>
          {header}
          <div className="rounded-2xl p-5 text-center bg-slate-50">
            <CheckCircle2 className="mx-auto mb-2" size={32} style={{ color: TEAL }} />
            <p className="font-semibold text-slate-800">You have already answered this survey.</p>
            <p className="text-sm text-slate-600 mt-1">
              Thanks{ident.student_name ? `, ${firstName(ident.student_name)}` : ""}! If you
              made a mistake, ask your teacher to reset your response.
            </p>
          </div>
        </div>
      );
    }
    return (
      <div>
        {header}
        <form onSubmit={onIdentify} className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-slate-800">First, who are you?</h2>
          <p className="text-sm text-slate-600 -mt-2">
            Use the student ID and email your institution has on file.
          </p>
          {error && <Alert>{error}</Alert>}
          <Field id="sid" label="Student ID">
            <input
              id="sid"
              required
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              autoComplete="off"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          <Field id="semail" label="Email">
            <input
              id="semail"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className={inputCls}
              style={inputStyle}
            />
          </Field>
          {form.allow_new_students && (
            <Field id="sname" label="Full name (if you are new to this class list)">
              <input
                id="sname"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                className={inputCls}
                style={inputStyle}
              />
            </Field>
          )}
          <div className="flex">
            <PrimaryButton type="submit" disabled={busy || !externalId.trim() || !email.trim()}>
              {busy ? "Checking…" : "Continue"}
            </PrimaryButton>
          </div>
        </form>
      </div>
    );
  }

  if (!step) {
    return (
      <div>
        {header}
        <p className="text-sm text-slate-600 mb-4">This survey has no questions yet.</p>
      </div>
    );
  }
  const progress = Math.round(((stepIdx + 1) / steps.length) * 100);

  return (
    <div>
      {header}
      <div className="mb-5">
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>
            Step {stepIdx + 1} of {steps.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div
          className="h-2 rounded-full overflow-hidden bg-slate-100"
          role="progressbar"
          aria-valuenow={progress}
          aria-valuemin={0}
          aria-valuemax={100}
        >
          <div className="h-full transition-all" style={{ width: `${progress}%`, backgroundColor: TEAL }} />
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      {step.kind === "ils" && (
        <IlsStep
          form={form}
          page={step.page}
          answers={ils}
          onPick={(n, c) => setIls((p) => ({ ...p, [n]: c }))}
        />
      )}
      {step.kind === "profile" && (
        <ProfileStep
          form={form}
          collab={collab}
          level={level}
          onCollab={setCollab}
          onLevel={setLevel}
        />
      )}
      {step.kind === "peers" && ident && (
        <PeersStep form={form} classmates={ident.classmates} picks={picks} onChange={setPicks} />
      )}
      {step.kind === "extra" && (
        <div className="flex flex-col gap-6">
          {form.extra_questions.map((q) => (
            <ExtraField
              key={q.id}
              q={q}
              value={extra[q.id]}
              onChange={(v) => setExtra((p) => ({ ...p, [q.id]: v }))}
            />
          ))}
        </div>
      )}

      <div className="flex gap-3 mt-7">
        <GhostButton onClick={back}>Back</GhostButton>
        <PrimaryButton onClick={next} disabled={busy}>
          {busy ? "Submitting…" : isLast ? "Submit" : "Next"}
        </PrimaryButton>
      </div>
    </div>
  );
}

// helpers

function firstName(n: string) {
  return n.trim().split(/\s+/)[0] ?? n;
}

function isBlank(v: unknown) {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function cleanExtras(questions: FormExtraQuestion[], extra: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const q of questions) {
    const v = extra[q.id];
    if (!isBlank(v)) out[q.id] = v;
  }
  return out;
}

function friendly(err: unknown, where: "identify" | "submit"): string {
  if (err instanceof SurveyError) {
    if (err.status === 404) return "This survey is no longer available. It may have been closed.";
    if (err.status === 403)
      return where === "identify"
        ? "We couldn't match that student ID and email. Check them and try again."
        : "We couldn't verify your identity. Go back and check your student ID and email.";
    if (err.status === 409) return "You have already answered this survey.";
    if (err.status === 413) return "Your answers are too large to send. Shorten long answers and retry.";
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-slate-600">
        {label}
      </label>
      {children}
    </div>
  );
}

function ChoiceCard({
  selected,
  onClick,
  children,
  role = "radio",
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  role?: "radio" | "checkbox";
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={selected}
      onClick={onClick}
      className="w-full text-left px-4 py-3 rounded-2xl border text-sm break-words transition min-h-12"
      style={{
        borderColor: selected ? TEAL : "#E2E8F0",
        backgroundColor: selected ? "var(--brand-mint)" : "#fff",
        boxShadow: selected ? `0 0 0 1px ${TEAL}` : undefined,
      }}
    >
      {children}
    </button>
  );
}

function IlsStep({
  form,
  page,
  answers,
  onPick,
}: {
  form: PublicForm;
  page: number;
  answers: Record<number, Choice>;
  onPick: (n: number, c: Choice) => void;
}) {
  const qs = form.questions.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const answered = Object.keys(answers).length;
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-base font-semibold text-slate-800">How do you learn?</h2>
        <p className="text-sm text-slate-600">
          Pick the answer that fits you more often. {answered} of {form.questions.length} answered.
        </p>
      </div>
      {qs.map((q) => (
        <div key={q.sequence_no} role="radiogroup" aria-label={`Question ${q.sequence_no}`}>
          <p className="text-sm font-medium text-slate-800 mb-2 break-words">
            {q.sequence_no}. {q.prompt}
          </p>
          <div className="flex flex-col gap-2">
            {(["A", "B"] as const).map((c) => (
              <ChoiceCard
                key={c}
                selected={answers[q.sequence_no] === c}
                onClick={() => onPick(q.sequence_no, c)}
              >
                <span className="font-semibold mr-2" style={{ color: TEAL }}>
                  {c}
                </span>
                {c === "A" ? q.answer_a : q.answer_b}
              </ChoiceCard>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProfileStep({
  form,
  collab,
  level,
  onCollab,
  onLevel,
}: {
  form: PublicForm;
  collab: Collab | null;
  level: Level | null;
  onCollab: (c: Collab) => void;
  onLevel: (l: Level) => void;
}) {
  return (
    <div className="flex flex-col gap-7">
      {form.collect_collaboration && (
        <div role="radiogroup" aria-label="Collaboration preference">
          <h2 className="text-base font-semibold text-slate-800 mb-2">
            How do you prefer to work on tasks?
          </h2>
          <div className="flex flex-col gap-2">
            {(
              [
                ["solo", "On my own"],
                ["pair", "With one partner"],
                ["group", "In a group"],
              ] as const
            ).map(([v, label]) => (
              <ChoiceCard key={v} selected={collab === v} onClick={() => onCollab(v)}>
                {label}
              </ChoiceCard>
            ))}
          </div>
        </div>
      )}
      {form.collect_participation && (
        <div role="radiogroup" aria-label="Participation level">
          <h2 className="text-base font-semibold text-slate-800 mb-2">
            How much do you usually take part in class?
          </h2>
          <div className="flex flex-col gap-2">
            {(
              [
                ["low", "Low: I mostly listen"],
                ["medium", "Medium: I join in sometimes"],
                ["high", "High: I often speak up"],
              ] as const
            ).map(([v, label]) => (
              <ChoiceCard key={v} selected={level === v} onClick={() => onLevel(v)}>
                {label}
              </ChoiceCard>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PeersStep({
  form,
  classmates,
  picks,
  onChange,
}: {
  form: PublicForm;
  classmates: { id: string; name: string }[];
  picks: Record<string, string[]>;
  onChange: (p: Record<string, string[]>) => void;
}) {
  const [q, setQ] = useState("");
  const picked = Object.keys(picks).length;
  const atLimit = picked >= form.max_peer_picks;
  const shown = classmates.filter((c) => c.name.toLowerCase().includes(q.trim().toLowerCase()));

  function toggle(id: string, key: string) {
    const cur = picks[id] ?? [];
    const nextOpts = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
    const copy = { ...picks };
    if (nextOpts.length === 0) delete copy[id];
    else copy[id] = nextOpts;
    onChange(copy);
  }

  return (
    <div>
      <h2 className="text-base font-semibold text-slate-800">Your classmates</h2>
      <p className="text-sm text-slate-600 mb-3">
        Optional. Choose up to {form.max_peer_picks} classmates and say how you relate to each
        (you can pick more than one label). {picked} of {form.max_peer_picks} chosen.
      </p>
      {classmates.length === 0 ? (
        <p className="text-sm text-slate-500 rounded-2xl bg-slate-50 p-4">
          No classmates are listed for this survey, so you can skip this step.
        </p>
      ) : (
        <>
          <div className="relative mb-3">
            <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name"
              aria-label="Search classmates"
              className={`${inputCls} pl-10`}
              style={inputStyle}
            />
          </div>
          <ul className="flex flex-col gap-2 max-h-[28rem] overflow-y-auto pr-1">
            {shown.map((c) => {
              const chosen = picks[c.id] ?? [];
              const isPicked = chosen.length > 0;
              const locked = !isPicked && atLimit;
              return (
                <li
                  key={c.id}
                  className="rounded-2xl border p-3"
                  style={{ borderColor: isPicked ? TEAL : "#E2E8F0" }}
                >
                  <p className="text-sm font-medium text-slate-800 mb-2 break-words">{c.name}</p>
                  <div className="flex flex-wrap gap-2">
                    {form.peer_options.map((o) => {
                      const on = chosen.includes(o.key);
                      return (
                        <button
                          key={o.key}
                          type="button"
                          role="checkbox"
                          aria-checked={on}
                          disabled={locked}
                          onClick={() => toggle(c.id, o.key)}
                          className="px-3 h-9 rounded-full text-xs font-semibold border disabled:opacity-40"
                          style={{
                            borderColor: TEAL,
                            backgroundColor: on ? TEAL : "#fff",
                            color: on ? "#fff" : TEAL,
                          }}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </li>
              );
            })}
            {shown.length === 0 && (
              <li className="text-sm text-slate-500 p-3">No classmates match this search.</li>
            )}
          </ul>
          {atLimit && (
            <p className="text-xs text-slate-500 mt-2">
              You have reached the limit. Remove a classmate&apos;s labels to pick someone else.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ExtraField({
  q,
  value,
  onChange,
}: {
  q: FormExtraQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `x-${q.id}`;
  const label = (
    <span className="text-sm font-medium text-slate-800 break-words">
      {q.prompt}
      {q.required && (
        <span className="text-red-600 ml-1" aria-label="required">
          *
        </span>
      )}
    </span>
  );

  if (q.kind === "short_text" || q.kind === "long_text") {
    const long = q.kind === "long_text";
    const max = long ? 4000 : 500;
    const str = typeof value === "string" ? value : "";
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id}>{label}</label>
        {long ? (
          <textarea
            id={id}
            value={str}
            maxLength={max}
            rows={4}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-4 py-3 border rounded-2xl outline-none text-base bg-white"
            style={inputStyle}
          />
        ) : (
          <input
            id={id}
            value={str}
            maxLength={max}
            onChange={(e) => onChange(e.target.value)}
            className={inputCls}
            style={inputStyle}
          />
        )}
      </div>
    );
  }
  if (q.kind === "number") {
    return (
      <div className="flex flex-col gap-2">
        <label htmlFor={id}>{label}</label>
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={typeof value === "number" ? value : ""}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
          className={inputCls}
          style={inputStyle}
        />
      </div>
    );
  }
  if (q.kind === "scale") {
    return (
      <div role="radiogroup" aria-label={q.prompt}>
        <div className="mb-2">{label}</div>
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: q.scale_max }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              onClick={() => onChange(n)}
              className="h-11 w-11 rounded-full border text-sm font-semibold"
              style={{
                borderColor: TEAL,
                backgroundColor: value === n ? TEAL : "#fff",
                color: value === n ? "#fff" : TEAL,
              }}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="flex justify-between text-[11px] text-slate-500 mt-1">
          <span>1 = lowest</span>
          <span>{q.scale_max} = highest</span>
        </div>
      </div>
    );
  }
  const multi = q.kind === "multi_choice";
  const chosen = multi ? ((Array.isArray(value) ? value : []) as string[]) : [];
  return (
    <div role={multi ? "group" : "radiogroup"} aria-label={q.prompt}>
      <div className="mb-2">{label}</div>
      <div className="flex flex-col gap-2">
        {q.options.map((o) => {
          const sel = multi ? chosen.includes(o) : value === o;
          return (
            <ChoiceCard
              key={o}
              role={multi ? "checkbox" : "radio"}
              selected={sel}
              onClick={() =>
                multi
                  ? onChange(sel ? chosen.filter((x) => x !== o) : [...chosen, o])
                  : onChange(o)
              }
            >
              {o}
            </ChoiceCard>
          );
        })}
      </div>
      {multi && <p className="text-xs text-slate-500 mt-1">Select all that apply.</p>}
    </div>
  );
}

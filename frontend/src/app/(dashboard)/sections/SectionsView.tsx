"use client";

import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import ScoreRing from "@/components/ScoreRing";
import { createSection, simulateSection, updateSection } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import {
  ArrowRightLeft,
  ChevronRight,
  GitBranchPlus,
  Play,
  Plus,
  Users,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

interface SectionCard {
  id: string;
  label: string;
  state: string;
  courseCode: string;
  courseName: string;
  teacherId: string | null;
  teacher: {
    full_name: string;
    email: string;
    teaching_style: string;
    interaction_level: string;
    pacing: string;
    approach: string | null;
  } | null;
  students: {
    id: string;
    full_name: string;
    external_id: string | null;
    dominant: string | null;
    collab: string | null;
    participation: string | null;
  }[];
  sim: {
    score: number;
    outcome: string;
    social: string;
    recommended_teacher: string | null;
  } | null;
}

interface TeacherOpt {
  id: string;
  full_name: string;
}
interface CourseOpt {
  id: string;
  code: string;
  name: string;
}
interface TermOpt {
  id: string;
  name: string;
  is_active: boolean;
}
interface StudentOpt {
  id: string;
  full_name: string;
  external_id: string | null;
}

export default function SectionsView({
  sections,
  teachers,
  courses,
  terms,
  students,
}: {
  sections: SectionCard[];
  teachers: TeacherOpt[];
  courses: CourseOpt[];
  terms: TermOpt[];
  students: StudentOpt[];
}) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = sections.find((s) => s.id === selectedId) ?? null;
  const [running, setRunning] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  // Run-all
  const [bulkRunning, setBulkRunning] = useState(false);
  const [bulkMsg, setBulkMsg] = useState<string | null>(null);

  // New-section modal
  const [newOpen, setNewOpen] = useState(false);

  // Change-teacher (inline in the detail panel)
  const [changingTeacher, setChangingTeacher] = useState(false);
  const [savingTeacher, setSavingTeacher] = useState(false);
  const [teacherError, setTeacherError] = useState<string | null>(null);

  const simulatable = sections.filter((s) => s.students.length > 0);

  async function handleRunSimulation(sectionId: string) {
    setRunError(null);
    setRunning(sectionId);
    try {
      await simulateSection(sectionId);
      router.refresh();
    } catch (err) {
      setRunError(err instanceof Error ? err.message : "Simulation failed");
    } finally {
      setRunning(null);
    }
  }

  async function handleRunAll() {
    setBulkMsg(null);
    setRunError(null);
    if (simulatable.length === 0) {
      setBulkMsg("No sections with enrolled students to simulate.");
      return;
    }
    setBulkRunning(true);
    let ok = 0;
    const failures: string[] = [];
    for (const sec of simulatable) {
      try {
        await simulateSection(sec.id);
        ok += 1;
      } catch (err) {
        failures.push(
          `${sec.courseCode} ${sec.label}: ${
            err instanceof Error ? err.message : "failed"
          }`,
        );
      }
    }
    setBulkRunning(false);
    setBulkMsg(
      failures.length === 0
        ? `Simulated ${ok} section${ok === 1 ? "" : "s"}.`
        : `Simulated ${ok}; ${failures.length} failed — ${failures[0]}`,
    );
    router.refresh();
  }

  async function handleChangeTeacher(sectionId: string, teacherId: string) {
    setTeacherError(null);
    setSavingTeacher(true);
    try {
      await updateSection(sectionId, {
        teacher_id: teacherId === "" ? null : teacherId,
      });
      setChangingTeacher(false);
      router.refresh();
    } catch (err) {
      setTeacherError(
        err instanceof Error ? err.message : "Could not update teacher",
      );
    } finally {
      setSavingTeacher(false);
    }
  }

  return (
    <>
      {/* ── Toolbar ──────────────────────────────────────────────── */}
      <div className="flex items-center justify-end gap-2 flex-wrap">
        {bulkMsg && (
          <span className="text-xs mr-auto" style={{ color: BRAND.textMuted }}>
            {bulkMsg}
          </span>
        )}
        <button
          type="button"
          onClick={handleRunAll}
          disabled={bulkRunning || simulatable.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          style={{ backgroundColor: BRAND.purple }}
        >
          <Play size={14} />
          {bulkRunning
            ? "Running…"
            : `Run Simulation${
                simulatable.length ? ` (${simulatable.length})` : ""
              }`}
        </button>
        <button
          type="button"
          onClick={() => setNewOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: BRAND.teal }}
        >
          <Plus size={16} /> New Section
        </button>
      </div>

      {sections.length === 0 ? (
        <EmptyState
          icon={GitBranchPlus}
          title="No sections yet"
          description="Create your first section to start assigning teachers and students."
          action={
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: BRAND.teal }}
            >
              <Plus size={16} /> New Section
            </button>
          }
        />
      ) : (
        <>
          {/* ── Overview cards ───────────────────────────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sections.map((sec) => {
              const isOpen = selectedId === sec.id;
              return (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(isOpen ? null : sec.id);
                    setChangingTeacher(false);
                    setTeacherError(null);
                  }}
                  className="text-left rounded-2xl bg-white p-5 transition hover:shadow-md cursor-pointer"
                  style={{
                    border: `1px solid ${isOpen ? BRAND.teal : BRAND.cardBorder}`,
                    boxShadow: isOpen ? `0 0 0 3px ${BRAND.tealLight}` : undefined,
                  }}
                >
                  <div className="flex items-start gap-4">
                    <ScoreRing score={sec.sim?.score ?? 0} size={72} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span
                          className="font-bold text-base truncate"
                          style={{ color: BRAND.textHeading }}
                        >
                          {sec.courseCode} &mdash; Section {sec.label}
                        </span>
                        <Badge text={sec.state} />
                      </div>
                      <div
                        className="text-xs truncate mb-1"
                        style={{ color: BRAND.textMuted }}
                      >
                        {sec.courseName}
                      </div>
                      <div
                        className="flex items-center gap-3 text-xs"
                        style={{ color: BRAND.textMuted }}
                      >
                        <span className="truncate">
                          {sec.teacher?.full_name ?? "Unassigned"}
                        </span>
                        <span className="flex items-center gap-1">
                          <Users size={12} />
                          {sec.students.length}
                        </span>
                      </div>
                    </div>
                  </div>

                  {sec.sim && (
                    <div className="flex gap-1.5 mt-3 flex-wrap">
                      <Badge text={`Outcome: ${sec.sim.outcome}`} />
                      <Badge text={sec.sim.social} />
                    </div>
                  )}

                  <div
                    className="mt-3 pt-3 flex items-center justify-between text-xs font-semibold"
                    style={{
                      color: isOpen ? BRAND.teal : BRAND.textMuted,
                      borderTop: `1px dashed ${BRAND.cardBorder}`,
                    }}
                  >
                    <span>{isOpen ? "Hide details" : "View details"}</span>
                    <ChevronRight
                      size={14}
                      style={{
                        transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                        transition: "transform 0.2s",
                      }}
                    />
                  </div>
                </button>
              );
            })}
          </div>

          {/* ── Expanded detail ─────────────────────────────────── */}
          {selected && (
            <div
              className="rounded-2xl bg-white p-6 md:p-8 space-y-6"
              style={{ border: `2px solid ${BRAND.teal}` }}
            >
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2
                      className="text-2xl font-extrabold tracking-tight"
                      style={{ color: BRAND.textHeading }}
                    >
                      {selected.courseCode} &mdash; Section {selected.label}
                    </h2>
                    <Badge text={selected.state} />
                  </div>
                  <p className="text-sm" style={{ color: BRAND.textMuted }}>
                    {selected.courseName}
                  </p>
                </div>
                <div className="flex items-center gap-4">
                  <button
                    type="button"
                    onClick={() => handleRunSimulation(selected.id)}
                    disabled={
                      running === selected.id || selected.students.length === 0
                    }
                    title={
                      selected.students.length === 0
                        ? "Enrol students before simulating"
                        : undefined
                    }
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: BRAND.purple }}
                  >
                    <Play size={14} />
                    {running === selected.id ? "Running…" : "Run Simulation"}
                  </button>
                  {selected.sim && (
                    <ScoreRing
                      score={selected.sim.score}
                      size={88}
                      label="Compatibility"
                    />
                  )}
                </div>
              </div>

              {runError && (
                <div
                  className="text-sm rounded-xl px-4 py-3"
                  style={{
                    backgroundColor: "#FEE2E2",
                    color: "#991B1B",
                    border: "1px solid #FECACA",
                  }}
                >
                  {runError}
                </div>
              )}

              {selected.sim && (
                <div
                  className="rounded-xl p-4 flex items-center gap-3 flex-wrap"
                  style={{ backgroundColor: BRAND.mintSoft }}
                >
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: BRAND.textMuted }}
                    >
                      Last Simulation Run
                    </div>
                    <div className="text-sm mt-0.5" style={{ color: BRAND.text }}>
                      Score <strong>{selected.sim.score}</strong> &middot; predicted{" "}
                      <strong>{selected.sim.outcome}</strong> outcome with{" "}
                      <strong>{selected.sim.social}</strong> social graph impact
                      {selected.sim.recommended_teacher &&
                        selected.sim.recommended_teacher !==
                          selected.teacher?.full_name && (
                          <>
                            {" · "}engine recommends{" "}
                            <strong>{selected.sim.recommended_teacher}</strong>
                          </>
                        )}
                      .
                    </div>
                  </div>
                </div>
              )}

              {/* Teacher detail + change */}
              <div
                className="rounded-xl p-4"
                style={{ backgroundColor: BRAND.subtleBg }}
              >
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <div className="min-w-0">
                    <div
                      className="text-xs font-semibold uppercase tracking-wider"
                      style={{ color: BRAND.textMuted }}
                    >
                      Assigned Teacher
                    </div>
                    <div
                      className="font-bold mt-0.5"
                      style={{ color: BRAND.textHeading }}
                    >
                      {selected.teacher?.full_name ?? "Unassigned"}
                    </div>
                  </div>
                  {!changingTeacher && (
                    <button
                      type="button"
                      onClick={() => {
                        setChangingTeacher(true);
                        setTeacherError(null);
                      }}
                      className="flex items-center gap-1 text-sm font-medium"
                      style={{ color: BRAND.teal }}
                    >
                      <ArrowRightLeft size={14} /> Change
                    </button>
                  )}
                </div>

                {changingTeacher && (
                  <div className="flex items-end gap-2 flex-wrap mb-3">
                    <label className="flex-1 min-w-[200px]">
                      <div
                        className="text-[10px] uppercase tracking-wider mb-1"
                        style={{ color: BRAND.textMuted }}
                      >
                        Reassign to
                      </div>
                      <select
                        defaultValue={selected.teacherId ?? ""}
                        disabled={savingTeacher}
                        onChange={(e) =>
                          handleChangeTeacher(selected.id, e.target.value)
                        }
                        className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
                        style={{
                          border: `1px solid ${BRAND.inputBorder}`,
                          color: BRAND.text,
                        }}
                      >
                        <option value="">— Unassigned —</option>
                        {teachers.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.full_name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setChangingTeacher(false);
                        setTeacherError(null);
                      }}
                      disabled={savingTeacher}
                      className="py-2 px-3 rounded-lg text-sm"
                      style={{ color: BRAND.textMuted }}
                    >
                      Cancel
                    </button>
                  </div>
                )}
                {teacherError && (
                  <div
                    className="text-xs rounded px-3 py-1 mb-2"
                    style={{ backgroundColor: "#FEE2E2", color: "#991B1B" }}
                  >
                    {teacherError}
                  </div>
                )}

                {selected.teacher && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-3">
                    <DetailField
                      label="Teaching Style"
                      value={selected.teacher.teaching_style}
                    />
                    <DetailField
                      label="Interaction Level"
                      value={selected.teacher.interaction_level}
                    />
                    <DetailField label="Pacing" value={selected.teacher.pacing} />
                  </div>
                )}
              </div>

              {/* Students */}
              <div>
                <h3
                  className="text-sm font-semibold mb-3"
                  style={{ color: BRAND.textMuted }}
                >
                  Enrolled Students ({selected.students.length})
                </h3>
                <div
                  className="rounded-xl overflow-hidden"
                  style={{ border: `1px solid ${BRAND.cardBorder}` }}
                >
                  <table className="w-full text-sm">
                    <thead style={{ backgroundColor: BRAND.subtleBg }}>
                      <tr>
                        <Th>Name</Th>
                        <Th className="hidden sm:table-cell">ID</Th>
                        <Th>Dominant Style</Th>
                        <Th className="hidden md:table-cell">Collaboration</Th>
                        <Th className="hidden md:table-cell">Participation</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.students.map((s) => (
                        <tr
                          key={s.id}
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
                            {s.dominant && <Badge text={s.dominant} />}
                          </td>
                          <td
                            className="px-4 py-2.5 capitalize hidden md:table-cell"
                            style={{ color: BRAND.textMuted }}
                          >
                            {s.collab ?? "—"}
                          </td>
                          <td
                            className="px-4 py-2.5 capitalize hidden md:table-cell"
                            style={{ color: BRAND.textMuted }}
                          >
                            {s.participation ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {newOpen && (
        <NewSectionModal
          courses={courses}
          terms={terms}
          teachers={teachers}
          students={students}
          onClose={() => setNewOpen(false)}
          onCreated={() => {
            setNewOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

function NewSectionModal({
  courses,
  terms,
  teachers,
  students,
  onClose,
  onCreated,
}: {
  courses: CourseOpt[];
  terms: TermOpt[];
  teachers: TeacherOpt[];
  students: StudentOpt[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [termId, setTermId] = useState(
    terms.find((t) => t.is_active)?.id ?? terms[0]?.id ?? "",
  );
  const [teacherId, setTeacherId] = useState("");
  const [label, setLabel] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function toggleStudent(id: string) {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit() {
    setError(null);
    if (!courseId || !termId || !label.trim()) {
      setError("Course, term, and label are required.");
      return;
    }
    setSaving(true);
    try {
      await createSection({
        course_id: courseId,
        academic_term_id: termId,
        label: label.trim(),
        teacher_id: teacherId || null,
        student_ids: Array.from(picked),
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create section");
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-auto"
        style={{ border: `2px solid ${BRAND.teal}` }}
      >
        <div className="flex items-start justify-between mb-4">
          <h2
            className="text-xl font-extrabold tracking-tight"
            style={{ color: BRAND.textHeading }}
          >
            New Section
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700"
          >
            <X size={20} />
          </button>
        </div>

        {courses.length === 0 || terms.length === 0 ? (
          <p className="text-sm" style={{ color: BRAND.textMuted }}>
            You need at least one course and one academic term before creating a
            section. Ask your admin to add them.
          </p>
        ) : (
          <div className="space-y-3">
            <SelectField label="Course" value={courseId} onChange={setCourseId}>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.name}
                </option>
              ))}
            </SelectField>

            <SelectField label="Academic term" value={termId} onChange={setTermId}>
              {terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.is_active ? " (active)" : ""}
                </option>
              ))}
            </SelectField>

            <label className="block">
              <div
                className="text-xs uppercase font-semibold mb-1"
                style={{ color: BRAND.textMuted }}
              >
                Section label
              </div>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="A"
                className="w-full px-3 py-2 rounded-lg text-sm outline-none"
                style={{
                  border: `1px solid ${BRAND.inputBorder}`,
                  color: BRAND.text,
                }}
              />
            </label>

            <SelectField
              label="Teacher (optional)"
              value={teacherId}
              onChange={setTeacherId}
            >
              <option value="">— Unassigned —</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </SelectField>

            <div>
              <div
                className="text-xs uppercase font-semibold mb-1 flex items-center justify-between"
                style={{ color: BRAND.textMuted }}
              >
                <span>Students ({picked.size} selected)</span>
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
                  {students.map((s) => (
                    <label
                      key={s.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer hover:bg-slate-50 text-sm"
                      style={{ color: BRAND.text }}
                    >
                      <input
                        type="checkbox"
                        checked={picked.has(s.id)}
                        onChange={() => toggleStudent(s.id)}
                      />
                      <span className="truncate">{s.full_name}</span>
                      {s.external_id && (
                        <span
                          className="ml-auto font-mono text-[11px]"
                          style={{ color: BRAND.textMuted }}
                        >
                          {s.external_id}
                        </span>
                      )}
                    </label>
                  ))}
                </div>
              )}
            </div>

            {error && (
              <div
                className="text-sm rounded-lg px-3 py-2"
                style={{
                  backgroundColor: "#FEE2E2",
                  color: "#991B1B",
                  border: "1px solid #FECACA",
                }}
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
                onClick={handleSubmit}
                disabled={saving}
                className="flex-1 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
                style={{ backgroundColor: BRAND.teal }}
              >
                {saving ? "Creating…" : "Create section"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div
        className="text-xs uppercase font-semibold mb-1"
        style={{ color: BRAND.textMuted }}
      >
        {label}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
        style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
      >
        {children}
      </select>
    </label>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`text-left px-4 py-2 font-medium ${className}`}
      style={{ color: BRAND.textMuted }}
    >
      {children}
    </th>
  );
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <div
      className="bg-white rounded-lg p-3"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      <div
        className="text-[10px] uppercase tracking-wider"
        style={{ color: BRAND.textMuted }}
      >
        {label}
      </div>
      <div
        className="text-sm font-semibold capitalize mt-0.5"
        style={{ color: BRAND.text }}
      >
        {value}
      </div>
    </div>
  );
}

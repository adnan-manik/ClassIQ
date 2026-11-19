"use client";

import { useEffect, useId, useState, type ReactNode } from "react";
import Modal from "./Modal";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/client";
import type { DepartmentOption } from "@/lib/types";

interface CreateStudentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  /** Departments the current user may place a student in. */
  departments: DepartmentOption[];
  /** True for HoDs: they must pick one of their assigned departments. */
  restrictedToAssigned?: boolean;
  /** Existing values, offered as suggestions so spellings stay consistent. */
  programSuggestions?: string[];
  batchSuggestions?: string[];
}

const SEMESTERS = Array.from({ length: 12 }, (_, i) => i + 1);

const EMPTY = {
  fullName: "",
  email: "",
  studentId: "",
  departmentId: "",
  program: "",
  batch: "",
  semester: "",
};

export default function CreateStudentModal({
  isOpen,
  onClose,
  onSuccess,
  departments,
  restrictedToAssigned = false,
  programSuggestions = [],
  batchSuggestions = [],
}: CreateStudentModalProps) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const programListId = useId();
  const batchListId = useId();

  // Preselect when there's only one department to choose from (e.g. an HoD).
  useEffect(() => {
    if (isOpen && departments.length === 1) {
      setForm((f) => (f.departmentId ? f : { ...f, departmentId: departments[0].id }));
    }
  }, [isOpen, departments]);

  const set =
    (key: keyof typeof EMPTY) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session) {
        setError("Not authenticated");
        return;
      }

      const response = await fetch("/api/institution/users", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          role: "student",
          full_name: form.fullName.trim(),
          email: form.email.trim(),
          external_id: form.studentId.trim() || null,
          department_id: form.departmentId || null,
          program: form.program.trim() || null,
          batch: form.batch.trim() || null,
          current_semester: form.semester ? Number(form.semester) : null,
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(formatApiError(data?.detail) ?? "Failed to create student");
      }

      setForm(EMPTY);
      onSuccess?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  const noDepartments = departments.length === 0;
  // An HoD with no assigned department would get a 403 from the API.
  const blocked = restrictedToAssigned && noDepartments;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create Student" size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        {blocked && (
          <div
            className="rounded-lg p-4 text-sm"
            style={{
              backgroundColor: "#FEF3C7",
              color: "#92400E",
              border: "1px solid #FDE68A",
            }}
          >
            You aren&apos;t assigned to a department yet. Ask an institution
            admin to assign you one (Admin → Departments) before adding
            students.
          </div>
        )}

        {error && (
          <div
            className="rounded-lg p-4 text-sm"
            style={{
              backgroundColor: "#FEE2E2",
              color: "#991B1B",
              border: "1px solid #FECACA",
            }}
          >
            {error}
          </div>
        )}

        <SectionHeading>Personal details</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="fullName" label="Full Name" required className="sm:col-span-2">
            <input
              type="text"
              id="fullName"
              value={form.fullName}
              onChange={set("fullName")}
              placeholder="John Doe"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              required
              disabled={loading}
            />
          </Field>
          <Field id="email" label="Email" required>
            <input
              type="email"
              id="email"
              value={form.email}
              onChange={set("email")}
              placeholder="john@example.com"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              required
              disabled={loading}
            />
          </Field>
          <Field id="studentId" label="Student ID / Roll No.">
            <input
              type="text"
              id="studentId"
              value={form.studentId}
              onChange={set("studentId")}
              placeholder="SP26-BSCS-0001"
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              disabled={loading}
            />
          </Field>
        </div>

        <SectionHeading>Academic placement</SectionHeading>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field id="department" label="Department" required={!noDepartments} className="sm:col-span-2">
            <select
              id="department"
              value={form.departmentId}
              onChange={set("departmentId")}
              className={`${INPUT_CLASS} bg-white`}
              style={INPUT_STYLE}
              required={!noDepartments}
              disabled={loading || noDepartments}
            >
              <option value="">
                {noDepartments ? "No departments available" : "Select a department…"}
              </option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.code} · {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field id="program" label="Program">
            <input
              type="text"
              id="program"
              list={programListId}
              value={form.program}
              onChange={set("program")}
              placeholder="BS Computer Science"
              maxLength={80}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              disabled={loading}
            />
            <datalist id={programListId}>
              {programSuggestions.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </Field>
          <Field id="batch" label="Batch / Intake">
            <input
              type="text"
              id="batch"
              list={batchListId}
              value={form.batch}
              onChange={set("batch")}
              placeholder="Spring 2026"
              maxLength={40}
              className={INPUT_CLASS}
              style={INPUT_STYLE}
              disabled={loading}
            />
            <datalist id={batchListId}>
              {batchSuggestions.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
          </Field>
          <Field id="semester" label="Current Semester">
            <select
              id="semester"
              value={form.semester}
              onChange={set("semester")}
              className={`${INPUT_CLASS} bg-white`}
              style={INPUT_STYLE}
              disabled={loading}
            >
              <option value="">Not set</option>
              {SEMESTERS.map((n) => (
                <option key={n} value={n}>
                  Semester {n}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex gap-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg font-semibold transition border"
            style={{
              borderColor: BRAND.cardBorder,
              color: BRAND.text,
            }}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="flex-1 px-4 py-2 rounded-lg font-semibold text-white transition disabled:opacity-60"
            style={{ backgroundColor: BRAND.teal }}
            disabled={loading || blocked}
          >
            {loading ? "Creating..." : "Create Student"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

// ─── helpers ──────────────────────────────────────────────────────────────

const INPUT_CLASS =
  "w-full px-4 py-2 rounded-lg border outline-none transition focus:border-teal-600 disabled:opacity-60";
const INPUT_STYLE = { borderColor: BRAND.cardBorder, color: BRAND.text };

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3
      className="text-xs uppercase font-bold tracking-wide"
      style={{ color: BRAND.textMuted }}
    >
      {children}
    </h3>
  );
}

function Field({
  id,
  label,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className="block text-sm font-semibold mb-2"
        style={{ color: BRAND.textHeading }}
      >
        {label}
        {required ? (
          <span style={{ color: BRAND.coral }}> *</span>
        ) : (
          <span className="font-normal" style={{ color: BRAND.textMuted }}>
            {" "}
            (optional)
          </span>
        )}
      </label>
      {children}
    </div>
  );
}

/** FastAPI returns `detail` as a string, or as a list of validation errors (422). */
function formatApiError(detail: unknown): string | null {
  if (!detail) return null;
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = Array.isArray(d?.loc) ? d.loc[d.loc.length - 1] : null;
        return field ? `${field}: ${d.msg}` : d?.msg;
      })
      .filter(Boolean)
      .join("; ");
  }
  return null;
}

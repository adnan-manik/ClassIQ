"use client";

import { createUser, type ActionResult } from "@/app/(dashboard)/admin/_actions";
import { BRAND } from "@/lib/brand";
import type { DepartmentItem } from "@/lib/types";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

const ROLES = ["institution_admin", "hod", "teacher", "student"] as const;

export default function CreateUserDialog({
  departments,
}: {
  departments: DepartmentItem[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: BRAND.teal }}
      >
        <Plus size={16} /> New User
      </button>

      {/* Mounted only while open → fresh useActionState each open. */}
      {open && <Dialog departments={departments} onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({
  departments,
  onClose,
}: {
  departments: DepartmentItem[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [role, setRole] = useState<(typeof ROLES)[number]>("teacher");
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createUser, null);

  const showPassword = mode === "password" && role !== "student";
  const showDept = role === "hod" || role === "teacher" || role === "student";
  const showMode = role !== "student";

  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      const t = setTimeout(onClose, 900);
      return () => clearTimeout(t);
    }
  }, [state, router, onClose]);

  return (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
          onClick={onClose}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
            style={{ border: `2px solid ${BRAND.teal}` }}
          >
            <div className="flex items-start justify-between mb-4">
              <h2
                className="text-xl font-extrabold tracking-tight"
                style={{ color: BRAND.textHeading }}
              >
                Create User
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

            <form action={formAction} className="space-y-3">
              <Field name="full_name" label="Full name" required />
              <Field name="email" label="Email" type="email" required />

              <div>
                <div
                  className="text-xs uppercase font-semibold mb-1.5"
                  style={{ color: BRAND.textMuted }}
                >
                  Role
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {ROLES.map((r) => (
                    <Pill
                      key={r}
                      label={r.replace("_", " ")}
                      selected={role === r}
                      onClick={() => setRole(r)}
                    />
                  ))}
                </div>
                <input type="hidden" name="role" value={role} />
              </div>

              {showDept && (
                <label className="block">
                  <div
                    className="text-xs uppercase font-semibold mb-1"
                    style={{ color: BRAND.textMuted }}
                  >
                    Department (optional)
                  </div>
                  <select
                    name="department_id"
                    className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
                    style={{
                      border: `1px solid ${BRAND.inputBorder}`,
                      color: BRAND.text,
                    }}
                  >
                    <option value="">— none —</option>
                    {departments.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.code} · {d.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {showMode && (
                <div>
                  <div
                    className="text-xs uppercase font-semibold mb-1.5"
                    style={{ color: BRAND.textMuted }}
                  >
                    Onboarding mode
                  </div>
                  <div className="flex gap-2">
                    <Pill
                      label="Send invite email"
                      selected={mode === "invite"}
                      onClick={() => setMode("invite")}
                    />
                    <Pill
                      label="Set password"
                      selected={mode === "password"}
                      onClick={() => setMode("password")}
                    />
                  </div>
                  <input type="hidden" name="mode" value={mode} />
                </div>
              )}

              {showPassword && (
                <Field
                  name="password"
                  label="Initial password (min 8 characters)"
                  type="text"
                  required
                  minLength={8}
                />
              )}

              {role === "student" && (
                <div
                  className="text-xs italic px-2 py-1.5 rounded"
                  style={{
                    backgroundColor: BRAND.subtleBg,
                    color: BRAND.textMuted,
                  }}
                >
                  Students don&apos;t need login accounts — they&apos;ll be added as a
                  roster row only.
                </div>
              )}

              {state?.error && (
                <div
                  className="text-sm rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: "#FEE2E2",
                    color: "#991B1B",
                    border: "1px solid #FECACA",
                  }}
                >
                  {state.error}
                </div>
              )}
              {state?.ok && (
                <div
                  className="text-sm rounded-lg px-3 py-2"
                  style={{
                    backgroundColor: BRAND.tealLight,
                    color: BRAND.tealDark,
                  }}
                >
                  User created.
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 py-2 rounded-full text-sm font-semibold"
                  style={{
                    backgroundColor: BRAND.subtleBg,
                    color: BRAND.text,
                  }}
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={pending}
                  className="flex-1 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
                  style={{ backgroundColor: BRAND.teal }}
                >
                  {pending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
  );
}

function Field({
  name,
  label,
  type = "text",
  required,
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  minLength?: number;
}) {
  return (
    <label className="block">
      <div
        className="text-xs uppercase font-semibold mb-1"
        style={{ color: BRAND.textMuted }}
      >
        {label}
      </div>
      <input
        name={name}
        type={type}
        required={required}
        minLength={minLength}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
      />
    </label>
  );
}

function Pill({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-3 py-1.5 rounded-full text-xs font-semibold capitalize"
      style={{
        backgroundColor: selected ? BRAND.teal : BRAND.subtleBg,
        color: selected ? "#fff" : BRAND.text,
        border: `1px solid ${selected ? BRAND.teal : BRAND.cardBorder}`,
      }}
    >
      {label}
    </button>
  );
}

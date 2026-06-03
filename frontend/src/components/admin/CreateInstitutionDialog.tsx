"use client";

import { createInstitution, type ActionResult } from "@/app/(dashboard)/admin/_actions";
import { BRAND } from "@/lib/brand";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

export default function CreateInstitutionDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: BRAND.teal }}
      >
        <Plus size={16} /> New Institution
      </button>

      {/* Mounted only while open, so useActionState resets on every open
          (no stale success/error banner, no accidental duplicate submit). */}
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createInstitution, null);

  // On success: refresh the underlying list and close shortly after so the
  // admin sees confirmation, then the new row appears.
  useEffect(() => {
    if (state?.ok) {
      router.refresh();
      const t = setTimeout(onClose, 900);
      return () => clearTimeout(t);
    }
  }, [state, router, onClose]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40"
      onClick={onClose}
    >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl"
            style={{ border: `2px solid ${BRAND.teal}` }}
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2
                  className="text-xl font-extrabold tracking-tight"
                  style={{ color: BRAND.textHeading }}
                >
                  Create Institution
                </h2>
                <p
                  className="text-xs mt-1"
                  style={{ color: BRAND.textMuted }}
                >
                  Provisions the institution + its first institution_admin user.
                </p>
              </div>
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
              <Field name="name" label="Institution name" required />
              <Field
                name="slug"
                label="URL slug (lowercase letters, digits, dashes)"
                required
                placeholder="my-university"
              />
              <Field name="admin_full_name" label="Admin full name" required />
              <Field
                name="admin_email"
                label="Admin email"
                type="email"
                required
              />

              <div>
                <div
                  className="text-xs uppercase font-semibold mb-1.5"
                  style={{ color: BRAND.textMuted }}
                >
                  Onboarding mode
                </div>
                <div className="flex gap-2">
                  <ModePill
                    label="Send invite email"
                    selected={mode === "invite"}
                    onClick={() => setMode("invite")}
                  />
                  <ModePill
                    label="Set initial password"
                    selected={mode === "password"}
                    onClick={() => setMode("password")}
                  />
                </div>
                <input type="hidden" name="mode" value={mode} />
              </div>

              {mode === "password" && (
                <Field
                  name="admin_password"
                  label="Initial password"
                  type="text"
                  minLength={8}
                  required
                />
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
                    border: `1px solid ${BRAND.teal}33`,
                  }}
                >
                  Institution created. The admin user has been{" "}
                  {mode === "invite" ? "emailed an invite" : "provisioned"}.
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
  placeholder,
  pattern,
  minLength,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  pattern?: string;
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
        placeholder={placeholder}
        pattern={pattern}
        minLength={minLength}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
      />
    </label>
  );
}

function ModePill({
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
      className="px-3 py-1.5 rounded-full text-xs font-semibold"
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

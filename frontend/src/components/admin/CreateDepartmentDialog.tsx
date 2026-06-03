"use client";

import { createDepartment, type ActionResult } from "@/app/(dashboard)/admin/_actions";
import { BRAND } from "@/lib/brand";
import { Plus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";

export default function CreateDepartmentDialog() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
        style={{ backgroundColor: BRAND.teal }}
      >
        <Plus size={16} /> New Department
      </button>

      {/* Mounted only while open → fresh useActionState each open. */}
      {open && <Dialog onClose={() => setOpen(false)} />}
    </>
  );
}

function Dialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(createDepartment, null);

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
              <h2
                className="text-xl font-extrabold tracking-tight"
                style={{ color: BRAND.textHeading }}
              >
                Create Department
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
              <Field name="name" label="Department name" required placeholder="Computer Science" />
              <Field name="code" label="Short code" required placeholder="CS" />

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
                  Department created.
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
  required,
  placeholder,
}: {
  name: string;
  label: string;
  required?: boolean;
  placeholder?: string;
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
        type="text"
        required={required}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg text-sm outline-none"
        style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
      />
    </label>
  );
}

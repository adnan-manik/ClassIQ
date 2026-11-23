"use client";

import EmptyState from "@/components/EmptyState";
import Modal from "@/components/Modal";
import { createForm } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { FormStatus, SurveyFormShape } from "@/lib/types";
import { ClipboardList, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export const STATUS_STYLE: Record<FormStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  open: "bg-emerald-100 text-emerald-800",
  closed: "bg-zinc-200 text-zinc-700",
};

export function StatusBadge({ status }: { status: FormStatus }) {
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${STATUS_STYLE[status]}`}
    >
      {status}
    </span>
  );
}

export default function FormsView({
  initialForms,
  loadError,
}: {
  initialForms: SurveyFormShape[];
  loadError: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const created = await createForm({ title: title.trim() });
      router.push(`/forms/${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the form.");
      setBusy(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
            Survey Forms
          </h1>
          <p className="text-sm mt-1 max-w-2xl" style={{ color: BRAND.textMuted }}>
            Build a shareable survey. Students open it with a code or link, no account needed,
            and their answers become learning-style profiles and classmate relations.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: BRAND.teal }}
        >
          <Plus size={16} /> New form
        </button>
      </div>

      {loadError && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
          {loadError}
        </div>
      )}

      {initialForms.length === 0 && !loadError ? (
        <EmptyState
          icon={ClipboardList}
          title="No survey forms yet"
          description="Create your first form to collect learning-style and classmate data from students."
        />
      ) : (
        <div className="rounded-3xl bg-white overflow-hidden" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide" style={{ color: BRAND.textMuted }}>
                  <th className="px-5 py-3 font-semibold">Title</th>
                  <th className="px-5 py-3 font-semibold">Code</th>
                  <th className="px-5 py-3 font-semibold">Status</th>
                  <th className="px-5 py-3 font-semibold text-right">Responses</th>
                  <th className="px-5 py-3 font-semibold">Created</th>
                </tr>
              </thead>
              <tbody>
                {initialForms.map((f) => (
                  <tr key={f.id} className="border-t" style={{ borderColor: BRAND.cardBorder }}>
                    <td className="px-5 py-3">
                      <Link
                        href={`/forms/${f.id}`}
                        className="font-semibold hover:underline"
                        style={{ color: BRAND.teal }}
                      >
                        {f.title}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono tracking-widest">{f.code}</td>
                    <td className="px-5 py-3">
                      <StatusBadge status={f.status} />
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{f.submission_count}</td>
                    <td className="px-5 py-3 whitespace-nowrap" style={{ color: BRAND.textMuted }}>
                      {new Date(f.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal isOpen={open} onClose={() => !busy && setOpen(false)} title="New survey form" size="sm">
        <form onSubmit={onCreate} className="space-y-4">
          <div>
            <label htmlFor="new-form-title" className="block text-xs font-medium mb-1" style={{ color: BRAND.textMuted }}>
              Title
            </label>
            <input
              id="new-form-title"
              autoFocus
              required
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Fall 2026 learning-style survey"
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ border: `1px solid ${BRAND.inputBorder}` }}
            />
          </div>
          {error && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
              {error}
            </div>
          )}
          <button
            type="submit"
            disabled={busy || !title.trim()}
            className="w-full py-2.5 rounded-full text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND.teal }}
          >
            {busy ? "Creating…" : "Create and open builder"}
          </button>
        </form>
      </Modal>
    </div>
  );
}

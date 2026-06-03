"use client";

import {
  importUsersCommit,
  importUsersPreview,
  type ActionResult,
} from "@/app/(dashboard)/admin/_actions";
import { BRAND } from "@/lib/brand";
import type {
  UserImportPreviewResp,
  UserImportResult,
} from "@/lib/types";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from "lucide-react";
import Papa from "papaparse";
import { useRef, useState, useTransition } from "react";

type ClientRow = {
  email: string;
  full_name: string;
  role: string;
  department_code?: string;
  password?: string;
};

const REQUIRED_HEADERS = ["email", "full_name", "role"];

export default function CsvImporter() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [clientRows, setClientRows] = useState<ClientRow[]>([]);
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const [serverPreview, setServerPreview] = useState<UserImportPreviewResp | null>(
    null,
  );
  const [serverError, setServerError] = useState<string | null>(null);
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [commitResult, setCommitResult] = useState<UserImportResult | null>(null);
  const [pending, startTransition] = useTransition();

  function handleFile(f: File | null) {
    setFile(f);
    setServerPreview(null);
    setServerError(null);
    setCommitResult(null);
    setClientRows([]);
    setClientErrors([]);
    if (!f) return;

    Papa.parse<ClientRow>(f, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const missing = REQUIRED_HEADERS.filter((h) => !headers.includes(h));
        if (missing.length > 0) {
          setClientErrors([`Missing required column(s): ${missing.join(", ")}`]);
          return;
        }
        const rows = (results.data ?? []).filter(
          (r) => r.email && r.email.trim() !== "",
        );
        setClientRows(rows);
      },
      error: (err) => setClientErrors([err.message]),
    });
  }

  function runPreview() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = (await importUsersPreview(null, fd)) as ActionResult;
      if (res.ok) {
        setServerPreview(res.data as UserImportPreviewResp);
        setServerError(null);
      } else {
        setServerError(res.error ?? "Preview failed");
      }
    });
  }

  function runCommit() {
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("mode", mode);
    startTransition(async () => {
      const res = (await importUsersCommit(null, fd)) as ActionResult;
      if (res.ok) {
        setCommitResult(res.data as UserImportResult);
        setServerError(null);
      } else {
        setServerError(res.error ?? "Commit failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* Step 1: pick file */}
      <div
        className="rounded-3xl bg-white p-6"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <h2
          className="text-lg font-extrabold mb-2"
          style={{ color: BRAND.textHeading }}
        >
          1. Pick a CSV file
        </h2>
        <p
          className="text-xs mb-4"
          style={{ color: BRAND.textMuted }}
        >
          Required columns: <code>email</code>, <code>full_name</code>, <code>role</code>.
          Optional: <code>department_code</code>, <code>password</code>. Roles:{" "}
          <code>institution_admin</code>, <code>hod</code>, <code>teacher</code>,{" "}
          <code>student</code>.
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="hidden"
            id="csv-file-input"
          />
          <label
            htmlFor="csv-file-input"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold cursor-pointer"
            style={{
              backgroundColor: BRAND.teal,
              color: "#fff",
            }}
          >
            <Upload size={16} /> Choose CSV
          </label>
          {file && (
            <span className="text-sm" style={{ color: BRAND.text }}>
              <FileSpreadsheet size={14} className="inline mr-1" />
              {file.name} · {(file.size / 1024).toFixed(1)} KB · {clientRows.length}{" "}
              rows
            </span>
          )}
        </div>

        {clientErrors.length > 0 && (
          <div
            className="mt-4 rounded-lg p-3 text-sm"
            style={{
              backgroundColor: "#FEE2E2",
              color: "#991B1B",
              border: "1px solid #FECACA",
            }}
          >
            {clientErrors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
      </div>

      {/* Step 2: preview */}
      {clientRows.length > 0 && (
        <div
          className="rounded-3xl bg-white p-6"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          <div className="flex items-center justify-between mb-3">
            <h2
              className="text-lg font-extrabold"
              style={{ color: BRAND.textHeading }}
            >
              2. Preview ({clientRows.length} rows)
            </h2>
            <button
              type="button"
              onClick={runPreview}
              disabled={pending}
              className="px-4 py-1.5 rounded-full text-xs font-semibold text-white disabled:opacity-50"
              style={{ backgroundColor: BRAND.purple }}
            >
              {pending ? "Validating…" : "Server-side validate"}
            </button>
          </div>

          <div
            className="rounded-xl overflow-auto max-h-72"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <table className="w-full text-xs">
              <thead style={{ backgroundColor: BRAND.subtleBg }}>
                <tr>
                  <th className="text-left px-3 py-2">Email</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Role</th>
                  <th className="text-left px-3 py-2">Dept</th>
                  <th className="text-left px-3 py-2">Password</th>
                </tr>
              </thead>
              <tbody>
                {clientRows.slice(0, 50).map((r, i) => (
                  <tr
                    key={i}
                    style={{ borderTop: `1px solid ${BRAND.cardBorder}33` }}
                  >
                    <td className="px-3 py-1.5 font-mono">{r.email}</td>
                    <td className="px-3 py-1.5">{r.full_name}</td>
                    <td className="px-3 py-1.5">{r.role}</td>
                    <td className="px-3 py-1.5">{r.department_code ?? "—"}</td>
                    <td className="px-3 py-1.5">{r.password ? "•••" : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {serverPreview && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div
                className="rounded-xl p-3 text-sm"
                style={{
                  backgroundColor: BRAND.tealLight,
                  color: BRAND.tealDark,
                }}
              >
                <CheckCircle2 size={14} className="inline mr-1" />
                <strong>{serverPreview.valid.length}</strong> valid /{" "}
                {serverPreview.total} total
              </div>
              <div
                className="rounded-xl p-3 text-sm"
                style={{
                  backgroundColor:
                    serverPreview.errors.length > 0 ? "#FEF3C7" : BRAND.subtleBg,
                  color:
                    serverPreview.errors.length > 0 ? "#92400E" : BRAND.textMuted,
                }}
              >
                {serverPreview.errors.length > 0 ? (
                  <AlertTriangle size={14} className="inline mr-1" />
                ) : null}
                <strong>{serverPreview.errors.length}</strong> errors
              </div>
              {serverPreview.errors.length > 0 && (
                <div
                  className="col-span-2 rounded-xl p-3 text-xs max-h-44 overflow-auto"
                  style={{
                    backgroundColor: "#FEF3C7",
                    color: "#92400E",
                  }}
                >
                  <ul className="space-y-1">
                    {serverPreview.errors.slice(0, 30).map((e, i) => (
                      <li key={i}>
                        <span className="font-mono">line {e.line}</span> · {e.field}:{" "}
                        {e.message}
                      </li>
                    ))}
                    {serverPreview.errors.length > 30 && (
                      <li className="italic">
                        … and {serverPreview.errors.length - 30} more
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 3: commit */}
      {clientRows.length > 0 && (
        <div
          className="rounded-3xl bg-white p-6"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          <h2
            className="text-lg font-extrabold mb-3"
            style={{ color: BRAND.textHeading }}
          >
            3. Commit
          </h2>

          <div className="mb-4">
            <div
              className="text-xs uppercase font-semibold mb-1.5"
              style={{ color: BRAND.textMuted }}
            >
              Onboarding mode (applies to non-student roles)
            </div>
            <div className="flex gap-2">
              <ModePill
                label="Send invite email"
                selected={mode === "invite"}
                onClick={() => setMode("invite")}
              />
              <ModePill
                label="Set passwords from CSV"
                selected={mode === "password"}
                onClick={() => setMode("password")}
              />
            </div>
            <p
              className="text-[11px] mt-2"
              style={{ color: BRAND.textMuted }}
            >
              {mode === "password"
                ? "If the password column is missing for a row, the server uses a default — admin must rotate after."
                : "Each user gets an email with a sign-in link. Students never get an account."}
            </p>
          </div>

          <button
            type="button"
            onClick={runCommit}
            disabled={pending}
            className="w-full py-3 rounded-full text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: BRAND.teal }}
          >
            {pending ? "Importing…" : `Commit ${clientRows.length} rows`}
          </button>
        </div>
      )}

      {/* Server errors */}
      {serverError && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            backgroundColor: "#FEE2E2",
            color: "#991B1B",
            border: "1px solid #FECACA",
          }}
        >
          {serverError}
        </div>
      )}

      {/* Commit result */}
      {commitResult && (
        <div
          className="rounded-3xl p-6"
          style={{
            backgroundColor:
              commitResult.status === "succeeded"
                ? BRAND.tealLight
                : commitResult.status === "failed"
                  ? "#FEE2E2"
                  : "#FEF3C7",
            border: `1px solid ${
              commitResult.status === "succeeded"
                ? BRAND.teal
                : commitResult.status === "failed"
                  ? "#FECACA"
                  : "#FCD34D"
            }`,
            color:
              commitResult.status === "succeeded"
                ? BRAND.tealDark
                : commitResult.status === "failed"
                  ? "#991B1B"
                  : "#92400E",
          }}
        >
          <h3 className="font-extrabold mb-2">
            Import {commitResult.status}
          </h3>
          <p className="text-sm">
            <strong>{commitResult.created}</strong> created ·{" "}
            <strong>{commitResult.failed}</strong> failed ·{" "}
            <strong>{commitResult.total}</strong> total
          </p>
          {commitResult.errors.length > 0 && (
            <ul className="text-xs mt-3 space-y-1 max-h-44 overflow-auto">
              {commitResult.errors.map((e, i) => (
                <li key={i}>
                  <span className="font-mono">line {e.line}</span> · {e.field}:{" "}
                  {e.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
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

"use client";

import { evaluateSection, listSectionOutcomes, recordSectionOutcomes } from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type { EvaluateResponse, OutcomeEntry as OutcomeEntryShape, OutcomeShape } from "@/lib/types";
import { AlertTriangle, ClipboardCheck, History, Siren } from "lucide-react";
import { useEffect, useState } from "react";

type Level = "" | "low" | "medium" | "high";

interface RowState {
  attendance: string;
  grade: string;
  engagement: Level;
}

const EMPTY: RowState = { attendance: "", grade: "", engagement: "" };

/**
 * S1 — record actual attendance / grade / engagement for one section-week.
 * Used by the teacher dashboard (own sections) and the HoD early-warning page.
 */
export default function OutcomeEntry({
  sectionId,
  roster,
  title = "Record weekly outcomes",
  hint,
  onEvaluated,
}: {
  sectionId: string;
  roster: { id: string; full_name: string }[];
  title?: string;
  hint?: string;
  onEvaluated?: (evaluation: EvaluateResponse) => void;
}) {
  const [week, setWeek] = useState(1);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [sectionRow, setSectionRow] = useState<RowState>(EMPTY);
  const [busy, setBusy] = useState<"save" | "evaluate" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<OutcomeShape[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    if (!showHistory) return;
    let cancelled = false;
    listSectionOutcomes(sectionId)
      .then((h) => {
        if (!cancelled) setHistory(h);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load history");
      });
    return () => {
      cancelled = true;
    };
  }, [sectionId, showHistory]);

  function patchRow(id: string, changes: Partial<RowState>) {
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] ?? EMPTY), ...changes } }));
  }

  function num(v: string): number | null {
    if (v.trim() === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
  }

  function buildEntries(): OutcomeEntryShape[] {
    const entries: OutcomeEntryShape[] = [];
    for (const s of roster) {
      const r = rows[s.id];
      if (!r) continue;
      const att = num(r.attendance);
      const grade = num(r.grade);
      if (att == null && grade == null && !r.engagement) continue;
      entries.push({
        student_id: s.id,
        attendance_pct: att,
        grade_pct: grade,
        engagement_level: r.engagement || null,
      });
    }
    const sa = num(sectionRow.attendance);
    const sg = num(sectionRow.grade);
    if (sa != null || sg != null || sectionRow.engagement) {
      entries.push({
        student_id: null,
        attendance_pct: sa,
        grade_pct: sg,
        engagement_level: sectionRow.engagement || null,
      });
    }
    return entries;
  }

  async function save() {
    setError(null);
    setMessage(null);
    const entries = buildEntries();
    if (entries.length === 0) {
      setError("Enter at least one attendance, grade or engagement value.");
      return;
    }
    setBusy("save");
    try {
      const res = await recordSectionOutcomes(sectionId, week, entries, true);
      const ev = res.evaluation;
      setMessage(
        `Saved ${res.saved} row(s) for week ${week}.` +
          (ev
            ? ` Early warning: ${ev.opened} new, ${ev.updated} refreshed, ${ev.auto_resolved} cleared — ${ev.flags.filter((f) => f.status !== "resolved").length} open flag(s).`
            : ""),
      );
      if (ev && onEvaluated) onEvaluated(ev);
      setRows({});
      setSectionRow(EMPTY);
      if (showHistory) setHistory(await listSectionOutcomes(sectionId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save outcomes");
    } finally {
      setBusy(null);
    }
  }

  async function evaluateNow() {
    setError(null);
    setMessage(null);
    setBusy("evaluate");
    try {
      const ev = await evaluateSection(sectionId);
      setMessage(
        `Evaluated ${ev.weeks_recorded} week(s) of data against a predicted-${ev.predicted_outcome ?? "?"} outcome: ${ev.opened} new, ${ev.updated} refreshed, ${ev.auto_resolved} cleared.`,
      );
      if (onEvaluated) onEvaluated(ev);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not evaluate");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      className="rounded-2xl p-4 md:p-5 space-y-4"
      style={{ backgroundColor: BRAND.subtleBg, border: `1px solid ${BRAND.cardBorder}` }}
    >
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 font-bold" style={{ color: BRAND.textHeading }}>
            <ClipboardCheck size={16} /> {title}
          </div>
          {hint && (
            <p className="text-xs mt-0.5" style={{ color: BRAND.textMuted }}>
              {hint}
            </p>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold" style={{ color: BRAND.textMuted }}>
          Week
          <input
            type="number"
            min={1}
            max={20}
            value={week}
            onChange={(e) => setWeek(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-1 rounded-lg text-sm outline-none bg-white"
            style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
          />
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl bg-white" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
        <table className="w-full text-sm">
          <thead style={{ backgroundColor: BRAND.mintSoft }}>
            <tr>
              {["Student", "Attendance %", "Grade %", "Engagement"].map((h) => (
                <th
                  key={h}
                  className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: BRAND.textMuted }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ borderTop: `1px solid ${BRAND.cardBorder}` }}>
              <td className="px-3 py-2 font-semibold" style={{ color: BRAND.textHeading }}>
                Whole section (aggregate)
              </td>
              <td className="px-3 py-1.5">
                <NumInput value={sectionRow.attendance} onChange={(v) => setSectionRow({ ...sectionRow, attendance: v })} />
              </td>
              <td className="px-3 py-1.5">
                <NumInput value={sectionRow.grade} onChange={(v) => setSectionRow({ ...sectionRow, grade: v })} />
              </td>
              <td className="px-3 py-1.5">
                <LevelSelect value={sectionRow.engagement} onChange={(v) => setSectionRow({ ...sectionRow, engagement: v })} />
              </td>
            </tr>
            {roster.map((s) => {
              const r = rows[s.id] ?? EMPTY;
              return (
                <tr key={s.id} style={{ borderTop: `1px solid ${BRAND.cardBorder}55` }}>
                  <td className="px-3 py-2" style={{ color: BRAND.text }}>
                    {s.full_name}
                  </td>
                  <td className="px-3 py-1.5">
                    <NumInput value={r.attendance} onChange={(v) => patchRow(s.id, { attendance: v })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <NumInput value={r.grade} onChange={(v) => patchRow(s.id, { grade: v })} />
                  </td>
                  <td className="px-3 py-1.5">
                    <LevelSelect value={r.engagement} onChange={(v) => patchRow(s.id, { engagement: v })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {error && (
        <div
          className="text-xs rounded-lg px-3 py-2 flex items-start gap-2"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" /> {error}
        </div>
      )}
      {message && (
        <div
          className="text-xs rounded-lg px-3 py-2"
          style={{ backgroundColor: "#DCFCE7", color: "#166534", border: "1px solid #BBF7D0" }}
        >
          {message}
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <button
          type="button"
          onClick={save}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white disabled:opacity-50"
          style={{ backgroundColor: BRAND.teal }}
        >
          <ClipboardCheck size={14} />
          {busy === "save" ? "Saving…" : "Save & evaluate"}
        </button>
        <button
          type="button"
          onClick={evaluateNow}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold bg-white disabled:opacity-50"
          style={{ color: BRAND.purple, border: `1px solid ${BRAND.purple}55` }}
        >
          <Siren size={14} />
          {busy === "evaluate" ? "Evaluating…" : "Re-evaluate"}
        </button>
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-sm font-semibold bg-white"
          style={{ color: BRAND.textMuted, border: `1px solid ${BRAND.cardBorder}` }}
        >
          <History size={14} />
          {showHistory ? "Hide recorded data" : "Show recorded data"}
        </button>
      </div>

      {showHistory && (
        <div className="rounded-xl bg-white p-3" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
          {history === null ? (
            <p className="text-xs italic" style={{ color: BRAND.textMuted }}>
              Loading…
            </p>
          ) : history.length === 0 ? (
            <p className="text-xs italic" style={{ color: BRAND.textMuted }}>
              Nothing recorded yet.
            </p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: BRAND.textMuted }}>
                  <th className="text-left px-2 py-1">Week</th>
                  <th className="text-left px-2 py-1">Student</th>
                  <th className="text-right px-2 py-1">Att %</th>
                  <th className="text-right px-2 py-1">Grade %</th>
                  <th className="text-left px-2 py-1">Engagement</th>
                  <th className="text-left px-2 py-1">By</th>
                </tr>
              </thead>
              <tbody>
                {history.map((o) => (
                  <tr key={o.id} style={{ borderTop: `1px solid ${BRAND.cardBorder}55`, color: BRAND.text }}>
                    <td className="px-2 py-1">{o.week_no}</td>
                    <td className="px-2 py-1">{o.student_name ?? "Whole section"}</td>
                    <td className="px-2 py-1 text-right">{o.attendance_pct ?? "—"}</td>
                    <td className="px-2 py-1 text-right">{o.grade_pct ?? "—"}</td>
                    <td className="px-2 py-1 capitalize">{o.engagement_level ?? "—"}</td>
                    <td className="px-2 py-1" style={{ color: BRAND.textMuted }}>
                      {o.recorded_by_name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

function NumInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="number"
      min={0}
      max={100}
      step={1}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="—"
      className="w-20 px-2 py-1 rounded-lg text-sm outline-none"
      style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
    />
  );
}

function LevelSelect({ value, onChange }: { value: Level; onChange: (v: Level) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Level)}
      className="px-2 py-1 rounded-lg text-sm outline-none bg-white"
      style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
    >
      <option value="">—</option>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
  );
}

"use client";

import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import OutcomeEntry from "@/components/OutcomeEntry";
import StatCard from "@/components/StatCard";
import {
  evaluateSection,
  getEarlyWarningOverview,
  getSection,
  listFlags,
  setFlagStatus,
} from "@/lib/api";
import { BRAND } from "@/lib/brand";
import type {
  EarlyWarningOverview,
  FlagShape,
  SectionWarningSummary,
  WarningStatus,
} from "@/lib/types";
import {
  AlertOctagon,
  AlertTriangle,
  Check,
  ClipboardCheck,
  RotateCcw,
  Siren,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";

const SEVERITY_STYLE: Record<string, { bg: string; fg: string }> = {
  high: { bg: "#FEE2E2", fg: "#991B1B" },
  medium: { bg: "#FEF3C7", fg: "#92400E" },
  low: { bg: "#E0E7FF", fg: "#3730A3" },
};

export default function EarlyWarningView({
  initialOverview,
  initialFlags,
  loadError,
}: {
  initialOverview: EarlyWarningOverview | null;
  initialFlags: FlagShape[];
  loadError: string | null;
}) {
  const [overview, setOverview] = useState<EarlyWarningOverview | null>(initialOverview);
  const [flags, setFlags] = useState<FlagShape[]>(initialFlags);
  const [statusFilter, setStatusFilter] = useState<WarningStatus | "all">("open");
  const [sectionFilter, setSectionFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(loadError);
  const [busy, setBusy] = useState<string | null>(null);
  const [entryFor, setEntryFor] = useState<SectionWarningSummary | null>(null);
  const [roster, setRoster] = useState<{ id: string; full_name: string }[] | null>(null);

  useEffect(() => {
    if (!entryFor) return;
    let cancelled = false;
    getSection(entryFor.section_id)
      .then((d) => {
        if (!cancelled) setRoster(d.students.map((s) => ({ id: s.id, full_name: s.full_name })));
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load roster");
      });
    return () => {
      cancelled = true;
    };
  }, [entryFor]);

  async function refresh() {
    try {
      const [o, f] = await Promise.all([getEarlyWarningOverview(), listFlags({})]);
      setOverview(o);
      setFlags(f);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not refresh");
    }
  }

  async function changeStatus(flag: FlagShape, status: WarningStatus) {
    setError(null);
    setBusy(flag.id);
    try {
      const updated = await setFlagStatus(flag.id, status);
      setFlags((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
      const o = await getEarlyWarningOverview();
      setOverview(o);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update flag");
    } finally {
      setBusy(null);
    }
  }

  async function evaluate(sectionId: string) {
    setError(null);
    setBusy(`eval:${sectionId}`);
    try {
      await evaluateSection(sectionId);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not evaluate");
    } finally {
      setBusy(null);
    }
  }

  const visible = flags.filter(
    (f) =>
      (statusFilter === "all" || f.status === statusFilter) &&
      (!sectionFilter || f.section_id === sectionFilter),
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
          Early Warning System
        </h1>
        <p className="text-base mt-1.5 max-w-2xl" style={{ color: BRAND.textHeading, opacity: 0.7 }}>
          Once a section is live, real attendance and grades are compared with the
          predicted outcome. Flags mark where reality is diverging from the simulation,
          closing the loop between prediction and the actual semester.
        </p>
      </div>

      {error && (
        <div
          className="text-sm rounded-xl px-4 py-3 flex items-start gap-3"
          style={{ backgroundColor: "#FEE2E2", color: "#991B1B", border: "1px solid #FECACA" }}
        >
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Open flags" value={overview.open_total} icon={Siren} accent={BRAND.coral} />
          <StatCard label="High severity" value={overview.by_severity.high ?? 0} icon={AlertOctagon} accent="#DC2626" />
          <StatCard label="Performance" value={overview.by_type.performance ?? 0} icon={AlertTriangle} accent={BRAND.amber} />
          <StatCard label="Engagement" value={overview.by_type.engagement ?? 0} icon={ClipboardCheck} accent={BRAND.indigo} />
        </div>
      )}

      {/* Sections being watched */}
      <div className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
        <h2 className="text-xl font-extrabold tracking-tight mb-1" style={{ color: BRAND.textHeading }}>
          Sections under watch
        </h2>
        <p className="text-xs mb-4" style={{ color: BRAND.textMuted }}>
          Active and simulated sections. Record weekly data here or let teachers do it from
          their dashboard, then evaluate.
        </p>
        {!overview || overview.sections.length === 0 ? (
          <EmptyState
            icon={Siren}
            title="Nothing to watch yet"
            description="Activate a simulated section in the Section Builder to start comparing predictions with real data."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: BRAND.subtleBg }}>
                <tr>
                  {["Section", "Teacher", "State", "Predicted", "Weeks", "Open", "High", ""].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: BRAND.textMuted }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {overview.sections.map((s) => (
                  <tr key={s.section_id} style={{ borderTop: `1px solid ${BRAND.cardBorder}55` }}>
                    <td className="px-3 py-2 font-medium" style={{ color: BRAND.text }}>
                      {s.course.code} — {s.label}
                      <div className="text-[11px]" style={{ color: BRAND.textMuted }}>{s.course.name}</div>
                    </td>
                    <td className="px-3 py-2" style={{ color: BRAND.textMuted }}>{s.teacher_name ?? "—"}</td>
                    <td className="px-3 py-2"><Badge text={s.state} /></td>
                    <td className="px-3 py-2">
                      {s.predicted_outcome ? (
                        <span className="flex items-center gap-1.5">
                          <Badge text={s.predicted_outcome} />
                          <span className="text-xs" style={{ color: BRAND.textMuted }}>{s.compatibility_score}</span>
                        </span>
                      ) : (
                        <span className="text-xs italic" style={{ color: BRAND.textMuted }}>not simulated</span>
                      )}
                    </td>
                    <td className="px-3 py-2" style={{ color: BRAND.text }}>
                      {s.weeks_recorded}
                      {s.latest_week ? <span style={{ color: BRAND.textSubtle }}> (to wk {s.latest_week})</span> : null}
                    </td>
                    <td className="px-3 py-2 font-bold" style={{ color: s.open_flags ? "#991B1B" : BRAND.text }}>{s.open_flags}</td>
                    <td className="px-3 py-2 font-bold" style={{ color: s.high_flags ? "#991B1B" : BRAND.text }}>{s.high_flags}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => {
                            setRoster(null);
                            setEntryFor(entryFor?.section_id === s.section_id ? null : s);
                          }}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold"
                          style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark }}
                        >
                          {entryFor?.section_id === s.section_id ? "Close" : "Record data"}
                        </button>
                        <button
                          type="button"
                          onClick={() => evaluate(s.section_id)}
                          disabled={busy !== null || s.weeks_recorded === 0}
                          className="px-2.5 py-1 rounded-full text-xs font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: BRAND.purple }}
                        >
                          {busy === `eval:${s.section_id}` ? "…" : "Evaluate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {entryFor && (
          <div className="mt-5">
            {roster === null ? (
              <p className="text-xs italic" style={{ color: BRAND.textMuted }}>Loading roster…</p>
            ) : (
              <OutcomeEntry
                sectionId={entryFor.section_id}
                roster={roster}
                title={`${entryFor.course.code} — Section ${entryFor.label}: weekly outcomes`}
                hint="Leave a cell blank to skip it. Saving re-evaluates the section immediately."
                onEvaluated={() => {
                  void refresh();
                }}
              />
            )}
          </div>
        )}
      </div>

      {/* Flags */}
      <div className="rounded-3xl bg-white p-6" style={{ border: `1px solid ${BRAND.cardBorder}` }}>
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <h2 className="text-xl font-extrabold tracking-tight" style={{ color: BRAND.textHeading }}>
            Flags ({visible.length})
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as WarningStatus | "all")}
              className="px-3 py-1.5 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="open">Open</option>
              <option value="acknowledged">Acknowledged</option>
              <option value="resolved">Resolved</option>
              <option value="all">All</option>
            </select>
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg text-sm outline-none bg-white"
              style={{ border: `1px solid ${BRAND.inputBorder}`, color: BRAND.text }}
            >
              <option value="">All sections</option>
              {(overview?.sections ?? []).map((s) => (
                <option key={s.section_id} value={s.section_id}>
                  {s.course.code} — {s.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={refresh}
              className="px-3 py-1.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: BRAND.subtleBg, color: BRAND.tealDark }}
            >
              Refresh
            </button>
          </div>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm italic py-8 text-center" style={{ color: BRAND.textMuted }}>
            No {statusFilter === "all" ? "" : statusFilter} flags.
          </p>
        ) : (
          <ul className="space-y-2">
            {visible.map((f) => {
              const sev = SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.low;
              return (
                <li
                  key={f.id}
                  className="rounded-xl p-3 flex items-start gap-3 flex-wrap"
                  style={{ backgroundColor: BRAND.subtleBg, border: `1px solid ${BRAND.cardBorder}` }}
                >
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full uppercase" style={{ backgroundColor: sev.bg, color: sev.fg }}>
                    {f.severity}
                  </span>
                  <div className="flex-1 min-w-[240px]">
                    <div className="text-sm" style={{ color: BRAND.text }}>{f.message}</div>
                    <div className="text-[11px] mt-1 flex gap-2 flex-wrap" style={{ color: BRAND.textMuted }}>
                      <span className="font-semibold capitalize">{f.type}</span>
                      <span>· {f.course?.code} {f.section_label}</span>
                      {f.student_name && <span>· {f.student_name}</span>}
                      {f.week_no && <span>· week {f.week_no}</span>}
                      {f.expected_value != null && f.actual_value != null && (
                        <span>· expected {f.expected_value} / actual {f.actual_value}</span>
                      )}
                      <span>· {new Date(f.evaluated_at).toLocaleDateString()}</span>
                      <Badge text={f.status} />
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    {f.status === "open" && (
                      <button
                        type="button"
                        disabled={busy === f.id}
                        onClick={() => changeStatus(f, "acknowledged")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white"
                        style={{ color: BRAND.tealDark, border: `1px solid ${BRAND.cardBorder}` }}
                      >
                        <Check size={12} /> Acknowledge
                      </button>
                    )}
                    {f.status !== "resolved" && (
                      <button
                        type="button"
                        disabled={busy === f.id}
                        onClick={() => changeStatus(f, "resolved")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                        style={{ backgroundColor: BRAND.teal }}
                      >
                        <Check size={12} /> Resolve
                      </button>
                    )}
                    {f.status === "resolved" && (
                      <button
                        type="button"
                        disabled={busy === f.id}
                        onClick={() => changeStatus(f, "open")}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-white"
                        style={{ color: BRAND.textMuted, border: `1px solid ${BRAND.cardBorder}` }}
                      >
                        <RotateCcw size={12} /> Reopen
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

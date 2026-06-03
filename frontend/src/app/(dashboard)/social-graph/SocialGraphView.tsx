"use client";

import Badge from "@/components/Badge";
import { BRAND } from "@/lib/brand";
import { Check, Filter, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

const EDGE_COLOR: Record<string, string> = {
  friend: "#3B82F6",
  study_partner: "#8B5CF6",
  neutral: "#94A3B8",
  conflict: "#EF4444",
};

export interface SocialGraphData {
  students: { id: string; name: string; dominant: string | null }[];
  relationships: {
    id: string;
    from: string;
    to: string;
    fromName: string;
    toName: string;
    type: string;
    strength: number;
  }[];
  sections: { id: string; label: string }[];
  sectionStudents: { sectionId: string; studentId: string }[];
}

type FilterMode = "all" | "section" | "custom";

// ─── Force-directed layout (deterministic) ─────────────────────────────────
function forceLayout(
  students: { id: string }[],
  edges: { from: string; to: string }[],
  w: number,
  h: number,
  iterations = 220,
) {
  const n = students.length;
  if (n === 0) return [] as { x: number; y: number }[];
  if (n === 1) return [{ x: w / 2, y: h / 2 }];

  const idx = new Map(students.map((s, i) => [s.id, i]));
  const adj: Set<number>[] = students.map(() => new Set());
  for (const e of edges) {
    const a = idx.get(e.from);
    const b = idx.get(e.to);
    if (a != null && b != null && a !== b) {
      adj[a].add(b);
      adj[b].add(a);
    }
  }

  const cx = w / 2;
  const cy = h / 2;
  const r0 = Math.min(w, h) * 0.32;
  const pos = students.map((_, i) => {
    const angle = (2 * Math.PI * i) / n - Math.PI / 2;
    return { x: cx + r0 * Math.cos(angle), y: cy + r0 * Math.sin(angle) };
  });

  const idealEdgeLen = Math.max(70, Math.min(160, 700 / Math.sqrt(n)));
  const kRepel = 12000;
  const kAttract = 0.06;
  const kGravity = 0.008;
  const damping = 0.85;

  for (let iter = 0; iter < iterations; iter++) {
    const force = pos.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const distSq = Math.max(dx * dx + dy * dy, 25);
        const dist = Math.sqrt(distSq);
        const f = kRepel / distSq;
        force[i].x += (dx / dist) * f;
        force[i].y += (dy / dist) * f;
        force[j].x -= (dx / dist) * f;
        force[j].y -= (dy / dist) * f;
      }
    }

    for (let i = 0; i < n; i++) {
      for (const j of adj[i]) {
        if (j <= i) continue;
        const dx = pos[i].x - pos[j].x;
        const dy = pos[i].y - pos[j].y;
        const dist = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
        const stretch = dist - idealEdgeLen;
        const f = stretch * kAttract;
        force[i].x -= (dx / dist) * f;
        force[i].y -= (dy / dist) * f;
        force[j].x += (dx / dist) * f;
        force[j].y += (dy / dist) * f;
      }
    }

    for (let i = 0; i < n; i++) {
      force[i].x += (cx - pos[i].x) * kGravity;
      force[i].y += (cy - pos[i].y) * kGravity;
    }

    const cooling = 1 - iter / iterations;
    for (let i = 0; i < n; i++) {
      pos[i].x += force[i].x * damping * cooling;
      pos[i].y += force[i].y * damping * cooling;
    }
  }

  const margin = 36;
  for (const p of pos) {
    p.x = Math.max(margin, Math.min(w - margin, p.x));
    p.y = Math.max(margin, Math.min(h - margin, p.y));
  }
  return pos;
}

export default function SocialGraphView({ data }: { data: SocialGraphData }) {
  const [mode, setMode] = useState<FilterMode>("all");
  const [sectionId, setSectionId] = useState<string>(data.sections[0]?.id ?? "");
  const [customIds, setCustomIds] = useState<Set<string>>(new Set());
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [pickerSearch, setPickerSearch] = useState("");

  // ─── Decide visible students ───────────────────────────────────────────
  const visibleStudents = useMemo(() => {
    if (mode === "section") {
      const ids = new Set(
        data.sectionStudents
          .filter((ss) => ss.sectionId === sectionId)
          .map((ss) => ss.studentId),
      );
      return data.students.filter((s) => ids.has(s.id));
    }
    if (mode === "custom") {
      return data.students.filter((s) => customIds.has(s.id));
    }
    return data.students;
  }, [mode, sectionId, customIds, data]);

  const visibleIds = useMemo(
    () => new Set(visibleStudents.map((s) => s.id)),
    [visibleStudents],
  );
  const visibleEdges = useMemo(
    () =>
      data.relationships.filter(
        (e) => visibleIds.has(e.from) && visibleIds.has(e.to),
      ),
    [data.relationships, visibleIds],
  );

  // ─── Layout ────────────────────────────────────────────────────────────
  const w = 720;
  const h = 540;
  const positions = useMemo(
    () => forceLayout(visibleStudents, visibleEdges, w, h),
    [visibleStudents, visibleEdges],
  );
  const indexById = useMemo(
    () => new Map(visibleStudents.map((s, i) => [s.id, i])),
    [visibleStudents],
  );

  const sel = selectedNode
    ? visibleStudents.find((s) => s.id === selectedNode) ?? null
    : null;
  const selEdges = sel
    ? visibleEdges.filter((e) => e.from === sel.id || e.to === sel.id)
    : [];

  // ─── Picker (custom mode) — searchable, scrollable ─────────────────────
  const filteredForPicker = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return data.students;
    return data.students.filter((s) => s.name.toLowerCase().includes(q));
  }, [pickerSearch, data.students]);

  const toggleCustom = (id: string) => {
    setCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const removeFromCustom = (id: string) => {
    setCustomIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSelectedNode(null);
  };

  // ─── Selected students (custom mode chip strip) ────────────────────────
  const selectedStudentsList = useMemo(
    () => data.students.filter((s) => customIds.has(s.id)),
    [customIds, data.students],
  );

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          Social Relationship Graph
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Filter by section, build a custom set, and click a node to inspect
          its ties.
        </p>
      </div>

      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl bg-white p-4 flex flex-wrap items-center gap-3"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <Filter size={16} style={{ color: BRAND.textMuted }} />
        <span
          className="text-xs uppercase tracking-wider font-semibold"
          style={{ color: BRAND.textMuted }}
        >
          View
        </span>
        <FilterPill
          active={mode === "all"}
          onClick={() => {
            setMode("all");
            setSelectedNode(null);
          }}
        >
          All students
          <span
            className="ml-1.5 text-[10px] font-normal"
            style={{ opacity: 0.7 }}
          >
            ({data.students.length})
          </span>
        </FilterPill>
        <FilterPill
          active={mode === "section"}
          onClick={() => {
            setMode("section");
            setSelectedNode(null);
          }}
        >
          By section
        </FilterPill>
        <FilterPill
          active={mode === "custom"}
          onClick={() => {
            setMode("custom");
            setSelectedNode(null);
          }}
        >
          Custom set
          {mode === "custom" && (
            <span
              className="ml-1.5 text-[10px] font-normal"
              style={{ opacity: 0.7 }}
            >
              ({customIds.size})
            </span>
          )}
        </FilterPill>

        {mode === "section" && (
          <select
            value={sectionId}
            onChange={(e) => setSectionId(e.target.value)}
            className="bg-white text-sm font-medium rounded-full px-4 py-2 outline-none"
            style={{
              border: `1px solid ${BRAND.cardBorder}`,
              color: BRAND.text,
            }}
          >
            {data.sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* ── Custom picker (search + scrollable list, scales to 100s) ── */}
      {mode === "custom" && (
        <CustomPicker
          allStudents={data.students}
          filtered={filteredForPicker}
          selected={customIds}
          selectedStudents={selectedStudentsList}
          pickerSearch={pickerSearch}
          setPickerSearch={setPickerSearch}
          onToggle={toggleCustom}
          onClear={() => setCustomIds(new Set())}
        />
      )}

      {/* ── Graph + sidebar ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Graph panel */}
        <div
          className="lg:col-span-2 rounded-2xl bg-white p-4"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          {visibleStudents.length === 0 ? (
            <div
              className="p-12 text-center"
              style={{ color: BRAND.textMuted }}
            >
              <Users size={32} className="mx-auto mb-2 opacity-50" />
              <p className="text-sm">
                No students in current view — pick a section or add some to the
                custom set.
              </p>
            </div>
          ) : (
            <svg
              viewBox={`0 0 ${w} ${h}`}
              className="w-full h-auto"
              role="img"
              aria-label="Social relationship graph"
            >
              {/* Edges */}
              {visibleEdges.map((e) => {
                const fi = indexById.get(e.from);
                const ti = indexById.get(e.to);
                if (fi == null || ti == null) return null;
                const incident =
                  selectedNode != null &&
                  (e.from === selectedNode || e.to === selectedNode);
                const opacity =
                  selectedNode == null ? 0.55 : incident ? 0.95 : 0.08;
                return (
                  <line
                    key={e.id}
                    x1={positions[fi].x}
                    y1={positions[fi].y}
                    x2={positions[ti].x}
                    y2={positions[ti].y}
                    stroke={EDGE_COLOR[e.type] ?? BRAND.cardBorder}
                    strokeWidth={Math.max(1, e.strength) * 0.9}
                    strokeOpacity={opacity}
                    style={{ transition: "stroke-opacity 0.15s" }}
                  />
                );
              })}
              {/* Nodes */}
              {visibleStudents.map((s, i) => {
                const isSelected = s.id === selectedNode;
                const isDimmed =
                  selectedNode != null &&
                  !isSelected &&
                  !visibleEdges.some(
                    (e) =>
                      (e.from === selectedNode && e.to === s.id) ||
                      (e.to === selectedNode && e.from === s.id),
                  );
                const r = isSelected ? 26 : 20;
                return (
                  <g key={s.id} style={{ cursor: "pointer" }}>
                    <g
                      onClick={() =>
                        setSelectedNode(isSelected ? null : s.id)
                      }
                    >
                      <circle
                        cx={positions[i].x}
                        cy={positions[i].y}
                        r={r}
                        fill={BRAND.teal}
                        stroke={isSelected ? BRAND.purple : "#fff"}
                        strokeWidth={isSelected ? 4 : 2}
                        opacity={isDimmed ? 0.25 : 1}
                        style={{ transition: "all 0.15s" }}
                      />
                      <text
                        x={positions[i].x}
                        y={positions[i].y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#fff"
                        fontSize={9}
                        fontWeight="bold"
                        opacity={isDimmed ? 0.4 : 1}
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        {s.name.split(" ")[0].slice(0, 8)}
                      </text>
                    </g>

                    {/* Inline × — only in custom mode AND when this node is selected */}
                    {isSelected && mode === "custom" && (
                      <g
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromCustom(s.id);
                        }}
                        style={{ cursor: "pointer" }}
                      >
                        <title>Remove from custom set</title>
                        <circle
                          cx={positions[i].x + r - 4}
                          cy={positions[i].y - r + 4}
                          r={10}
                          fill="#EF4444"
                          stroke="#fff"
                          strokeWidth={2}
                        />
                        <line
                          x1={positions[i].x + r - 4 - 4}
                          y1={positions[i].y - r + 4 - 4}
                          x2={positions[i].x + r - 4 + 4}
                          y2={positions[i].y - r + 4 + 4}
                          stroke="#fff"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                        <line
                          x1={positions[i].x + r - 4 + 4}
                          y1={positions[i].y - r + 4 - 4}
                          x2={positions[i].x + r - 4 - 4}
                          y2={positions[i].y - r + 4 + 4}
                          stroke="#fff"
                          strokeWidth={2}
                          strokeLinecap="round"
                        />
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Legend */}
          <div
            className="rounded-2xl bg-white p-5"
            style={{ border: `1px solid ${BRAND.cardBorder}` }}
          >
            <h3
              className="text-xs uppercase tracking-wider font-semibold mb-3"
              style={{ color: BRAND.textMuted }}
            >
              Edge Types
            </h3>
            <div className="space-y-2">
              {(["friend", "study_partner", "conflict", "neutral"] as const).map(
                (type) => (
                  <div
                    key={type}
                    className="flex items-center gap-2 text-sm capitalize"
                    style={{ color: BRAND.text }}
                  >
                    <div
                      className="w-6 h-1 rounded-full"
                      style={{ backgroundColor: EDGE_COLOR[type] }}
                    />
                    {type.replace("_", " ")}
                  </div>
                ),
              )}
            </div>
          </div>

          {/* Selection detail / counts */}
          {sel ? (
            <div
              className="rounded-2xl bg-white p-5"
              style={{ border: `2px solid ${BRAND.teal}` }}
            >
              <div className="flex items-center justify-between mb-3">
                <h3
                  className="text-xs uppercase tracking-wider font-semibold"
                  style={{ color: BRAND.textMuted }}
                >
                  Selected
                </h3>
                <button
                  type="button"
                  onClick={() => setSelectedNode(null)}
                  className="text-slate-400 hover:text-slate-700"
                  aria-label="Clear selection"
                >
                  <X size={14} />
                </button>
              </div>
              <div
                className="text-base font-bold"
                style={{ color: BRAND.textHeading }}
              >
                {sel.name}
              </div>
              {sel.dominant && (
                <div className="mt-1.5">
                  <Badge text={sel.dominant} />
                </div>
              )}

              {mode === "custom" && (
                <p
                  className="text-xs mt-3 italic"
                  style={{ color: BRAND.textSubtle }}
                >
                  Click the red × on the node to remove from custom set.
                </p>
              )}

              <div
                className="mt-4 text-xs font-semibold uppercase tracking-wider mb-2"
                style={{ color: BRAND.textMuted }}
              >
                Relationships ({selEdges.length})
              </div>
              <ul className="space-y-2 max-h-56 overflow-auto">
                {selEdges.length === 0 ? (
                  <li
                    className="text-sm italic"
                    style={{ color: BRAND.textMuted }}
                  >
                    No ties in current view.
                  </li>
                ) : (
                  selEdges.map((e) => {
                    const otherId = e.from === sel.id ? e.to : e.from;
                    const other = visibleStudents.find(
                      (s) => s.id === otherId,
                    );
                    return (
                      <li
                        key={e.id}
                        className="flex items-center justify-between text-sm"
                      >
                        <span
                          className="truncate pr-2"
                          style={{ color: BRAND.text }}
                        >
                          {e.from === sel.id ? "→ " : "← "}
                          {other?.name ?? "(unknown)"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge text={e.type} />
                          <span
                            className="text-xs"
                            style={{ color: BRAND.textMuted }}
                          >
                            {e.strength}/5
                          </span>
                        </div>
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          ) : (
            <div
              className="rounded-2xl bg-white p-5"
              style={{ border: `1px solid ${BRAND.cardBorder}` }}
            >
              <h3
                className="text-xs uppercase tracking-wider font-semibold mb-3"
                style={{ color: BRAND.textMuted }}
              >
                Stats
              </h3>
              <Stat label="Nodes visible" value={visibleStudents.length} />
              <Stat label="Edges visible" value={visibleEdges.length} />
              <p
                className="text-xs mt-3 italic"
                style={{ color: BRAND.textSubtle }}
              >
                Click any node to inspect its ties.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Custom picker — searchable, scales to hundreds of students ──────────
function CustomPicker({
  allStudents,
  filtered,
  selected,
  selectedStudents,
  pickerSearch,
  setPickerSearch,
  onToggle,
  onClear,
}: {
  allStudents: { id: string; name: string }[];
  filtered: { id: string; name: string }[];
  selected: Set<string>;
  selectedStudents: { id: string; name: string }[];
  pickerSearch: string;
  setPickerSearch: (s: string) => void;
  onToggle: (id: string) => void;
  onClear: () => void;
}) {
  return (
    <div
      className="rounded-2xl bg-white p-4 space-y-3"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      {/* Search row + counts */}
      <div className="flex items-center gap-3 flex-wrap">
        <div
          className="flex-1 min-w-[240px] flex items-center gap-2 px-3 py-2 rounded-full"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          <Search size={14} style={{ color: BRAND.textMuted }} />
          <input
            type="search"
            value={pickerSearch}
            onChange={(e) => setPickerSearch(e.target.value)}
            placeholder={`Search ${allStudents.length} students…`}
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {pickerSearch && (
            <button
              type="button"
              onClick={() => setPickerSearch("")}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <span
          className="text-xs font-semibold"
          style={{ color: BRAND.textMuted }}
        >
          {selected.size} selected
        </span>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-xs font-semibold hover:underline"
            style={{ color: BRAND.coral }}
          >
            Clear all
          </button>
        )}
      </div>

      {/* Selected chip strip (only if any selected) */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap gap-1.5 pb-3"
          style={{ borderBottom: `1px dashed ${BRAND.cardBorder}` }}
        >
          {selectedStudents.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => onToggle(s.id)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold transition"
              style={{
                backgroundColor: BRAND.teal,
                color: "#fff",
              }}
              title="Click to remove"
            >
              {s.name}
              <X size={11} />
            </button>
          ))}
        </div>
      )}

      {/* Scrollable list of available students (filtered by search) */}
      <ul
        className="rounded-xl overflow-auto"
        style={{
          maxHeight: 280,
          border: `1px solid ${BRAND.cardBorder}`,
        }}
      >
        {filtered.length === 0 ? (
          <li
            className="px-4 py-6 text-sm text-center"
            style={{ color: BRAND.textMuted }}
          >
            No students match &quot;{pickerSearch}&quot;.
          </li>
        ) : (
          filtered.map((s) => {
            const checked = selected.has(s.id);
            return (
              <li
                key={s.id}
                onClick={() => onToggle(s.id)}
                className="px-3 py-2 flex items-center justify-between text-sm cursor-pointer transition"
                style={{
                  backgroundColor: checked ? BRAND.tealLight : "transparent",
                  borderBottom: `1px solid ${BRAND.cardBorder}33`,
                  color: BRAND.text,
                }}
                onMouseEnter={(e) => {
                  if (!checked)
                    e.currentTarget.style.backgroundColor = BRAND.subtleBg;
                }}
                onMouseLeave={(e) => {
                  if (!checked)
                    e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span className="truncate">{s.name}</span>
                <span
                  className="ml-3 shrink-0 w-5 h-5 rounded grid place-items-center"
                  style={{
                    backgroundColor: checked ? BRAND.teal : "transparent",
                    border: `1.5px solid ${checked ? BRAND.teal : BRAND.cardBorder}`,
                  }}
                >
                  {checked && <Check size={12} color="#fff" strokeWidth={3} />}
                </span>
              </li>
            );
          })
        )}
      </ul>

      <p
        className="text-[11px]"
        style={{ color: BRAND.textSubtle }}
      >
        Tip: type to filter, click rows to add/remove. Or click the × on a
        selected chip / node to remove.
      </p>
    </div>
  );
}

function FilterPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-semibold transition"
      style={{
        backgroundColor: active ? BRAND.teal : BRAND.subtleBg,
        color: active ? "#fff" : BRAND.text,
        border: `1px solid ${active ? BRAND.teal : BRAND.cardBorder}`,
      }}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-baseline justify-between py-1">
      <span className="text-sm" style={{ color: BRAND.textMuted }}>
        {label}
      </span>
      <span
        className="text-xl font-extrabold"
        style={{ color: BRAND.textHeading }}
      >
        {value}
      </span>
    </div>
  );
}

"use client";

import Badge from "@/components/Badge";
import CreateStudentModal from "@/components/CreateStudentModal";
import EmptyState from "@/components/EmptyState";
import FslsmBars from "@/components/FslsmBars";
import LearningStyleCard from "@/components/LearningStyleCard";
import { BRAND } from "@/lib/brand";
import {
  FSLSM_AXES,
  type FslsmAxis,
  type StudentWithProfile,
} from "@/lib/types";
import { ArrowLeft, Plus, Search, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

// Map participation level → an "engagement" percentage for the student card.
// Real performance metrics will come from S1 (early-warning system).
const ENGAGEMENT_PCT: Record<string, number> = {
  high: 85,
  medium: 60,
  low: 35,
};

// Given a dominant axis and the profile's signed scores, return the dominant
// POLE (e.g. "Visual" or "Verbal" from the visual_verbal axis).
function dominantPoleLabel(profile: Row["profile"]): string | null {
  if (!profile || !profile.dominant_axis) return null;
  const meta = FSLSM_AXES[profile.dominant_axis as FslsmAxis];
  const score = {
    active_reflective: profile.active_reflective_score,
    sensing_intuitive: profile.sensing_intuitive_score,
    visual_verbal: profile.visual_verbal_score,
    sequential_global: profile.sequential_global_score,
  }[profile.dominant_axis as FslsmAxis];
  return score > 0 ? meta.poleA : meta.poleB;
}

type Row = StudentWithProfile & {
  aux: {
    collaboration_pref: string | null;
    participation_level: string | null;
  } | null;
};

export default function StudentsView({ students }: { students: Row[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  // ─── Learning Style Overview data ──────────────────────────────────────
  const axisCounts: Record<FslsmAxis, number> = {
    active_reflective: 0,
    sensing_intuitive: 0,
    visual_verbal: 0,
    sequential_global: 0,
  };
  for (const s of students) {
    const d = s.profile?.dominant_axis;
    if (d && d in axisCounts) axisCounts[d as FslsmAxis] += 1;
  }
  const totalProfiles = Math.max(
    students.filter((s) => !!s.profile).length,
    1,
  );

  const learningStyles: {
    axis: FslsmAxis;
    title: string;
    description: string;
    primary: string;
    secondary: string;
  }[] = [
    {
      axis: "active_reflective",
      title: "Active / Reflective",
      description:
        "Learn through doing and discussion vs. thinking quietly first.",
      primary: BRAND.teal,
      secondary: BRAND.tealLight,
    },
    {
      axis: "sensing_intuitive",
      title: "Sensing / Intuitive",
      description:
        "Prefer concrete facts and procedures vs. concepts and theories.",
      primary: BRAND.amber,
      secondary: "#FEF3C7",
    },
    {
      axis: "visual_verbal",
      title: "Visual / Verbal",
      description:
        "Learn best through images and diagrams vs. words and lectures.",
      primary: BRAND.indigo,
      secondary: "#E0E7FF",
    },
    {
      axis: "sequential_global",
      title: "Sequential / Global",
      description:
        "Build understanding in linear steps vs. big-picture leaps.",
      primary: BRAND.coral,
      secondary: "#FFE4E0",
    },
  ];

  // ─── Search filter for the grid ────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter(
      (s) =>
        s.full_name.toLowerCase().includes(q) ||
        (s.external_id ?? "").toLowerCase().includes(q),
    );
  }, [search, students]);

  const selected = selectedId
    ? students.find((s) => s.id === selectedId) ?? null
    : null;

  // ─── Empty state ───────────────────────────────────────────────────────
  if (students.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="flex items-start justify-between mb-1">
          <div className="flex-1">
            <h1
              className="text-4xl font-extrabold tracking-tight mb-1"
              style={{ color: BRAND.textHeading }}
            >
              Student Digital Twin Profiles
            </h1>
            <p
              className="text-base"
              style={{ color: BRAND.textHeading, opacity: 0.7 }}
            >
              Each student carries a versioned FSLSM behavioral profile.
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white whitespace-nowrap ml-4"
            style={{ backgroundColor: BRAND.teal }}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={18} />
            Create Student
          </button>
        </div>
        <div className="mt-8">
          <EmptyState
            icon={Users}
            title="No students yet"
            description="Students will appear here once their survey data is ingested."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <CreateStudentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          // Optionally refresh the page or re-fetch data
          window.location.reload();
        }}
      />

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1
            className="text-4xl font-extrabold tracking-tight"
            style={{ color: BRAND.textHeading }}
          >
            Student Digital Twin Profiles
          </h1>
          <p
            className="text-base mt-1.5"
            style={{ color: BRAND.textHeading, opacity: 0.7 }}
          >
            Versioned FSLSM behavioral profiles per student. Click a card to view
            their full profile.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white whitespace-nowrap ml-4 shrink-0"
          style={{ backgroundColor: BRAND.teal }}
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={18} />
          Create Student
        </button>
      </div>

      {/* ── Learning Style Overview ─────────────────────────────────── */}
      <div
        className="rounded-3xl p-6 md:p-7"
        style={{
          backgroundColor: BRAND.mintSoft,
          border: `1px solid ${BRAND.cardBorder}`,
        }}
      >
        <h2
          className="text-xl font-extrabold tracking-tight mb-4"
          style={{ color: BRAND.textHeading }}
        >
          Learning Style Overview
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {learningStyles.map((ls) => {
            const count = axisCounts[ls.axis];
            const pct = Math.round((count / totalProfiles) * 100);
            return (
              <LearningStyleCard
                key={ls.axis}
                title={ls.title}
                description={ls.description}
                studentCount={count}
                percent={pct}
                primary={ls.primary}
                secondary={ls.secondary}
              />
            );
          })}
        </div>
      </div>

      {/* ── Either: card grid OR: detail panel ──────────────────────── */}
      {!selected ? (
        <StudentGrid
          students={filtered}
          totalStudents={students.length}
          search={search}
          setSearch={setSearch}
          onSelect={setSelectedId}
        />
      ) : (
        <StudentDetail
          student={selected}
          onBack={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}

// ─── Student card grid (default view) ────────────────────────────────────
function StudentGrid({
  students,
  totalStudents,
  search,
  setSearch,
  onSelect,
}: {
  students: Row[];
  totalStudents: number;
  search: string;
  setSearch: (v: string) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div
      className="rounded-3xl bg-white p-6 md:p-7"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h2
          className="text-xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          Students ({totalStudents})
        </h2>
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-full min-w-[220px]"
          style={{ border: `1px solid ${BRAND.cardBorder}` }}
        >
          <Search size={14} style={{ color: BRAND.textMuted }} />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name or ID…"
            className="flex-1 bg-transparent outline-none text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-slate-400 hover:text-slate-700"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {students.length === 0 ? (
        <p
          className="text-sm text-center py-8 italic"
          style={{ color: BRAND.textMuted }}
        >
          No students match &quot;{search}&quot;.
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {students.map((s) => (
            <StudentCard
              key={s.id}
              student={s}
              onClick={() => onSelect(s.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Solid-teal student card (matches the supplied design) ──────────────
function StudentCard({
  student,
  onClick,
}: {
  student: Row;
  onClick: () => void;
}) {
  const initials = student.full_name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("");
  const pole = dominantPoleLabel(student.profile);
  const participation = student.aux?.participation_level ?? null;
  const engagement = participation ? ENGAGEMENT_PCT[participation] ?? 50 : null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left rounded-2xl p-4 transition hover:shadow-lg cursor-pointer w-full"
      style={{
        backgroundColor: BRAND.teal,
        color: "#fff",
      }}
    >
      {/* Top: avatar + name + ID */}
      <div className="flex items-center gap-2.5">
        <div
          className="w-9 h-9 rounded-full shrink-0 grid place-items-center"
          style={{
            backgroundColor: "#ffffff",
            color: BRAND.teal,
          }}
        >
          <span className="text-xs font-extrabold">{initials}</span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm leading-tight truncate">
            {student.full_name}
          </div>
          <div
            className="text-[10px] font-mono truncate"
            style={{ color: "rgba(255,255,255,0.75)" }}
          >
            {student.external_id ?? "—"}
          </div>
        </div>
      </div>

      {/* Learning Style row */}
      <div className="flex items-center justify-between mt-3.5 text-xs">
        <span className="font-bold">Learning Style</span>
        {pole ? (
          <span
            className="px-2 py-0.5 rounded-full text-[10px] font-bold"
            style={{
              backgroundColor: BRAND.tealLight,
              color: BRAND.tealDark,
            }}
          >
            {pole}
          </span>
        ) : (
          <span
            className="text-[10px] italic"
            style={{ color: "rgba(255,255,255,0.7)" }}
          >
            No profile
          </span>
        )}
      </div>

      {/* Engagement row */}
      <div className="flex items-center justify-between mt-2 mb-1.5 text-xs">
        <span className="font-bold">Engagement</span>
        <span className="font-bold">
          {engagement != null ? `${engagement}%` : "—"}
        </span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: "rgba(255,255,255,0.18)" }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${engagement ?? 0}%`,
            backgroundColor: "#ffffff",
            transition: "width 0.3s",
          }}
        />
      </div>
    </button>
  );
}

// ─── Student detail (shown when a card is clicked) ───────────────────────
function StudentDetail({
  student,
  onBack,
}: {
  student: Row;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        style={{ color: BRAND.teal }}
      >
        <ArrowLeft size={15} />
        Back to students
      </button>

      {/* Profile panel */}
      <div
        className="rounded-3xl bg-white p-6 md:p-8 space-y-6"
        style={{ border: `2px solid ${BRAND.teal}` }}
      >
        {/* Header */}
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div className="flex items-start gap-4 min-w-0">
            <div
              className="w-14 h-14 rounded-full shrink-0 grid place-items-center"
              style={{ backgroundColor: BRAND.tealLight }}
            >
              <span
                className="text-lg font-extrabold"
                style={{ color: BRAND.teal }}
              >
                {student.full_name
                  .split(" ")
                  .map((p) => p[0])
                  .slice(0, 2)
                  .join("")}
              </span>
            </div>
            <div className="min-w-0">
              <h2
                className="text-2xl font-extrabold tracking-tight"
                style={{ color: BRAND.textHeading }}
              >
                {student.full_name}
              </h2>
              <p
                className="text-sm font-mono"
                style={{ color: BRAND.textMuted }}
              >
                {student.external_id ?? "—"}
                {student.email && (
                  <>
                    {" · "}
                    {student.email}
                  </>
                )}
              </p>
              {student.profile && (
                <p
                  className="text-xs mt-1"
                  style={{ color: BRAND.textMuted }}
                >
                  Profile v{student.profile.version} &middot; scored{" "}
                  {new Date(student.profile.scored_at).toLocaleDateString()}
                </p>
              )}
            </div>
          </div>
          {student.profile?.dominant_axis && (
            <Badge text={student.profile.dominant_axis} />
          )}
        </div>

        {/* FSLSM scores */}
        {student.profile ? (
          <div>
            <h3
              className="text-sm font-semibold mb-3"
              style={{ color: BRAND.textMuted }}
            >
              FSLSM Axis Scores (signed integers, −11 to +11)
            </h3>
            <FslsmBars
              active_reflective_score={
                student.profile.active_reflective_score
              }
              sensing_intuitive_score={student.profile.sensing_intuitive_score}
              visual_verbal_score={student.profile.visual_verbal_score}
              sequential_global_score={
                student.profile.sequential_global_score
              }
            />
          </div>
        ) : (
          <p
            className="text-sm italic"
            style={{ color: BRAND.textMuted }}
          >
            No survey responses yet — profile will appear once data is
            ingested.
          </p>
        )}

        {/* Dominant axis note */}
        {student.profile?.dominant_axis && (
          <div
            className="rounded-xl p-4 text-sm"
            style={{
              backgroundColor: BRAND.tealLight,
              border: `1px solid ${BRAND.teal}33`,
              color: BRAND.tealDark,
            }}
          >
            Dominant axis:{" "}
            <strong>
              {FSLSM_AXES[student.profile.dominant_axis].label}
            </strong>
            . This profile is{" "}
            <strong>version {student.profile.version}</strong>; retaking the
            survey produces a new version while preserving history.
          </div>
        )}

        {/* Aux profile */}
        {student.aux && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: BRAND.subtleBg }}
            >
              <div className="text-xs" style={{ color: BRAND.textMuted }}>
                Collaboration Preference
              </div>
              <div
                className="text-sm font-semibold capitalize mt-1"
                style={{ color: BRAND.text }}
              >
                {student.aux.collaboration_pref ?? "—"}
              </div>
            </div>
            <div
              className="rounded-xl p-4"
              style={{ backgroundColor: BRAND.subtleBg }}
            >
              <div className="text-xs" style={{ color: BRAND.textMuted }}>
                Participation Level
              </div>
              <div
                className="text-sm font-semibold capitalize mt-1"
                style={{ color: BRAND.text }}
              >
                {student.aux.participation_level ?? "—"}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

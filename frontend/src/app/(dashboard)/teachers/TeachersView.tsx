"use client";

import Badge from "@/components/Badge";
import CreateTeacherModal from "@/components/CreateTeacherModal";
import EmptyState from "@/components/EmptyState";
import { BRAND } from "@/lib/brand";
import { GraduationCap, Plus } from "lucide-react";
import { useState } from "react";

interface Teacher {
  id: string;
  full_name: string;
  email: string;
  profiles: Array<{
    version: number;
    is_current: boolean;
    teaching_style: string | null;
    interaction_level: string;
    pacing: string;
    approach: string | null;
  }>;
}

export default function TeachersView({ teachers }: { teachers: Teacher[] }) {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const rows = (teachers ?? []).map((t) => ({
    ...t,
    profile: (t.profiles ?? []).find((p) => p.is_current) ?? null,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <CreateTeacherModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSuccess={() => {
          setShowCreateModal(false);
          window.location.reload();
        }}
      />

      <div className="flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-2xl font-bold" style={{ color: BRAND.text }}>
            Teacher Profiles
          </h1>
          <p className="text-sm mt-1" style={{ color: BRAND.textMuted }}>
            Teaching-style profiles captured through surveys. Used by the
            compatibility engine to score teacher-class alignment.
          </p>
        </div>
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-white whitespace-nowrap ml-4 shrink-0"
          style={{ backgroundColor: BRAND.teal }}
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={18} />
          Create Teacher
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No teacher profiles yet"
          description="Once teachers complete the teaching-style survey, their profiles will appear here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-5">
          {rows.map((t) => (
            <div
              key={t.id}
              className="rounded-2xl shadow-sm p-6 bg-white"
              style={{ border: `1px solid ${BRAND.cardBorder}` }}
            >
              <div className="flex items-start justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <h2
                    className="text-lg font-bold"
                    style={{ color: BRAND.text }}
                  >
                    {t.full_name}
                  </h2>
                  <p
                    className="text-sm mt-1"
                    style={{ color: BRAND.textMuted }}
                  >
                    {t.profile?.teaching_style ?? "Profile not yet collected"}
                    {" · "}
                    <span className="font-mono text-xs">{t.email}</span>
                  </p>
                </div>
                {t.profile && (
                  <Badge text={t.profile.interaction_level} />
                )}
              </div>

              {t.profile && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5">
                  <div
                    className="rounded-lg p-4"
                    style={{ backgroundColor: BRAND.subtleBg }}
                  >
                    <div
                      className="text-xs"
                      style={{ color: BRAND.textMuted }}
                    >
                      Interaction Level
                    </div>
                    <div
                      className="text-sm font-semibold capitalize mt-1"
                      style={{ color: BRAND.text }}
                    >
                      {t.profile.interaction_level}
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-4"
                    style={{ backgroundColor: BRAND.subtleBg }}
                  >
                    <div
                      className="text-xs"
                      style={{ color: BRAND.textMuted }}
                    >
                      Pacing
                    </div>
                    <div
                      className="text-sm font-semibold capitalize mt-1"
                      style={{ color: BRAND.text }}
                    >
                      {t.profile.pacing}
                    </div>
                  </div>
                  <div
                    className="rounded-lg p-4"
                    style={{ backgroundColor: BRAND.subtleBg }}
                  >
                    <div
                      className="text-xs"
                      style={{ color: BRAND.textMuted }}
                    >
                      Approach
                    </div>
                    <div
                      className="text-sm mt-1"
                      style={{ color: BRAND.text }}
                    >
                      {t.profile.approach ?? "—"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

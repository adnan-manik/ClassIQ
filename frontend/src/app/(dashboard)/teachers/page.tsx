import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { GraduationCap } from "lucide-react";

export default async function TeachersPage() {
  const supabase = await createClient();

  const { data: teachers } = await supabase
    .from("teachers")
    .select(
      `
        id, full_name, email,
        profiles:teacher_profiles!teacher_profiles_teacher_id_fkey(
          version, is_current, teaching_style, interaction_level, pacing, approach
        )
      `,
    )
    .order("full_name");

  const rows = (teachers ?? []).map((t) => ({
    ...t,
    profile: (t.profiles ?? []).find((p) => p.is_current) ?? null,
  }));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: BRAND.text }}>
          Teacher Profiles
        </h1>
        <p className="text-sm mt-1" style={{ color: BRAND.textMuted }}>
          Teaching-style profiles captured through surveys. Used by the
          compatibility engine to score teacher-class alignment.
        </p>
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

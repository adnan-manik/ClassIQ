import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import ScoreRing from "@/components/ScoreRing";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { FSLSM_AXES, type FslsmAxis } from "@/lib/types";
import { Download, FileBarChart, Printer } from "lucide-react";

export default async function ReportsPage() {
  const supabase = await createClient();

  const { data: results } = await supabase
    .from("simulation_results")
    .select(
      `
        id, compatibility_score, predicted_outcome, social_graph_impact,
        style_distribution, recommended_teacher_id, created_at,
        section:sections(
          id, label,
          course:courses(code, name),
          teacher:teachers(id, full_name)
        ),
        recommended:teachers!simulation_results_recommended_teacher_id_fkey(full_name),
        factors:simulation_result_factors(factor_name, score, weight, impact)
      `,
    )
    .not("section_id", "is", null)
    .order("created_at", { ascending: false });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: BRAND.text }}
          >
            Simulation Reports
          </h1>
          <p className="text-sm mt-1" style={{ color: BRAND.textMuted }}>
            Per-section output after the compatibility scoring engine runs.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white"
            style={{
              border: `1px solid ${BRAND.cardBorder}`,
              color: BRAND.text,
            }}
          >
            <Download size={15} /> Export PDF
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white"
            style={{
              border: `1px solid ${BRAND.cardBorder}`,
              color: BRAND.text,
            }}
          >
            <Printer size={15} /> Print
          </button>
        </div>
      </div>

      {!results || results.length === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title="No simulation reports yet"
          description="Reports appear here after running simulations on draft sections."
        />
      ) : (
        results.map((r) => {
          type Tr = { id?: string; full_name: string };
          type Co = { code: string; name: string };
          type Se = {
            id: string;
            label: string;
            course: Co | Co[];
            teacher: Tr | Tr[];
          };
          const sec = (Array.isArray(r.section)
            ? r.section[0]
            : r.section) as Se | null;
          const course = (Array.isArray(sec?.course)
            ? sec?.course[0]
            : sec?.course) as Co | null;
          const teacher = (Array.isArray(sec?.teacher)
            ? sec?.teacher[0]
            : sec?.teacher) as Tr | null;
          const recommended = (Array.isArray(r.recommended)
            ? r.recommended[0]
            : r.recommended) as Tr | null;

          const dist = r.style_distribution as Record<
            string,
            Record<string, number>
          > | null;

          return (
            <div
              key={r.id}
              className="rounded-2xl shadow-sm p-6 space-y-6 bg-white"
              style={{ border: `1px solid ${BRAND.cardBorder}` }}
            >
              {/* Header */}
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="min-w-0">
                  <h2
                    className="text-xl font-bold"
                    style={{ color: BRAND.text }}
                  >
                    {course?.code} &mdash; Section {sec?.label}
                  </h2>
                  <p
                    className="text-sm mt-1"
                    style={{ color: BRAND.textMuted }}
                  >
                    {course?.name} &middot; Teacher: {teacher?.full_name ?? "—"}
                  </p>
                </div>
                <ScoreRing
                  score={r.compatibility_score}
                  size={110}
                  label="Compatibility Score"
                />
              </div>

              <hr style={{ borderColor: BRAND.cardBorder }} />

              {/* FSLSM style distribution */}
              {dist && (
                <div>
                  <h3
                    className="text-sm font-semibold mb-3"
                    style={{ color: BRAND.textMuted }}
                  >
                    Class FSLSM Distribution
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {(Object.keys(FSLSM_AXES) as FslsmAxis[]).map((axis) => {
                      const meta = FSLSM_AXES[axis];
                      const axisDist = dist[axis] ?? {};
                      const [poleAKey, poleBKey] = Object.keys(axisDist);
                      const poleAval = axisDist[poleAKey] ?? 0;
                      const poleBval = axisDist[poleBKey] ?? 0;
                      return (
                        <div
                          key={axis}
                          className="rounded-xl p-4"
                          style={{ backgroundColor: BRAND.subtleBg }}
                        >
                          <div
                            className="text-xs font-medium mb-2"
                            style={{ color: BRAND.textMuted }}
                          >
                            {meta.label}
                          </div>
                          <div
                            className="flex h-3 rounded-full overflow-hidden"
                            style={{ backgroundColor: "white" }}
                          >
                            <div
                              style={{
                                width: `${poleAval}%`,
                                backgroundColor: meta.color,
                              }}
                            />
                            <div
                              style={{
                                width: `${poleBval}%`,
                                backgroundColor: `${meta.color}66`,
                              }}
                            />
                          </div>
                          <div
                            className="flex justify-between text-[11px] mt-1.5"
                            style={{ color: BRAND.textMuted }}
                          >
                            <span>
                              {poleAKey} {poleAval}%
                            </span>
                            <span>
                              {poleBKey} {poleBval}%
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Factor breakdown */}
              <div>
                <h3
                  className="text-sm font-semibold mb-3"
                  style={{ color: BRAND.textMuted }}
                >
                  Scoring Factor Breakdown
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {(r.factors ?? []).map((f) => (
                    <div
                      key={f.factor_name}
                      className="flex items-center gap-3 rounded-xl p-3"
                      style={{ backgroundColor: BRAND.subtleBg }}
                    >
                      <div className="flex-1 min-w-0">
                        <div
                          className="text-sm font-medium"
                          style={{ color: BRAND.text }}
                        >
                          {f.factor_name}
                        </div>
                        <div
                          className="rounded-full h-2 mt-1.5 overflow-hidden"
                          style={{ backgroundColor: "#fff" }}
                        >
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${f.score}%`,
                              backgroundColor:
                                f.impact === "positive"
                                  ? BRAND.scoreHigh
                                  : f.impact === "negative"
                                    ? BRAND.scoreLow
                                    : BRAND.scoreMid,
                            }}
                          />
                        </div>
                        <div
                          className="text-[11px] mt-1"
                          style={{ color: BRAND.textSubtle }}
                        >
                          weight {(f.weight * 100).toFixed(0)}%
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className="text-lg font-bold"
                          style={{ color: BRAND.text }}
                        >
                          {f.score}
                        </div>
                        <Badge text={f.impact} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div
                  className="rounded-xl p-4 text-center"
                  style={{ backgroundColor: BRAND.subtleBg }}
                >
                  <div
                    className="text-xs"
                    style={{ color: BRAND.textMuted }}
                  >
                    Predicted Outcome
                  </div>
                  <div className="mt-1">
                    <Badge text={r.predicted_outcome} />
                  </div>
                </div>
                <div
                  className="rounded-xl p-4 text-center"
                  style={{ backgroundColor: BRAND.subtleBg }}
                >
                  <div
                    className="text-xs"
                    style={{ color: BRAND.textMuted }}
                  >
                    Social Graph Impact
                  </div>
                  <div className="mt-1">
                    <Badge text={r.social_graph_impact} />
                  </div>
                </div>
                <div
                  className="rounded-xl p-4 text-center"
                  style={{ backgroundColor: BRAND.subtleBg }}
                >
                  <div
                    className="text-xs"
                    style={{ color: BRAND.textMuted }}
                  >
                    Recommended Teacher
                  </div>
                  <div
                    className="text-sm font-semibold mt-1"
                    style={{ color: BRAND.text }}
                  >
                    {recommended?.full_name ?? "—"}
                  </div>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

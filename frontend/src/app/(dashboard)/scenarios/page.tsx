import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import ScoreRing from "@/components/ScoreRing";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { ArrowLeftRight, FlaskConical, Plus } from "lucide-react";

export default async function ScenariosPage() {
  const supabase = await createClient();

  const { data: scenarios } = await supabase
    .from("scenarios")
    .select("id, name, status, notes, created_at")
    .order("created_at", { ascending: false });

  // For demo: show the live (real-section) results as a baseline "Current"
  // scenario alongside scenario-based results. F5's centrepiece is comparing
  // multiple named scenarios — once HoDs create what-ifs in the builder, this
  // page shows them side by side.
  const { data: liveResults } = await supabase
    .from("simulation_results")
    .select(
      `
        compatibility_score, predicted_outcome, social_graph_impact,
        section:sections(id, label, course:courses(code, name),
          teacher:teachers(full_name)
        ),
        factors:simulation_result_factors(factor_name, score, impact)
      `,
    )
    .not("section_id", "is", null);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1
            className="text-2xl font-bold"
            style={{ color: BRAND.text }}
          >
            What-If Scenario Testing
          </h1>
          <p className="text-sm mt-1" style={{ color: BRAND.textMuted }}>
            Compose alternative teacher and student configurations, run them
            through the scoring engine, and compare side by side before
            committing.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-white"
          style={{ backgroundColor: BRAND.teal }}
        >
          <Plus size={16} /> New Scenario
        </button>
      </div>

      {/* Baseline view */}
      <div
        className="rounded-2xl shadow-sm p-6 bg-white"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <div className="flex items-center justify-between mb-4">
          <h2
            className="text-lg font-semibold"
            style={{ color: BRAND.text }}
          >
            Current Assignment (Baseline)
          </h2>
          <span
            className="text-xs uppercase tracking-wider font-semibold"
            style={{ color: BRAND.textMuted }}
          >
            Live data
          </span>
        </div>

        {!liveResults || liveResults.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No simulation results yet"
            description="Run a simulation in the Section Builder to populate this comparison."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {liveResults.map((r, idx) => {
              type Tr = { full_name: string };
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

              return (
                <div
                  key={idx}
                  className="rounded-xl p-5 space-y-4"
                  style={{ border: `1px solid ${BRAND.cardBorder}` }}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="font-semibold"
                        style={{ color: BRAND.text }}
                      >
                        {course?.code} &mdash; Section {sec?.label}
                      </div>
                      <div
                        className="text-sm truncate"
                        style={{ color: BRAND.textMuted }}
                      >
                        {teacher?.full_name ?? "Unassigned"}
                      </div>
                    </div>
                    <ScoreRing
                      score={r.compatibility_score}
                      size={80}
                    />
                  </div>

                  <div className="space-y-1.5">
                    {(r.factors ?? []).map((f) => (
                      <div
                        key={f.factor_name}
                        className="flex items-center gap-2"
                      >
                        <span
                          className="w-32 text-xs truncate"
                          style={{ color: BRAND.textMuted }}
                        >
                          {f.factor_name}
                        </span>
                        <div
                          className="flex-1 rounded-full h-2.5 overflow-hidden"
                          style={{ backgroundColor: BRAND.subtleBg }}
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
                        <span
                          className="w-8 text-xs text-right"
                          style={{ color: BRAND.textMuted }}
                        >
                          {f.score}
                        </span>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Badge text={`Outcome: ${r.predicted_outcome}`} />
                    <Badge text={r.social_graph_impact} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Saved scenarios */}
      <div
        className="rounded-2xl shadow-sm p-6 bg-white"
        style={{ border: `1px solid ${BRAND.cardBorder}` }}
      >
        <div className="flex items-center gap-2 mb-3">
          <ArrowLeftRight size={18} style={{ color: BRAND.teal }} />
          <h2
            className="text-lg font-semibold"
            style={{ color: BRAND.text }}
          >
            Saved Scenarios
          </h2>
        </div>
        {!scenarios || scenarios.length === 0 ? (
          <EmptyState
            icon={FlaskConical}
            title="No saved scenarios yet"
            description={
              'Click "New Scenario" to compose an alternative teacher / student assignment and simulate it. Scenarios appear here for side-by-side comparison.'
            }
          />
        ) : (
          <ul className="divide-y divide-slate-100">
            {scenarios.map((s) => (
              <li
                key={s.id}
                className="py-3 flex items-center justify-between"
              >
                <div className="min-w-0 pr-4">
                  <div
                    className="font-medium truncate"
                    style={{ color: BRAND.text }}
                  >
                    {s.name}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: BRAND.textMuted }}
                  >
                    Created{" "}
                    {new Date(s.created_at).toLocaleDateString(undefined, {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </div>
                </div>
                <Badge text={s.status} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

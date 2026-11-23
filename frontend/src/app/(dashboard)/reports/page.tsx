import Badge from "@/components/Badge";
import EmptyState from "@/components/EmptyState";
import ScoreRing from "@/components/ScoreRing";
import { BRAND } from "@/lib/brand";
import { pageSummary, pageWindow } from "@/lib/paging";
import { createClient } from "@/lib/supabase/server";
import { FSLSM_AXES, type FslsmAxis } from "@/lib/types";
import { ChevronLeft, ChevronRight, FileBarChart } from "lucide-react";
import Link from "next/link";
import ReportActions from "./ReportActions";
import ReportSectionFilter from "./ReportSectionFilter";

const PER_PAGE = 25;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();

  const params = await searchParams;
  const { page, from, to } = pageWindow(params.page, PER_PAGE);
  // `?section=` is untrusted text; anything that isn't a UUID means "all".
  const rawSection = Array.isArray(params.section) ? params.section[0] : params.section;
  const sectionId = rawSection && UUID_RE.test(rawSection) ? rawSection : "";

  // Every section the viewer can see (RLS-scoped), for the filter dropdown.
  const { data: sectionRows } = await supabase
    .from("sections")
    .select("id, label, state, course:courses(code, name)")
    .order("label");
  const sectionOptions = (sectionRows ?? [])
    .map((s) => {
      type Co = { code: string; name: string };
      const c = (Array.isArray(s.course) ? s.course[0] : s.course) as Co | null;
      return {
        id: s.id as string,
        code: c?.code ?? "",
        label: `${c?.code ?? "—"} — Section ${s.label}`,
        hint: [c?.name, s.state].filter(Boolean).join(" · "),
      };
    })
    .sort((a, b) => a.code.localeCompare(b.code) || a.label.localeCompare(b.label));
  const selectedSection = sectionOptions.find((s) => s.id === sectionId) ?? null;

  // One page at a time. Unbounded, this selected every simulation ever run and
  // dragged each one's nested factor rows along with it, so the landing cost
  // grew with the archive. `count: "exact"` comes back in the same request,
  // which is what lets the pager below know where it is.
  let query = supabase
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
      { count: "exact" },
    )
    .not("section_id", "is", null);
  if (sectionId) query = query.eq("section_id", sectionId);
  const { data: results, count } = await query
    .order("created_at", { ascending: false })
    .range(from, to);

  const total = count ?? 0;
  const shown = results?.length ?? 0;
  // A page past the end comes back empty rather than 404ing; the pager below
  // still offers the way back.
  const { lastPage, firstShown, lastShown } = pageSummary(
    { page, from, to, perPage: PER_PAGE },
    total,
    shown,
  );

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
          {total > 0 && (
            <p className="text-xs mt-1" style={{ color: BRAND.textMuted }}>
              Showing {firstShown}&ndash;{lastShown} of {total}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto">
          <ReportSectionFilter
            sections={sectionOptions.map(({ id, label, hint }) => ({ id, label, hint }))}
            value={selectedSection?.id ?? ""}
          />
          <ReportActions />
        </div>
      </div>

      {shown === 0 ? (
        <EmptyState
          icon={FileBarChart}
          title={
            total === 0
              ? selectedSection
                ? `No reports for ${selectedSection.label} yet`
                : "No simulation reports yet"
              : "Nothing on this page"
          }
          description={
            total === 0
              ? selectedSection
                ? "Run a simulation for this section in Section Builder and its report will appear here."
                : "Reports appear here after running simulations on draft sections."
              : `This archive has ${total} report${total === 1 ? "" : "s"} across ${lastPage} page${lastPage === 1 ? "" : "s"}.`
          }
        />
      ) : (
        (results ?? []).map((r) => {
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
                      // Resolve poles by known key (backend emits lowercased
                      // pole labels), NOT by JSONB key order, which Postgres
                      // does not guarantee — otherwise the two poles can swap.
                      const poleAval = axisDist[meta.poleA.toLowerCase()] ?? 0;
                      const poleBval = axisDist[meta.poleB.toLowerCase()] ?? 0;
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
                              {meta.poleA} {poleAval}%
                            </span>
                            <span>
                              {meta.poleB} {poleBval}%
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

      {lastPage > 1 && (
        <nav
          // Hidden in print, like ReportActions — Print / Export PDF renders
          // what is on screen, so the pager itself must not end up in the PDF.
          className="flex items-center justify-between gap-3 pt-2 print:hidden"
          aria-label="Report pages"
        >
          <PagerLink page={page - 1} disabled={page <= 1} direction="prev" section={sectionId} />
          <span className="text-sm" style={{ color: BRAND.textMuted }}>
            Page {Math.min(page, lastPage)} of {lastPage}
          </span>
          <PagerLink page={page + 1} disabled={page >= lastPage} direction="next" section={sectionId} />
        </nav>
      )}
    </div>
  );
}

function PagerLink({
  page,
  disabled,
  direction,
  section,
}: {
  page: number;
  disabled: boolean;
  direction: "prev" | "next";
  section: string;
}) {
  const label = direction === "prev" ? "Newer" : "Older";
  const Icon = direction === "prev" ? ChevronLeft : ChevronRight;
  const shared = "inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold";

  if (disabled) {
    return (
      <span
        className={shared}
        style={{
          border: `1px solid ${BRAND.cardBorder}`,
          color: BRAND.textMuted,
          opacity: 0.5,
        }}
        aria-disabled="true"
      >
        {direction === "prev" && <Icon size={16} />}
        {label}
        {direction === "next" && <Icon size={16} />}
      </span>
    );
  }

  return (
    <Link
      href={reportsHref(page, section)}
      className={shared}
      style={{
        border: `1px solid ${BRAND.cardBorder}`,
        backgroundColor: BRAND.card,
        color: BRAND.teal,
      }}
    >
      {direction === "prev" && <Icon size={16} />}
      {label}
      {direction === "next" && <Icon size={16} />}
    </Link>
  );
}

function reportsHref(page: number, section: string) {
  const q = new URLSearchParams();
  if (section) q.set("section", section);
  if (page > 1) q.set("page", String(page));
  const qs = q.toString();
  return qs ? `/reports?${qs}` : "/reports";
}

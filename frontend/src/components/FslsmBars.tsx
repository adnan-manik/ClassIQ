import { BRAND } from "@/lib/brand";
import { FSLSM_AXES, type FslsmAxis, strengthLabel } from "@/lib/types";

interface Props {
  active_reflective_score: number;
  sensing_intuitive_score: number;
  visual_verbal_score: number;
  sequential_global_score: number;
  dense?: boolean;
}

type ScoreField =
  | "active_reflective_score"
  | "sensing_intuitive_score"
  | "visual_verbal_score"
  | "sequential_global_score";

const AXIS_KEYS: { axis: FslsmAxis; field: ScoreField }[] = [
  { axis: "active_reflective", field: "active_reflective_score" },
  { axis: "sensing_intuitive", field: "sensing_intuitive_score" },
  { axis: "visual_verbal", field: "visual_verbal_score" },
  { axis: "sequential_global", field: "sequential_global_score" },
];

/**
 * Render the 4 FSLSM axes as bipolar bars.
 * Score is odd integer −11..+11. Negative = pole A, Positive = pole B.
 * (Per Felder ILS convention: A-count minus B-count, so positive numbers
 *  actually mean pole A. We flip the visual axis so pole A reads left.)
 */
export default function FslsmBars({
  active_reflective_score,
  sensing_intuitive_score,
  visual_verbal_score,
  sequential_global_score,
  dense = false,
}: Props) {
  const scores = {
    active_reflective_score,
    sensing_intuitive_score,
    visual_verbal_score,
    sequential_global_score,
  };
  const rowGap = dense ? "py-1" : "py-2";

  return (
    <div className="space-y-1">
      {AXIS_KEYS.map(({ axis, field }) => {
        const score = scores[field];
        const meta = FSLSM_AXES[axis];
        const strength = strengthLabel(score);
        // Pole A = positive score, Pole B = negative (per Felder ILS A−B convention)
        const onPoleA = score > 0;
        const magnitude = Math.abs(score);
        const pctOffCenter = (magnitude / 11) * 50;

        return (
          <div key={axis} className={`${rowGap}`}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span style={{ color: BRAND.textMuted }}>{meta.poleA}</span>
              <span
                className="font-semibold"
                style={{ color: meta.color }}
              >
                {score > 0 ? "+" : ""}
                {score}
                <span
                  className="ml-1.5 font-normal"
                  style={{ color: BRAND.textSubtle }}
                >
                  {strength}
                </span>
              </span>
              <span style={{ color: BRAND.textMuted }}>{meta.poleB}</span>
            </div>
            <div
              className="relative h-2 rounded-full overflow-hidden"
              style={{ backgroundColor: BRAND.subtleBg }}
            >
              <div
                className="absolute top-0 bottom-0"
                style={{
                  width: `${pctOffCenter}%`,
                  backgroundColor: meta.color,
                  left: onPoleA ? `${50 - pctOffCenter}%` : "50%",
                }}
              />
              <div
                className="absolute top-0 bottom-0 w-px"
                style={{ left: "50%", backgroundColor: BRAND.tealLight }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

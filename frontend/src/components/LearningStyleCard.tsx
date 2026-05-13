import { BRAND } from "@/lib/brand";

export interface LearningStyleCardProps {
  title: string;
  description: string;
  studentCount: number;
  /** Percentage 0..100 to render on the donut (e.g., share of class dominant on this axis). */
  percent: number;
  /** Foreground arc color */
  primary: string;
  /** Background arc color */
  secondary: string;
}

export default function LearningStyleCard({
  title,
  description,
  studentCount,
  percent,
  primary,
  secondary,
}: LearningStyleCardProps) {
  // Donut math
  const size = 64;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const c = 2 * Math.PI * radius;
  const offset = c - (Math.max(0, Math.min(percent, 100)) / 100) * c;

  return (
    <div
      className="rounded-2xl bg-white p-5 flex items-start gap-4 shadow-sm"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      {/* Avatar dot — tinted with the axis's secondary color (matches the donut) */}
      <div
        className="w-6 h-6 rounded-full mt-1 shrink-0"
        style={{ backgroundColor: secondary }}
        aria-hidden="true"
      />

      <div className="flex-1 min-w-0">
        <h3
          className="text-base font-bold leading-tight"
          style={{ color: BRAND.textHeading }}
        >
          {title}
        </h3>
        <p
          className="text-xs mt-1 leading-snug"
          style={{ color: BRAND.textMuted }}
        >
          {description}
        </p>
        <span
          className="inline-block mt-3 px-3 py-1 rounded-full text-[11px] font-semibold"
          style={{
            backgroundColor: BRAND.pinkPastel,
            color: "#8B3737",
          }}
        >
          {studentCount} {studentCount === 1 ? "Student" : "Students"}
        </span>
      </div>

      {/* Donut */}
      <div className="shrink-0">
        <svg width={size} height={size}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={secondary}
            strokeWidth={stroke}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={primary}
            strokeWidth={stroke}
            strokeDasharray={c}
            strokeDashoffset={offset}
            strokeLinecap="round"
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
          <text
            x={size / 2}
            y={size / 2}
            textAnchor="middle"
            dominantBaseline="central"
            fill={BRAND.textHeading}
            fontSize={size * 0.24}
            fontWeight="bold"
          >
            {Math.round(percent)}%
          </text>
        </svg>
      </div>
    </div>
  );
}

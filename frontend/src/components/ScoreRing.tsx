import { BRAND, scoreColor } from "@/lib/brand";

export default function ScoreRing({
  score,
  size = 100,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={BRAND.cardBorder}
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
        <text
          x={size / 2}
          y={size / 2}
          textAnchor="middle"
          dominantBaseline="central"
          className="font-bold"
          fill={BRAND.text}
          fontSize={size * 0.26}
        >
          {score}
        </text>
      </svg>
      {label && (
        <span
          className="text-xs font-medium"
          style={{ color: BRAND.textMuted }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

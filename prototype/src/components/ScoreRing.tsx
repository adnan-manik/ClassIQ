"use client";

import { useTheme } from "@/lib/ThemeContext";

export default function ScoreRing({
  score,
  size = 100,
  label,
}: {
  score: number;
  size?: number;
  label?: string;
}) {
  const { theme } = useTheme();
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 70 ? "#22c55e" : score >= 50 ? "#eab308" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={theme.colors.ringTrack}
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
          fill={theme.colors.pageText}
          fontSize={size * 0.26}
        >
          {score}
        </text>
      </svg>
      {label && (
        <span className="text-xs font-medium" style={{ color: theme.colors.pageMuted }}>
          {label}
        </span>
      )}
    </div>
  );
}

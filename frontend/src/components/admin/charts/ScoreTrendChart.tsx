"use client";

import { BRAND } from "@/lib/brand";
import type { ScoreTrendPoint } from "@/lib/types";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function ScoreTrendChart({ data }: { data: ScoreTrendPoint[] }) {
  const chartData = data.map((p) => ({
    week: new Date(p.bucket_start).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    }),
    avg: Math.round(p.avg_score * 10) / 10,
    runs: p.runs,
  }));

  return (
    <div className="w-full" style={{ height: 280 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.cardBorder} />
          <XAxis dataKey="week" stroke={BRAND.textMuted} fontSize={11} />
          <YAxis
            stroke={BRAND.textMuted}
            fontSize={11}
            domain={[0, 100]}
            allowDecimals={false}
          />
          <Tooltip />
          <Line
            type="monotone"
            dataKey="avg"
            stroke={BRAND.teal}
            strokeWidth={3}
            dot={{ fill: BRAND.teal, r: 4 }}
            name="Avg score"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

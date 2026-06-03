"use client";

import { BRAND } from "@/lib/brand";
import type { FslsmDistributionResp } from "@/lib/types";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export default function FslsmDistributionChart({
  data,
}: {
  data: FslsmDistributionResp;
}) {
  // Two grouped series (pole A vs pole B) per axis. Each axis names its own
  // poles on the X label, so the two bars read clearly without one dataKey per
  // pole (which left most bars empty and risked duplicate React keys).
  const chartData = data.axes.map((a) => ({
    axis: `${a.pole_a_label} / ${a.pole_b_label}`,
    poleA: a.pole_a_count,
    poleB: a.pole_b_count,
    poleALabel: a.pole_a_label,
    poleBLabel: a.pole_b_label,
  }));

  return (
    <div className="w-full" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.cardBorder} />
          <XAxis dataKey="axis" stroke={BRAND.textMuted} fontSize={11} />
          <YAxis stroke={BRAND.textMuted} fontSize={11} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="poleA"
            name="Pole A (active / sensing / visual / sequential)"
            fill={BRAND.teal}
            radius={[6, 6, 0, 0]}
          />
          <Bar
            dataKey="poleB"
            name="Pole B (reflective / intuitive / verbal / global)"
            fill={BRAND.coral}
            radius={[6, 6, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

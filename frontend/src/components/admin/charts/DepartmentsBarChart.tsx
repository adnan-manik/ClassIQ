"use client";

import { BRAND } from "@/lib/brand";
import type { DepartmentRollup } from "@/lib/types";
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

export default function DepartmentsBarChart({
  data,
}: {
  data: DepartmentRollup[];
}) {
  const chartData = data.map((d) => ({
    dept: d.department_code,
    students: d.student_count,
    teachers: d.teacher_count,
    sims: d.simulations_run,
  }));

  return (
    <div className="w-full" style={{ height: 320 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 20, left: 0, bottom: 20 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={BRAND.cardBorder} />
          <XAxis dataKey="dept" stroke={BRAND.textMuted} fontSize={11} />
          <YAxis stroke={BRAND.textMuted} fontSize={11} allowDecimals={false} />
          <Tooltip />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="students" fill={BRAND.coral} name="Students" radius={[4, 4, 0, 0]} />
          <Bar dataKey="teachers" fill={BRAND.teal} name="Teachers" radius={[4, 4, 0, 0]} />
          <Bar dataKey="sims" fill={BRAND.amber} name="Simulations" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

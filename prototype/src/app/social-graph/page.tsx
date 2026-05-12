"use client";

import { students, relationships, getStudent } from "@/lib/mock-data";
import { useTheme } from "@/lib/ThemeContext";
import Badge from "@/components/Badge";

function getNodePositions(count: number, cx: number, cy: number, r: number) {
  return Array.from({ length: count }, (_, i) => {
    const angle = (2 * Math.PI * i) / count - Math.PI / 2;
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  });
}

const edgeColors: Record<string, string> = {
  friend: "#3b82f6",
  study_partner: "#8b5cf6",
  neutral: "#94a3b8",
  conflict: "#ef4444",
};

export default function SocialGraphPage() {
  const { theme } = useTheme();
  const c = theme.colors;
  const w = 700, h = 500, cx = w / 2, cy = h / 2, r = 190;
  const positions = getNodePositions(students.length, cx, cy, r);
  const indexMap = new Map(students.map((s, i) => [s.id, i]));

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: c.pageText }}>Social Relationship Graph</h1>
        <p className="text-sm mt-1" style={{ color: c.pageMuted }}>
          Peer relationships collected via survey. Edges influence the compatibility scoring engine.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Graph */}
        <div className="col-span-2 rounded-xl shadow-sm p-4" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-auto">
            {relationships.map((rel, i) => {
              const fromIdx = indexMap.get(rel.from);
              const toIdx = indexMap.get(rel.to);
              if (fromIdx === undefined || toIdx === undefined) return null;
              return (
                <line
                  key={i}
                  x1={positions[fromIdx].x} y1={positions[fromIdx].y}
                  x2={positions[toIdx].x} y2={positions[toIdx].y}
                  stroke={edgeColors[rel.type]}
                  strokeWidth={rel.strength * 0.8}
                  strokeOpacity={0.6}
                />
              );
            })}
            {students.map((s, i) => (
              <g key={s.id}>
                <circle cx={positions[i].x} cy={positions[i].y} r={20} fill={c.primary} stroke={c.cardBg} strokeWidth={2} />
                <text x={positions[i].x} y={positions[i].y} textAnchor="middle" dominantBaseline="central" fill={c.primaryText} fontSize={9} fontWeight="bold">
                  {s.name.split(" ")[0]}
                </text>
                <text x={positions[i].x} y={positions[i].y + 30} textAnchor="middle" fill={c.pageMuted} fontSize={10}>
                  {s.dominantStyle}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          <div className="rounded-xl shadow-sm p-5" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Edge Types</h3>
            <div className="space-y-2">
              {(["friend", "study_partner", "conflict", "neutral"] as const).map((type) => (
                <div key={type} className="flex items-center gap-2">
                  <div className="w-6 h-1 rounded-full" style={{ backgroundColor: edgeColors[type] }} />
                  <span className="text-sm capitalize" style={{ color: c.pageMuted }}>{type.replace("_", " ")}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-xl shadow-sm p-5" style={{ backgroundColor: c.cardBg, border: `1px solid ${c.cardBorder}` }}>
            <h3 className="text-sm font-semibold mb-3" style={{ color: c.pageMuted }}>Relationships ({relationships.length})</h3>
            <ul className="space-y-2 max-h-80 overflow-auto">
              {relationships.map((rel, i) => {
                const from = getStudent(rel.from);
                const to = getStudent(rel.to);
                return (
                  <li key={i} className="flex items-center justify-between text-sm">
                    <span style={{ color: c.pageText }}>
                      {from?.name.split(" ")[0]} &rarr; {to?.name.split(" ")[0]}
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge text={rel.type} />
                      <span className="text-xs" style={{ color: c.pageMuted }}>{rel.strength}/5</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="rounded-lg p-4 text-sm" style={{ backgroundColor: c.infoBg, border: `1px solid ${c.infoBorder}`, color: c.infoText }}>
            In production, this graph is computed by <strong>NetworkX</strong> on the backend. Clustering coefficients and centrality scores are fed into the compatibility engine.
          </div>
        </div>
      </div>
    </div>
  );
}

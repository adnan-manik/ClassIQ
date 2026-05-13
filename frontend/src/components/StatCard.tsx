import { BRAND } from "@/lib/brand";
import type { LucideIcon } from "lucide-react";

export default function StatCard({
  label,
  value,
  icon: Icon,
  accent = BRAND.coral,
}: {
  label: string;
  value: string | number;
  icon: LucideIcon;
  accent?: string;
}) {
  return (
    <div
      className="rounded-2xl px-5 py-4 bg-white"
      style={{ border: `1px solid ${BRAND.cardBorder}` }}
    >
      <div
        className="text-sm font-semibold mb-2"
        style={{ color: BRAND.text }}
      >
        {label}
      </div>
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-xl grid place-items-center shrink-0"
          style={{ backgroundColor: `${accent}22` }}
        >
          <Icon size={18} style={{ color: accent }} strokeWidth={2.5} />
        </div>
        <div
          className="text-3xl font-extrabold leading-none"
          style={{ color: BRAND.textHeading }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

import { BRAND } from "@/lib/brand";
import type { LucideIcon } from "lucide-react";

export default function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className="rounded-2xl p-12 text-center bg-white"
      style={{ border: `1px dashed ${BRAND.cardBorder}` }}
    >
      <div
        className="w-14 h-14 rounded-full grid place-items-center mx-auto mb-4"
        style={{ backgroundColor: BRAND.tealLight }}
      >
        <Icon size={24} style={{ color: BRAND.teal }} />
      </div>
      <h3 className="font-semibold text-base mb-1" style={{ color: BRAND.text }}>
        {title}
      </h3>
      <p
        className="text-sm max-w-sm mx-auto"
        style={{ color: BRAND.textMuted }}
      >
        {description}
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

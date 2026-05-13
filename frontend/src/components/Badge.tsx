const VARIANTS: Record<string, string> = {
  // outcome
  high: "bg-emerald-100 text-emerald-800",
  medium: "bg-amber-100 text-amber-800",
  low: "bg-rose-100 text-rose-800",
  // social impact
  supportive: "bg-emerald-100 text-emerald-800",
  neutral: "bg-slate-100 text-slate-700",
  hindering: "bg-rose-100 text-rose-800",
  // section state
  draft: "bg-slate-100 text-slate-700",
  simulated: "bg-indigo-100 text-indigo-800",
  active: "bg-emerald-100 text-emerald-800",
  archived: "bg-zinc-200 text-zinc-700",
  // factor impact
  positive: "bg-emerald-100 text-emerald-800",
  negative: "bg-rose-100 text-rose-800",
  // peer relationship
  friend: "bg-sky-100 text-sky-800",
  study_partner: "bg-violet-100 text-violet-800",
  conflict: "bg-rose-100 text-rose-800",
  // FSLSM axes
  active_reflective: "bg-teal-100 text-teal-800",
  sensing_intuitive: "bg-amber-100 text-amber-800",
  visual_verbal: "bg-indigo-100 text-indigo-800",
  sequential_global: "bg-orange-100 text-orange-800",
};

export default function Badge({
  text,
  className = "",
}: {
  text: string;
  className?: string;
}) {
  const variant = VARIANTS[text.toLowerCase()] ?? "bg-slate-100 text-slate-700";
  return (
    <span
      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${variant} ${className}`}
    >
      {text.replace(/_/g, " ")}
    </span>
  );
}

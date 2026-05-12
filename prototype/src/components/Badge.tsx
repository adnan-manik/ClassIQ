const variants: Record<string, string> = {
  high: "bg-green-100 text-green-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-red-100 text-red-800",
  supportive: "bg-green-100 text-green-800",
  neutral: "bg-gray-100 text-gray-700",
  hindering: "bg-red-100 text-red-800",
  draft: "bg-gray-100 text-gray-700",
  simulated: "bg-blue-100 text-blue-800",
  active: "bg-green-100 text-green-800",
  positive: "bg-green-100 text-green-800",
  negative: "bg-red-100 text-red-800",
  friend: "bg-blue-100 text-blue-700",
  study_partner: "bg-purple-100 text-purple-700",
  conflict: "bg-red-100 text-red-700",
  visual: "bg-indigo-100 text-indigo-800",
  auditory: "bg-amber-100 text-amber-800",
  "read/write": "bg-emerald-100 text-emerald-800",
  kinesthetic: "bg-rose-100 text-rose-800",
};

export default function Badge({ text }: { text: string }) {
  const cls = variants[text.toLowerCase()] ?? "bg-gray-100 text-gray-700";
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${cls}`}>
      {text}
    </span>
  );
}

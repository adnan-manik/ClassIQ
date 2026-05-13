import { BRAND } from "@/lib/brand";

export default function Logo({
  size = "md",
  variant = "default",
}: {
  size?: "sm" | "md" | "lg";
  variant?: "default" | "light";
}) {
  const boxSize = { sm: "h-7 w-7", md: "h-9 w-9", lg: "h-12 w-12" }[size];
  const text = { sm: "text-base", md: "text-xl", lg: "text-2xl" }[size];
  const wordColor =
    variant === "light" ? BRAND.sidebarText : BRAND.purple;

  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`${boxSize} rounded-xl grid place-items-center shrink-0`}
        style={{ backgroundColor: BRAND.teal }}
      >
        <span className="text-white font-extrabold leading-none">C</span>
      </div>
      <span
        className={`${text} font-bold tracking-tight leading-none`}
        style={{ color: wordColor }}
      >
        ClassIQ
      </span>
    </div>
  );
}

import type { ReactNode } from "react";

/** Public survey chrome — mint background + teal accents, matching /login. No sidebar, no auth. */
export default function SurveyShell({
  children,
  footer,
}: {
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main
      className="min-h-screen w-full relative overflow-x-hidden flex flex-col items-center px-3 sm:px-4 py-6 sm:py-10"
      style={{ backgroundColor: "var(--brand-mint)" }}
    >
      <div
        className="absolute -top-32 -right-32 w-72 h-72 sm:w-[28rem] sm:h-[28rem] rounded-full pointer-events-none"
        style={{ backgroundColor: "var(--brand-teal-dark)" }}
        aria-hidden="true"
      />
      <div
        className="absolute -bottom-32 -left-24 w-64 h-64 sm:w-[26rem] sm:h-[26rem] rounded-full pointer-events-none opacity-90"
        style={{ backgroundColor: "var(--brand-teal)" }}
        aria-hidden="true"
      />
      <div className="relative w-full max-w-xl">
        <div className="flex items-center gap-2 mb-4 px-1">
          <div
            className="h-9 w-9 rounded-xl grid place-items-center shrink-0"
            style={{ backgroundColor: "var(--brand-teal)" }}
          >
            <span className="text-white font-extrabold leading-none">C</span>
          </div>
          <span
            className="text-xl font-bold tracking-tight"
            style={{ color: "var(--brand-teal-dark)" }}
          >
            ClassIQ
          </span>
          <span className="text-sm" style={{ color: "var(--brand-input)" }}>
            · Student survey
          </span>
        </div>
        <div
          className="w-full bg-white rounded-[28px] shadow-2xl p-5 sm:p-8"
          style={{ border: "4px solid var(--brand-teal)" }}
        >
          {children}
        </div>
        {footer && <div className="mt-4 text-center text-xs text-slate-600">{footer}</div>}
      </div>
    </main>
  );
}

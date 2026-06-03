"use client";

import { BRAND } from "@/lib/brand";
import { Download, Printer } from "lucide-react";

/**
 * Print / Export controls for the Simulation Reports page.
 *
 * Both use the browser print pipeline — "Print" opens the print dialog, and
 * "Export PDF" opens the same dialog where the user can choose "Save as PDF"
 * (the standard, dependency-free way to export an HTML report).
 */
export default function ReportActions() {
  function handlePrint() {
    window.print();
  }

  return (
    <div className="flex gap-2 print:hidden">
      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white transition hover:opacity-90"
        style={{ border: `1px solid ${BRAND.cardBorder}`, color: BRAND.text }}
      >
        <Download size={15} /> Export PDF
      </button>
      <button
        type="button"
        onClick={handlePrint}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm bg-white transition hover:opacity-90"
        style={{ border: `1px solid ${BRAND.cardBorder}`, color: BRAND.text }}
      >
        <Printer size={15} /> Print
      </button>
    </div>
  );
}

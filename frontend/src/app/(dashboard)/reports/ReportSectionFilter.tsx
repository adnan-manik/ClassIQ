"use client";

import Select from "@/components/Select";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export interface ReportSectionOption {
  id: string;
  label: string;
  hint?: string;
}

/** Narrows the report list to one section via `?section=`; empty = all sections. */
export default function ReportSectionFilter({
  sections,
  value,
}: {
  sections: ReportSectionOption[];
  value: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="print:hidden w-full sm:w-72">
      <Select
        aria-label="Section"
        value={value}
        disabled={pending}
        onChange={(v) =>
          startTransition(() => {
            // A new filter always starts back on page 1.
            router.push(v ? `/reports?section=${encodeURIComponent(v)}` : "/reports");
          })
        }
        searchable={sections.length > 6}
        searchPlaceholder="Course or section…"
        options={[
          { value: "", label: "All sections" },
          ...sections.map((s) => ({ value: s.id, label: s.label, hint: s.hint })),
        ]}
      />
    </div>
  );
}

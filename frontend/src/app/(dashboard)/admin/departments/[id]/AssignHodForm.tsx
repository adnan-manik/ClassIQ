"use client";

import { assignHod, type ActionResult } from "@/app/(dashboard)/admin/_actions";
import { BRAND } from "@/lib/brand";
import type { InstitutionUserListItem } from "@/lib/types";
import { useRouter } from "next/navigation";
import { useActionState, useEffect } from "react";

export default function AssignHodForm({
  departmentId,
  candidates,
  assignedIds,
}: {
  departmentId: string;
  candidates: InstitutionUserListItem[];
  assignedIds: string[];
}) {
  const router = useRouter();
  const assignedSet = new Set(assignedIds);
  const unassigned = candidates.filter((c) => !assignedSet.has(c.id));
  const [state, formAction, pending] = useActionState<
    ActionResult | null,
    FormData
  >(assignHod, null);

  // On success the assigned HoD moves out of the candidate list — refresh so
  // the dropdown and the "assigned" list reflect it immediately.
  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (unassigned.length === 0) {
    return (
      <p
        className="text-xs italic"
        style={{ color: BRAND.textMuted }}
      >
        All HoDs are already assigned. Create more HoD users under Users.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex gap-2 items-end flex-wrap">
      <input type="hidden" name="department_id" value={departmentId} />
      <label className="flex-1 min-w-[200px]">
        <div
          className="text-xs uppercase font-semibold mb-1"
          style={{ color: BRAND.textMuted }}
        >
          Assign HoD
        </div>
        <select
          name="auth_user_id"
          required
          defaultValue=""
          className="w-full px-3 py-2 rounded-lg text-sm outline-none bg-white"
          style={{
            border: `1px solid ${BRAND.inputBorder}`,
            color: BRAND.text,
          }}
        >
          <option value="" disabled>
            — pick an HoD user —
          </option>
          {unassigned.map((c) => (
            <option key={c.id} value={c.id}>
              {c.full_name} ({c.email})
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        disabled={pending}
        className="py-2 px-4 rounded-full text-sm font-semibold text-white disabled:opacity-50"
        style={{ backgroundColor: BRAND.teal }}
      >
        {pending ? "Assigning…" : "Assign"}
      </button>
      {state?.error && (
        <div
          className="text-xs rounded px-3 py-1 w-full"
          style={{
            backgroundColor: "#FEE2E2",
            color: "#991B1B",
          }}
        >
          {state.error}
        </div>
      )}
      {state?.ok && (
        <div
          className="text-xs rounded px-3 py-1 w-full"
          style={{ backgroundColor: BRAND.tealLight, color: BRAND.tealDark }}
        >
          HoD assigned.
        </div>
      )}
    </form>
  );
}

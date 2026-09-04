"use server";

import { ApiError, serverFetch } from "@/lib/api.server";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

/**
 * Create a course through the FastAPI backend (audited, tenant-scoped).
 * The backend picks the HoD's own department when none is given.
 */
export async function createCourse(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const department_id = String(formData.get("department_id") ?? "").trim();

  if (!code || !name) {
    return { ok: false, error: "Course code and name are required." };
  }

  try {
    const data = await serverFetch("/api/institution/courses", {
      method: "POST",
      body: JSON.stringify({
        code,
        name,
        department_id: department_id || undefined,
      }),
    });
    revalidatePath("/sections");
    revalidatePath("/scenarios");
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: err.message };
    return {
      ok: false,
      error: "Could not reach the backend — is FastAPI running on :8000?",
    };
  }
}

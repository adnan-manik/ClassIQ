"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

export async function createCourse(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const code = String(formData.get("code") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();

  if (!code || !name) {
    return { ok: false, error: "Course code and name are required." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { ok: false, error: "Not authenticated" };
  }

  // Find user's institution
  const { data: authUser, error: authErr } = await supabase
    .from("auth_users")
    .select("institution_id")
    .eq("id", user.id)
    .single();

  if (authErr || !authUser) {
    return { ok: false, error: "Could not fetch user profile." };
  }

  // Find user's department
  const { data: userDepts, error: deptErr } = await supabase
    .from("user_departments")
    .select("department_id")
    .eq("auth_user_id", user.id);

  let department_id: string;

  if (deptErr || !userDepts || userDepts.length === 0) {
    const { data: fallbackDept } = await supabase
      .from("departments")
      .select("id")
      .eq("institution_id", authUser.institution_id)
      .limit(1)
      .single();

    if (!fallbackDept) {
      return { ok: false, error: "No departments found in your institution. Please ask an Admin to create one." };
    }
    department_id = fallbackDept.id;
  } else {
    department_id = userDepts[0].department_id;
  }

  const { data: inserted, error: insertErr } = await supabase
    .from("courses")
    .insert({
      institution_id: authUser.institution_id,
      department_id,
      code,
      name,
    })
    .select("id")
    .single();

  if (insertErr) {
    return { ok: false, error: insertErr.message || "Failed to create course" };
  }

  revalidatePath("/sections");
  return { ok: true, data: inserted };
}

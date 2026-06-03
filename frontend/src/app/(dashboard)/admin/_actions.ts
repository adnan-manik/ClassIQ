"use server";

/**
 * Server Actions for the /admin/* panel.
 *
 * Each action validates the form payload, calls the FastAPI backend via
 * serverFetch (which forwards the Supabase JWT), and revalidates the
 * relevant routes so server-component pages re-render fresh.
 */

import { serverFetch, serverFetchFormData, ApiError } from "@/lib/api.server";
import { revalidatePath } from "next/cache";

export interface ActionResult {
  ok: boolean;
  error?: string;
  data?: unknown;
}

function failureFromError(err: unknown): ActionResult {
  if (err instanceof ApiError) {
    return { ok: false, error: err.message };
  }
  return { ok: false, error: "Unexpected error" };
}

// ─── Institutions (super_admin) ─────────────────────────────────────────────

export async function createInstitution(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const slug = String(formData.get("slug") ?? "").trim();
  const admin_email = String(formData.get("admin_email") ?? "").trim();
  const admin_full_name = String(formData.get("admin_full_name") ?? "").trim();
  const mode = String(formData.get("mode") ?? "invite") as "invite" | "password";
  const admin_password = String(formData.get("admin_password") ?? "").trim();

  if (!name || !slug || !admin_email || !admin_full_name) {
    return { ok: false, error: "All fields except password are required" };
  }
  if (mode === "password" && admin_password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }

  try {
    const data = await serverFetch("/api/admin/institutions", {
      method: "POST",
      body: JSON.stringify({
        name,
        slug,
        admin_email,
        admin_full_name,
        mode,
        admin_password: mode === "password" ? admin_password : undefined,
      }),
    });
    revalidatePath("/admin");
    revalidatePath("/admin/institutions");
    return { ok: true, data };
  } catch (err) {
    return failureFromError(err);
  }
}

// ─── Departments (institution_admin / super_admin) ──────────────────────────

export async function createDepartment(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const name = String(formData.get("name") ?? "").trim();
  const code = String(formData.get("code") ?? "").trim();
  if (!name || !code) {
    return { ok: false, error: "Name and code are required" };
  }
  try {
    const data = await serverFetch("/api/institution/departments", {
      method: "POST",
      body: JSON.stringify({ name, code }),
    });
    revalidatePath("/admin/departments");
    revalidatePath("/admin");
    return { ok: true, data };
  } catch (err) {
    return failureFromError(err);
  }
}

export async function assignHod(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const department_id = String(formData.get("department_id") ?? "").trim();
  const auth_user_id = String(formData.get("auth_user_id") ?? "").trim();
  if (!department_id || !auth_user_id) {
    return { ok: false, error: "Both fields required" };
  }
  try {
    await serverFetch(
      `/api/institution/departments/${department_id}/hods`,
      {
        method: "POST",
        body: JSON.stringify({ auth_user_id }),
      },
    );
    revalidatePath(`/admin/departments/${department_id}`);
    revalidatePath("/admin/departments");
    return { ok: true };
  } catch (err) {
    return failureFromError(err);
  }
}

// ─── Users (institution_admin / super_admin) ────────────────────────────────

export async function createUser(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const full_name = String(formData.get("full_name") ?? "").trim();
  const role = String(formData.get("role") ?? "").trim();
  const mode = String(formData.get("mode") ?? "invite") as "invite" | "password";
  const password = String(formData.get("password") ?? "").trim();
  const department_id = String(formData.get("department_id") ?? "").trim();

  if (!email || !full_name || !role) {
    return { ok: false, error: "Email, name, and role required" };
  }
  if (role === "student" && mode === "password") {
    return { ok: false, error: "Students don't need passwords" };
  }
  if (mode === "password" && role !== "student" && password.length < 8) {
    return { ok: false, error: "Password must be at least 8 characters" };
  }

  try {
    const data = await serverFetch("/api/institution/users", {
      method: "POST",
      body: JSON.stringify({
        email,
        full_name,
        role,
        mode,
        password: mode === "password" ? password : undefined,
        department_id: department_id || undefined,
      }),
    });
    revalidatePath("/admin/users");
    revalidatePath("/admin");
    return { ok: true, data };
  } catch (err) {
    return failureFromError(err);
  }
}

// ─── CSV import ─────────────────────────────────────────────────────────────

export async function importUsersPreview(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "Pick a CSV file first" };
  }
  const fd = new FormData();
  fd.append("file", file);
  try {
    const data = await serverFetchFormData(
      "/api/institution/users/import/preview",
      fd,
    );
    return { ok: true, data };
  } catch (err) {
    return failureFromError(err);
  }
}

export async function importUsersCommit(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const file = formData.get("file");
  const mode = String(formData.get("mode") ?? "invite");
  if (!file || !(file instanceof File)) {
    return { ok: false, error: "Pick a CSV file first" };
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("mode", mode);
  try {
    const data = await serverFetchFormData(
      "/api/institution/users/import/commit",
      fd,
    );
    revalidatePath("/admin/users");
    revalidatePath("/admin");
    return { ok: true, data };
  } catch (err) {
    return failureFromError(err);
  }
}

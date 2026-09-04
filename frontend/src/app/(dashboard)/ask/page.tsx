import { ApiError, serverFetch } from "@/lib/api.server";
import { createClient } from "@/lib/supabase/server";
import type { LLMStatus, UserRole } from "@/lib/types";
import { redirect } from "next/navigation";
import AskView from "./AskView";

/** S2 — natural-language query interface (HoD / institution admin). */
export default async function AskPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("auth_users")
    .select("role, full_name")
    .eq("id", user.id)
    .single();
  const role = profile?.role as UserRole | undefined;
  if (role !== "hod" && role !== "institution_admin" && role !== "super_admin") {
    redirect("/");
  }

  const { data: departments } = await supabase
    .from("departments")
    .select("id, name, code")
    .order("name");

  let status: LLMStatus | null = null;
  let loadError: string | null = null;
  try {
    status = await serverFetch<LLMStatus>("/api/llm/status");
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Backend error: ${err.message}`
        : "Could not reach the backend — is FastAPI running on :8000?";
  }

  return (
    <AskView
      status={status}
      loadError={loadError}
      userName={profile?.full_name ?? "there"}
      departments={(departments ?? []).map((d) => ({
        id: d.id as string,
        name: d.name as string,
        code: d.code as string,
      }))}
    />
  );
}

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { redirect } from "next/navigation";
import LongitudinalView from "./LongitudinalView";

/** S3 — Longitudinal learning-style analytics (HoD / institution admin). */
export default async function LongitudinalPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("auth_users")
    .select("role")
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

  return (
    <LongitudinalView
      departments={(departments ?? []).map((d) => ({
        id: d.id as string,
        name: d.name as string,
        code: d.code as string,
      }))}
    />
  );
}

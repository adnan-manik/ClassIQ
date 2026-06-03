import TeachersView from "./TeachersView";
import { createClient } from "@/lib/supabase/server";

export default async function TeachersPage() {
  const supabase = await createClient();

  const { data: teachers } = await supabase
    .from("teachers")
    .select(
      `
        id, full_name, email,
        profiles:teacher_profiles!teacher_profiles_teacher_id_fkey(
          version, is_current, teaching_style, interaction_level, pacing, approach
        )
      `,
    )
    .order("full_name");

  return <TeachersView teachers={teachers ?? []} />;
}

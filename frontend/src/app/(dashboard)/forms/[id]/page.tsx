import { getAuthContext } from "@/lib/auth";
import { ApiError, serverFetch } from "@/lib/api.server";
import { createClient } from "@/lib/supabase/server";
import type { FormMeta, SurveyFormShape, UserRole } from "@/lib/types";
import { notFound, redirect } from "next/navigation";
import FormBuilder, { type BuilderScope } from "./FormBuilder";

/** Survey form builder. Staff only; scope option lists come from Supabase (RLS). */
export default async function FormBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");

  const role = profile?.role as UserRole | undefined;
  if (role !== "hod" && role !== "institution_admin" && role !== "super_admin") {
    redirect("/");
  }

  let form: SurveyFormShape;
  let meta: FormMeta;
  try {
    [form, meta] = await Promise.all([
      serverFetch<SurveyFormShape>(`/api/forms/${encodeURIComponent(id)}`),
      serverFetch<FormMeta>("/api/forms/meta"),
    ]);
  } catch (err) {
    if (err instanceof ApiError && (err.status === 404 || err.status === 422)) notFound();
    const message =
      err instanceof ApiError
        ? `Backend error: ${err.message}`
        : "Could not reach the backend — is FastAPI running on :8000?";
    return (
      <div className="p-8 max-w-3xl">
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3">
          {message}
        </div>
      </div>
    );
  }

  const [{ data: terms }, { data: departments }, { data: sections }] = await Promise.all([
    supabase.from("academic_terms").select("id, name, is_active").order("name"),
    supabase.from("departments").select("id, name, code").order("name"),
    supabase.from("sections").select("id, label, course:courses(code, name)").order("label"),
  ]);

  const scope: BuilderScope = {
    terms: (terms ?? []).map((t) => ({
      id: t.id as string,
      name: t.name as string,
      is_active: t.is_active as boolean,
    })),
    departments: (departments ?? []).map((d) => ({
      id: d.id as string,
      name: d.name as string,
      code: d.code as string,
    })),
    sections: (sections ?? []).map((s) => {
      const c = (Array.isArray(s.course) ? s.course[0] : s.course) as
        | { code: string; name: string }
        | null
        | undefined;
      return {
        id: s.id as string,
        label: s.label as string,
        course_code: c?.code ?? "",
      };
    }),
  };

  return <FormBuilder initialForm={form} meta={meta} scope={scope} />;
}

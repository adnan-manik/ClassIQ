import { getAuthContext } from "@/lib/auth";
import { ApiError, serverFetch } from "@/lib/api.server";
import { createClient } from "@/lib/supabase/server";
import type { IngestionJob, Instrument, UserRole } from "@/lib/types";
import { redirect } from "next/navigation";
import IngestionView, { type IngestionOptions } from "./IngestionView";

/**
 * Survey ingestion — RDF / CSV bulk import, manual entry, job history.
 * Option lists come from Supabase (RLS); jobs + instrument from the backend.
 */
export default async function IngestionPage() {
  const supabase = await createClient();
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");

  const role = profile?.role as UserRole | undefined;
  if (role !== "hod" && role !== "institution_admin" && role !== "super_admin") {
    redirect("/");
  }

  const [{ data: terms }, { data: departments }, { data: students }] =
    await Promise.all([
      supabase
        .from("academic_terms")
        .select("id, name, is_active")
        .order("name"),
      supabase.from("departments").select("id, name, code").order("name"),
      supabase
        .from("students")
        .select("id, full_name, external_id, email")
        .order("full_name"),
    ]);

  const options: IngestionOptions = {
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
    students: (students ?? []).map((s) => ({
      id: s.id as string,
      full_name: s.full_name as string,
      external_id: (s.external_id as string | null) ?? null,
      email: (s.email as string | null) ?? null,
    })),
  };

  let jobs: IngestionJob[] = [];
  let instrument: Instrument | null = null;
  let loadError: string | null = null;
  try {
    [jobs, instrument] = await Promise.all([
      serverFetch<IngestionJob[]>("/api/ingestion/jobs?limit=50"),
      serverFetch<Instrument>("/api/ingestion/instrument"),
    ]);
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Backend error: ${err.message}`
        : "Could not reach the backend — is FastAPI running on :8000?";
  }

  return (
    <IngestionView
      options={options}
      initialJobs={jobs}
      instrument={instrument}
      loadError={loadError}
    />
  );
}

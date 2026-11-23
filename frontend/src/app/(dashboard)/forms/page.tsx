import { getAuthContext } from "@/lib/auth";
import { ApiError, serverFetch } from "@/lib/api.server";
import type { SurveyFormShape, UserRole } from "@/lib/types";
import { redirect } from "next/navigation";
import FormsView from "./FormsView";

/** Survey forms — staff list. Students answer these without an account via /survey/<code>. */
export default async function FormsPage() {
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");

  const role = profile?.role as UserRole | undefined;
  if (role !== "hod" && role !== "institution_admin" && role !== "super_admin") {
    redirect("/");
  }

  let forms: SurveyFormShape[] = [];
  let loadError: string | null = null;
  try {
    forms = await serverFetch<SurveyFormShape[]>("/api/forms");
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Backend error: ${err.message}`
        : "Could not reach the backend — is FastAPI running on :8000?";
  }

  return <FormsView initialForms={forms} loadError={loadError} />;
}

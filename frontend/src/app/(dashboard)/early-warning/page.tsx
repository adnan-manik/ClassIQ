import { getAuthContext } from "@/lib/auth";
import { ApiError, serverFetch } from "@/lib/api.server";
import type { EarlyWarningOverview, FlagShape, UserRole } from "@/lib/types";
import { redirect } from "next/navigation";
import EarlyWarningView from "./EarlyWarningView";

/** S1 — Early Warning System (HoD / institution admin). */
export default async function EarlyWarningPage() {
  const { user, profile } = await getAuthContext();
  if (!user) redirect("/login");

  const role = profile?.role as UserRole | undefined;
  if (role !== "hod" && role !== "institution_admin" && role !== "super_admin") {
    redirect("/");
  }

  let overview: EarlyWarningOverview | null = null;
  let flags: FlagShape[] = [];
  let loadError: string | null = null;
  try {
    [overview, flags] = await Promise.all([
      serverFetch<EarlyWarningOverview>("/api/early-warning/overview"),
      serverFetch<FlagShape[]>("/api/early-warning/flags?limit=300"),
    ]);
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Backend error: ${err.message}`
        : "Could not reach the backend — is FastAPI running on :8000?";
  }

  return (
    <EarlyWarningView
      initialOverview={overview}
      initialFlags={flags}
      loadError={loadError}
    />
  );
}

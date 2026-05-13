/**
 * Typed client for the ClassIQ FastAPI backend.
 *
 * Auth: pulls the current Supabase access token via createClient() and sends
 * it as `Authorization: Bearer <jwt>` so the backend can verify the user.
 */

import { createClient } from "@/lib/supabase/client";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Not authenticated — sign in first.");
  }
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

export interface SimulateFactor {
  factor_name: string;
  score: number;
  weight: number;
  impact: "positive" | "neutral" | "negative";
}

export interface SimulateResponse {
  run_id: string;
  result_id: string;
  compatibility_score: number;
  predicted_outcome: "high" | "medium" | "low";
  social_graph_impact: "supportive" | "neutral" | "hindering";
  style_distribution: Record<string, Record<string, number>>;
  recommended_teacher_id: string | null;
  factors: SimulateFactor[];
}

export async function simulateSection(
  sectionId: string,
): Promise<SimulateResponse> {
  const res = await authedFetch(`/api/sections/${sectionId}/simulate`, {
    method: "POST",
  });
  if (!res.ok) {
    const detail = await safeError(res);
    throw new Error(`Simulate failed (${res.status}): ${detail}`);
  }
  return res.json() as Promise<SimulateResponse>;
}

async function safeError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    return body?.detail ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

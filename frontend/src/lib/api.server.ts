/**
 * Server-side authed fetch — used in Server Components and Server Actions.
 *
 * Reads the Supabase access token from cookies (via the @supabase/ssr server
 * client) and forwards it as Authorization: Bearer to the FastAPI backend.
 */

import { createClient } from "@/lib/supabase/server";

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown, message?: string) {
    super(message ?? `API ${status}`);
    this.status = status;
    this.body = body;
  }
}

async function getAccessToken(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}

export async function serverFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError(401, null, "Not authenticated");

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data, extractDetail(data) ?? res.statusText);
  }
  return data as T;
}

export async function serverFetchFormData<T>(
  path: string,
  formData: FormData,
): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new ApiError(401, null, "Not authenticated");

  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
    cache: "no-store",
  });
  const text = await res.text();
  const data = text ? safeParse(text) : null;
  if (!res.ok) {
    throw new ApiError(res.status, data, extractDetail(data) ?? res.statusText);
  }
  return data as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function extractDetail(data: unknown): string | null {
  if (data && typeof data === "object" && "detail" in data) {
    const d = (data as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    return JSON.stringify(d);
  }
  return null;
}

/** Public (no-auth) survey client. Always goes through the same-origin proxy. */

import type {
  PublicForm,
  PublicIdentifyResponse,
  PublicIdentity,
  PublicSubmissionInput,
  PublicSubmitResponse,
} from "@/lib/types";

export class SurveyError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function detailOf(body: unknown, fallback: string): string {
  if (body && typeof body === "object" && "detail" in body) {
    const d = (body as { detail: unknown }).detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d)) {
      const first = d[0] as { msg?: string } | undefined;
      if (first?.msg) return first.msg;
    }
  }
  return fallback;
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/survey/${path}`, {
      ...init,
      headers: init?.body ? { "Content-Type": "application/json" } : undefined,
      cache: "no-store",
    });
  } catch {
    throw new SurveyError(0, "Could not connect. Check your internet connection and try again.");
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }
  if (!res.ok) throw new SurveyError(res.status, detailOf(body, res.statusText || "Something went wrong."));
  return body as T;
}

export const fetchPublicForm = (code: string) =>
  call<PublicForm>(encodeURIComponent(code));

export const identifyStudent = (code: string, who: PublicIdentity) =>
  call<PublicIdentifyResponse>(`${encodeURIComponent(code)}/identify`, {
    method: "POST",
    body: JSON.stringify(who),
  });

export const submitSurvey = (code: string, input: PublicSubmissionInput & PublicIdentity) =>
  call<PublicSubmitResponse>(`${encodeURIComponent(code)}/submit`, {
    method: "POST",
    body: JSON.stringify(input),
  });

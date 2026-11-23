import { NextRequest, NextResponse } from "next/server";

/**
 * Same-origin proxy for the public survey. Students open the survey on their
 * own phones, which cannot reach the backend directly (e.g. localhost:8000),
 * so the browser calls this route and the Next server forwards the request.
 *
 * Only three shapes are forwarded; nothing from the incoming request except
 * the JSON body is passed on (no cookies, no Authorization).
 *   GET  /api/survey/<code>
 *   POST /api/survey/<code>/identify
 *   POST /api/survey/<code>/submit
 */

const BACKEND =
  process.env.API_BASE_URL ??
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  "http://localhost:8000";

const MAX_BODY_BYTES = 256 * 1024;
const CODE_RE = /^[A-Za-z0-9]{1,16}$/;

type Ctx = { params: Promise<{ path: string[] }> };

function fail(status: number, detail: string) {
  return NextResponse.json({ detail }, { status });
}

/** Returns the backend path suffix, or null when the path isn't allowed. */
function resolve(path: string[], method: "GET" | "POST"): string | null {
  const [code, action, ...rest] = path;
  if (!code || !CODE_RE.test(code) || rest.length > 0) return null;
  if (method === "GET") return action === undefined ? code : null;
  return action === "identify" || action === "submit" ? `${code}/${action}` : null;
}

async function forward(
  req: NextRequest,
  ctx: Ctx,
  method: "GET" | "POST",
): Promise<NextResponse> {
  const { path } = await ctx.params;
  const suffix = resolve(path, method);
  if (!suffix) return fail(404, "Not found");

  let body: string | undefined;
  if (method === "POST") {
    const declared = Number(req.headers.get("content-length") ?? "0");
    if (declared > MAX_BODY_BYTES) return fail(413, "Request is too large.");
    body = await req.text();
    if (new TextEncoder().encode(body).length > MAX_BODY_BYTES) {
      return fail(413, "Request is too large.");
    }
  }

  try {
    const res = await fetch(`${BACKEND}/api/public/forms/${suffix}`, {
      method,
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body,
      cache: "no-store",
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { detail: res.statusText || "Unexpected response from server." };
    }
    return NextResponse.json(data, { status: res.status });
  } catch {
    return fail(502, "The survey service is unreachable right now. Please try again shortly.");
  }
}

export function GET(req: NextRequest, ctx: Ctx) {
  return forward(req, ctx, "GET");
}

export function POST(req: NextRequest, ctx: Ctx) {
  return forward(req, ctx, "POST");
}

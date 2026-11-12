import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Keep the Supabase session cookies fresh and report whether the request
 * carries one. Called from src/proxy.ts.
 *
 * This deliberately uses `getSession()`, not `getUser()`. `getUser()` calls
 * GET /auth/v1/user on every single request — and the proxy runs on every
 * request, prefetches included, so each navigation paid a round trip to the
 * Supabase Auth server before Next.js even started rendering. `getSession()`
 * reads the cookie locally and only goes to the network when the access token
 * is at or near expiry, which is also when the refreshed cookies get written
 * back through `setAll` below.
 *
 * The trade-off is that the returned flag is an *optimistic* check: it says a
 * session cookie is present and unexpired, not that its signature is valid.
 * That is what Next.js recommends for proxy-level redirects. Authorization
 * still happens where it can be trusted — `getAuthContext()` in the dashboard
 * layout calls `getUser()`, and the FastAPI backend verifies the JWT
 * signature on every API request.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { session },
  } = await supabase.auth.getSession();

  return { response, hasSession: session !== null };
}

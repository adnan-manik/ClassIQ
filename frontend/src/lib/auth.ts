/**
 * Request-scoped auth lookup for Server Components.
 *
 * The dashboard layout and the page it wraps both need the signed-in user and
 * their `auth_users` row. Done naively that is two `getUser()` calls plus two
 * PostgREST queries per navigation — four round trips to Supabase, all before
 * the page fetches any of its own data. `React.cache` memoises the pair for
 * the duration of one render pass, so the layout pays for it and every page
 * underneath reads the same result.
 *
 * The cache lives and dies with a single request: nothing is shared between
 * users or across navigations.
 */

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";

/** Every column any dashboard page reads off `auth_users`. */
export type AuthProfile = {
  id: string;
  institution_id: string | null;
  role: UserRole;
  full_name: string | null;
  email: string | null;
};

const PROFILE_COLUMNS = "id, institution_id, role, full_name, email";

/**
 * The signed-in user and their profile row, or nulls when not signed in.
 * Memoised per request — call it from as many components as you like.
 */
export const getAuthContext = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, profile: null };

  const { data } = await supabase
    .from("auth_users")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .single();

  return { user, profile: (data as AuthProfile | null) ?? null };
});

/** Just the profile row, or null. */
export async function getAuthProfile(): Promise<AuthProfile | null> {
  return (await getAuthContext()).profile;
}

/** The caller's role, or undefined when unauthenticated / profile missing. */
export async function getUserRole(): Promise<UserRole | undefined> {
  return (await getAuthContext()).profile?.role;
}

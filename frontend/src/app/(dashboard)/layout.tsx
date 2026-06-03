import Sidebar from "@/components/Sidebar";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { AuthUser, UserRole } from "@/lib/types";
import { redirect } from "next/navigation";
import { ReactNode } from "react";

/**
 * Dashboard layout — wraps every authenticated route with the sidebar.
 * Role gating happens here too: a teacher hitting /students gets bounced
 * to /teacher-dashboard, a super_admin gets bounced to /admin, etc.
 */
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("auth_users")
    .select("id, institution_id, role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile) {
    // auth.users row exists but no profile — trigger missed or unknown user
    redirect("/login");
  }

  return (
    <div style={{ backgroundColor: BRAND.page }}>
      <Sidebar user={profile as AuthUser} />
      <main className="ml-56 min-h-screen overflow-auto">
        {children}
      </main>
      <style>{`
        main::-webkit-scrollbar {
          width: 8px;
        }
        main::-webkit-scrollbar-track {
          background: transparent;
        }
        main::-webkit-scrollbar-thumb {
          background: #0d9488;
          border-radius: 4px;
          border: 2px solid transparent;
          background-clip: padding-box;
        }
        main::-webkit-scrollbar-thumb:hover {
          background: #0f766e;
          background-clip: padding-box;
        }
      `}</style>
    </div>
  );
}

export function roleHomePath(role: UserRole): string {
  if (role === "teacher") return "/teacher-dashboard";
  if (role === "super_admin" || role === "institution_admin") return "/admin";
  return "/";
}

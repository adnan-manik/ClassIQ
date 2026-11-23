"use client";

import { BRAND } from "@/lib/brand";
import type { UserRole } from "@/lib/types";
import {
  BarChart3,
  BookOpen,
  Building2,
  ClipboardList,
  FileBarChart,
  FlaskConical,
  GitBranchPlus,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Network,
  Server,
  ShieldCheck,
  Siren,
  Sparkles,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const HOD_NAV = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Student Profile", icon: Users },
  { href: "/teachers", label: "Teacher Profile", icon: GraduationCap },
  { href: "/sections", label: "Section Builder", icon: GitBranchPlus },
  { href: "/scenarios", label: "What If Scenario", icon: FlaskConical },
  { href: "/reports", label: "Simulation Report", icon: FileBarChart },
  { href: "/social-graph", label: "Social Graph", icon: Network },
  { href: "/early-warning", label: "Early Warning", icon: Siren },
  { href: "/longitudinal", label: "Longitudinal", icon: TrendingUp },
  { href: "/ask", label: "Ask ClassIQ", icon: Sparkles },
  { href: "/ingestion", label: "Survey Ingestion", icon: Upload },
  { href: "/forms", label: "Survey Forms", icon: ClipboardList },
] as const;

const TEACHER_NAV = [
  { href: "/teacher-dashboard", label: "My Class", icon: BookOpen },
] as const;

const INSTITUTION_ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/departments", label: "Departments", icon: GitBranchPlus },
  { href: "/admin/users", label: "Users", icon: Users },
  { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/admin/audit", label: "Audit Log", icon: ShieldCheck },
  { href: "/students", label: "Students", icon: Users },
  { href: "/teachers", label: "Teachers", icon: GraduationCap },
  { href: "/sections", label: "Sections", icon: GitBranchPlus },
  { href: "/reports", label: "Reports", icon: FileBarChart },
  { href: "/social-graph", label: "Social Graph", icon: Network },
  { href: "/early-warning", label: "Early Warning", icon: Siren },
  { href: "/longitudinal", label: "Longitudinal", icon: TrendingUp },
  { href: "/ask", label: "Ask ClassIQ", icon: Sparkles },
  { href: "/ingestion", label: "Survey Ingestion", icon: Upload },
  { href: "/forms", label: "Survey Forms", icon: ClipboardList },
] as const;

const SUPER_ADMIN_NAV = [
  { href: "/admin", label: "Overview", icon: LayoutDashboard },
  { href: "/admin/institutions", label: "Institutions", icon: Building2 },
  { href: "/admin/system", label: "System Health", icon: Server },
  { href: "/admin/audit", label: "Audit Log", icon: ShieldCheck },
] as const;

function navForRole(role: UserRole) {
  if (role === "hod") return HOD_NAV;
  if (role === "teacher") return TEACHER_NAV;
  if (role === "institution_admin") return INSTITUTION_ADMIN_NAV;
  if (role === "super_admin") return SUPER_ADMIN_NAV;
  return [];
}

export default function Sidebar({
  user,
}: {
  user: { full_name: string; email: string; role: UserRole };
}) {
  const pathname = usePathname();
  const nav = navForRole(user.role);

  return (
    <aside
      className="fixed left-0 top-0 w-56 h-screen flex flex-col"
      style={{ backgroundColor: BRAND.sidebar }}
    >
      {/* Brand */}
      <div className="shrink-0 px-6 py-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-white leading-none">
          ClassIQ
        </h1>
      </div>

      {/* Nav */}
      <nav
        className="flex-1 py-2 overflow-y-auto"
        style={{
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        <style>{`
          nav::-webkit-scrollbar {
            display: none;
          }
        `}</style>
        {nav.map(({ href, label, icon: Icon }) => {
          // For `/admin` exact-match so it doesn't stay highlighted on /admin/users etc.
          const active =
            href === "/" || href === "/admin"
              ? pathname === href
              : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-3 ml-3 py-2.5 my-1 text-sm font-semibold transition-all"
              style={{
                paddingLeft: active ? 24 : 16,
                paddingRight: 16,
                backgroundColor: active ? BRAND.sidebarActiveBg : "transparent",
                color: active ? BRAND.sidebarActiveText : BRAND.sidebarText,
                borderTopLeftRadius: 999,
                borderBottomLeftRadius: 999,
                marginRight: active ? -2 : 0,
              }}
              onMouseEnter={(e) => {
                if (!active)
                  e.currentTarget.style.backgroundColor = BRAND.sidebarHover;
              }}
              onMouseLeave={(e) => {
                if (!active)
                  e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Icon size={17} strokeWidth={2.5} />
              <span>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* User + signout */}
      <div
        className="shrink-0 p-3 mx-3 mb-3 rounded-xl"
        style={{ backgroundColor: BRAND.sidebarHover }}
      >
        <div
          className="text-[10px] uppercase tracking-wider mb-0.5"
          style={{ color: BRAND.sidebarMuted }}
        >
          {user.role.replace("_", " ")}
        </div>
        <div className="text-xs font-semibold truncate text-white">
          {user.full_name}
        </div>
        <div
          className="text-[10px] truncate mb-2"
          style={{ color: BRAND.sidebarMuted }}
        >
          {user.email}
        </div>
        <form action="/auth/signout" method="POST">
          <button
            type="submit"
            className="w-full flex items-center justify-center gap-1.5 py-1.5 rounded-full text-[11px] font-semibold transition bg-white"
            style={{ color: BRAND.sidebarActiveText }}
          >
            <LogOut size={12} strokeWidth={2.5} />
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

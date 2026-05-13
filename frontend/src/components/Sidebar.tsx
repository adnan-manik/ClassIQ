"use client";

import { BRAND } from "@/lib/brand";
import type { UserRole } from "@/lib/types";
import {
  BookOpen,
  FileBarChart,
  FlaskConical,
  GitBranchPlus,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Network,
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
] as const;

const TEACHER_NAV = [
  { href: "/teacher-dashboard", label: "My Class", icon: BookOpen },
] as const;

const ADMIN_NAV = [
  { href: "/admin", label: "Admin Panel", icon: LayoutDashboard },
] as const;

function navForRole(role: UserRole) {
  if (role === "hod") return HOD_NAV;
  if (role === "teacher") return TEACHER_NAV;
  if (role === "super_admin") return ADMIN_NAV;
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
      className="w-56 flex flex-col min-h-screen shrink-0"
      style={{ backgroundColor: BRAND.sidebar }}
    >
      {/* Brand */}
      <div className="px-6 py-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-white leading-none">
          ClassIQ
        </h1>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-2">
        {nav.map(({ href, label, icon: Icon }) => {
          const active =
            href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="relative flex items-center gap-3 ml-3 py-2.5 my-1 text-sm font-semibold transition-all"
              style={{
                // Active tab gets a small left indent so the icon+label slide
                // right together (separating from inactive tabs visually).
                paddingLeft: active ? 24 : 16,
                paddingRight: 16,
                backgroundColor: active ? BRAND.sidebarActiveBg : "transparent",
                color: active ? BRAND.sidebarActiveText : BRAND.sidebarText,
                borderTopLeftRadius: 999,
                borderBottomLeftRadius: 999,
                // Active tab pokes out past the sidebar edge so it visually
                // joins the page background (same color → merges seamlessly).
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
        className="p-3 mx-3 mb-3 rounded-xl"
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

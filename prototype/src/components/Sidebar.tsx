"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/ThemeContext";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  GitBranchPlus,
  FlaskConical,
  FileBarChart,
  BookOpen,
  Network,
} from "lucide-react";

const nav = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/students", label: "Student Profiles", icon: Users },
  { href: "/teachers", label: "Teacher Profiles", icon: GraduationCap },
  { href: "/sections", label: "Section Builder", icon: GitBranchPlus },
  { href: "/scenarios", label: "What-If Scenarios", icon: FlaskConical },
  { href: "/reports", label: "Simulation Reports", icon: FileBarChart },
  { href: "/teacher-dashboard", label: "Teacher View", icon: BookOpen },
  { href: "/social-graph", label: "Social Graph", icon: Network },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { theme: t } = useTheme();
  const c = t.colors;

  return (
    <aside className="w-64 flex flex-col min-h-screen shrink-0" style={{ backgroundColor: c.sidebarBg }}>
      <div className="p-5" style={{ borderBottom: `1px solid ${c.sidebarBorder}` }}>
        <h1 className="text-lg font-bold leading-tight" style={{ color: c.sidebarText }}>
          Classroom Digital Twin
        </h1>
        <p className="text-xs mt-1" style={{ color: c.sidebarMuted }}>Decision Support Platform</p>
      </div>

      <nav className="flex-1 py-4">
        {nav.map(({ href, label, icon: Icon }) => {
          const active = pathname === href;
          return (
            <Link
              key={href}
              href={href}
              className="flex items-center gap-3 px-5 py-2.5 text-sm transition-colors"
              style={{
                backgroundColor: active ? c.sidebarActive : "transparent",
                color: active ? (t.id === "navy-gold" ? "#1e3a5f" : "#ffffff") : c.sidebarText,
                fontWeight: active ? 600 : 400,
              }}
              onMouseEnter={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = c.sidebarHover;
              }}
              onMouseLeave={(e) => {
                if (!active) e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4" style={{ borderTop: `1px solid ${c.sidebarBorder}` }}>
        <div className="text-xs" style={{ color: c.sidebarMuted }}>MAJU &mdash; CS Department</div>
        <div className="text-sm mt-1" style={{ color: c.sidebarText }}>Dr. Imran (HoD)</div>
      </div>
    </aside>
  );
}

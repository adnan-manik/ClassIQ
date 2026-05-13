"use client";

import { createClient } from "@/lib/supabase/client";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

// ─── Role-aware copy ───────────────────────────────────────────────────────
// Tabs are visual only — they pre-fill the demo email and change the
// heading label. The REAL role is fetched from public.auth_users after
// signin and drives the dashboard redirect (the tab does NOT control auth).
const ROLE_TABS = [
  { id: "hod" as const, label: "HoD", demoEmail: "hod@classiq.demo" },
  { id: "teacher" as const, label: "Teacher", demoEmail: "teacher@classiq.demo" },
  { id: "super_admin" as const, label: "Admin", demoEmail: "admin@classiq.demo" },
];
type RoleId = (typeof ROLE_TABS)[number]["id"];

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [activeRole, setActiveRole] = useState<RoleId>("super_admin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active = ROLE_TABS.find((t) => t.id === activeRole)!;

  async function handleSignIn(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { data, error: signInErr } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInErr || !data.user) {
      setError(signInErr?.message ?? "Sign in failed.");
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase
      .from("auth_users")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const role = profile?.role as RoleId | undefined;
    if (role === "teacher") router.push("/teacher-dashboard");
    else if (role === "super_admin") router.push("/admin");
    else router.push("/");

    router.refresh();
  }

  return (
    <main
      className="min-h-screen w-full flex items-center justify-center px-4 py-10 relative overflow-hidden"
      style={{ backgroundColor: "var(--brand-mint)" }}
    >
      {/* ─── Decorative blobs (clipped to viewport edges) ──────────── */}

      {/* Top-right — large dark teal circle */}
      <div
        className="absolute -top-32 -right-32 w-[28rem] h-[28rem] rounded-full pointer-events-none"
        style={{ backgroundColor: "var(--brand-teal-dark)" }}
        aria-hidden="true"
      />

      {/* Bottom-left — large irregular dark teal blob */}
      <div
        className="absolute -bottom-56 -left-40 w-[40rem] h-[40rem] pointer-events-none"
        style={{
          backgroundColor: "var(--brand-teal-dark)",
          borderRadius: "62% 38% 50% 50% / 50% 60% 40% 50%",
          transform: "rotate(-12deg)",
        }}
        aria-hidden="true"
      />

      {/* Top-left — small lighter teal accent */}
      <div
        className="absolute -top-20 -left-24 w-64 h-64 pointer-events-none opacity-90"
        style={{
          backgroundColor: "var(--brand-teal)",
          borderRadius: "50% 60% 40% 50% / 60% 40% 60% 40%",
          transform: "rotate(18deg)",
        }}
        aria-hidden="true"
      />

      {/* Bottom-right — medium teal accent */}
      <div
        className="absolute -bottom-32 -right-28 w-[22rem] h-[22rem] rounded-full pointer-events-none opacity-90"
        style={{ backgroundColor: "var(--brand-teal)" }}
        aria-hidden="true"
      />

      {/* Floating mid-right small dot — adds visual rhythm */}
      <div
        className="absolute top-1/4 right-8 w-10 h-10 rounded-full pointer-events-none hidden lg:block"
        style={{ backgroundColor: "var(--brand-teal-dark)", opacity: 0.6 }}
        aria-hidden="true"
      />

      {/* Floating mid-left small dot */}
      <div
        className="absolute bottom-1/4 left-12 w-6 h-6 rounded-full pointer-events-none hidden lg:block"
        style={{ backgroundColor: "var(--brand-teal)", opacity: 0.7 }}
        aria-hidden="true"
      />

      {/* ─── White foreground card ─────────────────────────────────── */}
      <div
        className="relative w-full max-w-5xl bg-white rounded-[28px] md:rounded-[36px] shadow-2xl flex flex-col md:flex-row overflow-hidden"
        style={{ border: "4px solid var(--brand-teal)" }}
      >
          {/* ─── Left column: form ──────────────────────────────────── */}
          <div className="flex-1 px-8 md:px-12 py-10 md:py-14 flex flex-col">
            {/* Role tabs — subtle text links */}
            <div className="flex gap-5 text-xs mb-8">
              {ROLE_TABS.map((tab) => {
                const isActive = activeRole === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      setActiveRole(tab.id);
                      setEmail(tab.demoEmail);
                    }}
                    className="pb-1 transition font-medium tracking-wide uppercase"
                    style={{
                      color: isActive
                        ? "var(--brand-teal)"
                        : "rgba(100,116,139,0.7)",
                      borderBottom: isActive
                        ? "2px solid var(--brand-teal)"
                        : "2px solid transparent",
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Welcome heading */}
            <div className="mb-8">
              <p
                className="text-2xl mb-1"
                style={{
                  fontFamily: "var(--font-pacifico)",
                  color: "var(--brand-teal)",
                }}
              >
                Welcome Back
              </p>
              <h1
                className="text-3xl md:text-4xl font-bold"
                style={{ color: "var(--brand-teal)" }}
              >
                {active.label} Login
              </h1>
            </div>

            {/* Form */}
            <form onSubmit={handleSignIn} className="flex flex-col">
              {/* Email field */}
              <div className="relative mb-4">
                <label
                  htmlFor="login-email"
                  className="absolute -top-2 left-4 px-1.5 bg-white text-xs font-medium z-10"
                  style={{ color: "var(--brand-input)" }}
                >
                  Email
                </label>
                <input
                  id="login-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-14 pl-5 pr-12 border rounded-2xl outline-none text-sm transition focus:border-[--brand-teal]"
                  style={{ borderColor: "var(--brand-input)" }}
                />
                <ChevronDown
                  size={18}
                  className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  style={{ color: "var(--brand-input)" }}
                />
              </div>

              {/* Password field */}
              <div className="relative mb-2">
                <label
                  htmlFor="login-password"
                  className="absolute -top-2 left-4 px-1.5 bg-white text-xs font-medium z-10"
                  style={{ color: "var(--brand-input)" }}
                >
                  Password
                </label>
                <input
                  id="login-password"
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-14 pl-5 pr-12 border rounded-2xl outline-none text-sm transition focus:border-[--brand-teal]"
                  style={{ borderColor: "var(--brand-input)" }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2"
                  style={{ color: "var(--brand-input)" }}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>

              {/* Forgot password */}
              <div className="text-right mb-6">
                <a
                  href="#"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "var(--brand-coral)" }}
                  onClick={(e) => e.preventDefault()}
                >
                  forgot password?
                </a>
              </div>

              {/* Error */}
              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-2xl px-4 py-3 mb-4">
                  {error}
                </div>
              )}

              {/* LOGIN button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full h-14 rounded-full text-white text-sm font-semibold tracking-widest uppercase transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "var(--brand-teal)" }}
              >
                {loading ? "Signing in…" : "Login"}
              </button>

              {/* Sign up link */}
              <p className="text-center text-xs mt-4 text-slate-500">
                Don&apos;t have an account?{" "}
                <a
                  href="#"
                  className="font-medium hover:underline"
                  style={{ color: "var(--brand-coral)" }}
                  onClick={(e) => e.preventDefault()}
                >
                  Sign up.
                </a>
              </p>
            </form>

            {/* Demo hint */}
            <p className="text-center text-[11px] mt-6 text-slate-400">
              Demo account for <strong>{active.label}</strong>:{" "}
              <code className="font-mono">{active.demoEmail}</code>
            </p>
          </div>

          {/* ─── Right column: illustration ────────────────────────── */}
          <div className="hidden md:block relative flex-1 min-h-[560px] bg-white">
            <Image
              src="/login-visual.png"
              alt="ClassIQ — illustration of a learner working on a laptop"
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover"
            />
          </div>
        </div>
    </main>
  );
}


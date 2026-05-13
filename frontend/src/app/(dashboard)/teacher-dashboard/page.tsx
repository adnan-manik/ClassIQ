import SignOutButton from "@/components/SignOutButton";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function TeacherDashboardPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("auth_users")
    .select("full_name, email, role, institution_id")
    .eq("id", user.id)
    .single();

  return (
    <main
      className="min-h-screen px-8 py-10"
      style={{ backgroundColor: "var(--brand-mint)" }}
    >
      <div className="max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl grid place-items-center"
              style={{ backgroundColor: "var(--brand-teal)" }}
            >
              <span className="text-white text-lg font-extrabold">C</span>
            </div>
            <span
              className="text-xl font-bold tracking-tight"
              style={{ color: "var(--brand-purple)" }}
            >
              ClassIQ
            </span>
          </div>
          <SignOutButton />
        </header>

        <div
          className="bg-white rounded-3xl p-8 md:p-10 shadow-sm"
          style={{ border: "2px solid var(--brand-teal)" }}
        >
          <span
            className="inline-block px-3 py-1 rounded-full text-xs font-semibold mb-4"
            style={{
              backgroundColor: "var(--brand-teal)",
              color: "white",
            }}
          >
            Teacher Dashboard
          </span>
          <h1 className="text-3xl font-bold mb-2">
            Welcome, {profile?.full_name ?? user.email}
          </h1>
          <p className="text-slate-500 mb-6">
            Signed in as <code className="font-mono text-sm">{user.email}</code>
            {" · "}role <strong>{profile?.role ?? "(unknown)"}</strong>
          </p>

          <div className="border-t pt-6 mt-6 space-y-3 text-sm text-slate-600">
            <p className="font-semibold text-slate-700">
              This is a placeholder. The real Teacher dashboard (F7) will
              include:
            </p>
            <ul className="list-disc list-inside space-y-1 ml-2">
              <li>Your assigned class roster (read-only)</li>
              <li>Learning style distribution across all 4 FSLSM axes</li>
              <li>Class profile summary and dominant style</li>
              <li>Content approach recommendations from the PhD model</li>
            </ul>
            <p className="text-xs text-slate-400 pt-2">
              Teachers cannot modify sections or trigger simulations — see
              <code className="font-mono"> Docs/project.md §7</code>.
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}

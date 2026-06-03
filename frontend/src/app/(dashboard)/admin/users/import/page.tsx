import CsvImporter from "@/components/admin/CsvImporter";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/types";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function ImportUsersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase
    .from("auth_users")
    .select("role")
    .eq("id", user.id)
    .single();
  const role = profile?.role as UserRole | undefined;
  if (role !== "institution_admin" && role !== "super_admin") redirect("/admin");

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <Link
        href="/admin/users"
        className="inline-flex items-center gap-1.5 text-sm font-semibold hover:underline"
        style={{ color: BRAND.teal }}
      >
        <ArrowLeft size={15} />
        Back to users
      </Link>

      <div>
        <h1
          className="text-4xl font-extrabold tracking-tight"
          style={{ color: BRAND.textHeading }}
        >
          Bulk-import users
        </h1>
        <p
          className="text-base mt-1.5"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Pick a CSV file, preview it, then commit the import. Per-row failures
          don&apos;t abort the batch.
        </p>
      </div>

      <CsvImporter />
    </div>
  );
}

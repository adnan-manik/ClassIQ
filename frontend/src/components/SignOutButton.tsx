"use client";

export default function SignOutButton({
  className = "",
  label = "Sign out",
}: {
  className?: string;
  label?: string;
}) {
  return (
    <form action="/auth/signout" method="POST">
      <button
        type="submit"
        className={`px-4 py-2 rounded-full text-sm font-medium text-white transition hover:opacity-90 ${className}`}
        style={{ backgroundColor: "var(--brand-purple)" }}
      >
        {label}
      </button>
    </form>
  );
}

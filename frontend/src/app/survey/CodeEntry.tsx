"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function CodeEntry() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const clean = code.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();

  function go(e: FormEvent) {
    e.preventDefault();
    if (clean.length >= 4) router.push(`/survey/${clean}`);
  }

  return (
    <form onSubmit={go} className="flex flex-col gap-4">
      <label htmlFor="survey-code" className="text-xs font-medium text-slate-600">
        Survey code
      </label>
      <input
        id="survey-code"
        value={code}
        onChange={(e) => setCode(e.target.value.slice(0, 20))}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        placeholder="K7MX2Q"
        className="w-full h-14 px-5 border rounded-2xl outline-none text-xl tracking-[0.3em] font-mono text-center uppercase"
        style={{ borderColor: "var(--brand-input)" }}
      />
      <button
        type="submit"
        disabled={clean.length < 4}
        className="w-full h-14 rounded-full text-white text-sm font-semibold tracking-widest uppercase transition hover:opacity-90 disabled:opacity-50"
        style={{ backgroundColor: "var(--brand-teal)" }}
      >
        Continue
      </button>
    </form>
  );
}

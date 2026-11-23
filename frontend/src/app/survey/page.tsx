import type { Metadata } from "next";
import CodeEntry from "./CodeEntry";
import SurveyShell from "./SurveyShell";

export const metadata: Metadata = {
  title: "Student survey — ClassIQ",
  description: "Enter the survey code your teacher shared.",
};

export default function SurveyIndexPage() {
  return (
    <SurveyShell>
      <p
        className="text-2xl mb-1"
        style={{ fontFamily: "var(--font-pacifico)", color: "var(--brand-teal)" }}
      >
        Welcome
      </p>
      <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--brand-teal)" }}>
        Join a survey
      </h1>
      <p className="text-sm text-slate-600 mb-6">
        Type the 6-character code your teacher gave you.
      </p>
      <CodeEntry />
    </SurveyShell>
  );
}

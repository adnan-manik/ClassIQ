import type { Metadata } from "next";
import SurveyFlow from "./SurveyFlow";
import SurveyShell from "../SurveyShell";

export const metadata: Metadata = {
  title: "Student survey — ClassIQ",
  robots: { index: false, follow: false },
};

export default async function SurveyPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  return (
    <SurveyShell footer="Your answers are shared only with your institution's staff.">
      <SurveyFlow code={code.toUpperCase().replace(/[^A-Z0-9]/g, "")} />
    </SurveyShell>
  );
}

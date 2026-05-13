import EmptyState from "@/components/EmptyState";
import { BRAND } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";
import { Network } from "lucide-react";
import SocialGraphView, {
  type SocialGraphData,
} from "./SocialGraphView";

export default async function SocialGraphPage() {
  const supabase = await createClient();

  const [
    { data: studentsRaw },
    { data: relsRaw },
    { data: sectionsRaw },
    { data: sectionStudentsRaw },
  ] = await Promise.all([
    supabase
      .from("students")
      .select(
        `id, full_name,
         profile:student_profiles!student_profiles_student_id_fkey(is_current, dominant_axis)`,
      )
      .order("full_name"),
    supabase
      .from("peer_relationships")
      .select(
        `id, from_student_id, to_student_id, type, strength,
         from_student:students!peer_relationships_from_student_id_fkey(full_name),
         to_student:students!peer_relationships_to_student_id_fkey(full_name)`,
      ),
    supabase
      .from("sections")
      .select(`id, label, course:courses(code, name)`)
      .order("label"),
    supabase.from("section_students").select("section_id, student_id"),
  ]);

  if (!studentsRaw || studentsRaw.length === 0) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <h1
          className="text-4xl font-extrabold tracking-tight mb-1"
          style={{ color: BRAND.textHeading }}
        >
          Social Relationship Graph
        </h1>
        <p
          className="text-base mb-8"
          style={{ color: BRAND.textHeading, opacity: 0.7 }}
        >
          Peer relationships feed the compatibility scoring engine.
        </p>
        <EmptyState
          icon={Network}
          title="No students yet"
          description="Once students are added, peer relationships appear here as a graph."
        />
      </div>
    );
  }

  const data: SocialGraphData = {
    students: studentsRaw.map((s) => ({
      id: s.id,
      name: s.full_name,
      dominant:
        (s.profile ?? []).find((p) => p.is_current)?.dominant_axis ?? null,
    })),
    relationships: (relsRaw ?? []).map((r) => {
      type S = { full_name: string };
      const from = (Array.isArray(r.from_student)
        ? r.from_student[0]
        : r.from_student) as S | null;
      const to = (Array.isArray(r.to_student)
        ? r.to_student[0]
        : r.to_student) as S | null;
      return {
        id: r.id,
        from: r.from_student_id,
        to: r.to_student_id,
        fromName: from?.full_name ?? "",
        toName: to?.full_name ?? "",
        type: r.type,
        strength: r.strength,
      };
    }),
    sections: (sectionsRaw ?? []).map((sec) => {
      type CT = { code: string; name: string };
      const course = (Array.isArray(sec.course)
        ? sec.course[0]
        : sec.course) as CT | null;
      return {
        id: sec.id,
        label: `${course?.code ?? ""} — Section ${sec.label}`,
      };
    }),
    sectionStudents: (sectionStudentsRaw ?? []).map((ss) => ({
      sectionId: ss.section_id,
      studentId: ss.student_id,
    })),
  };

  return <SocialGraphView data={data} />;
}

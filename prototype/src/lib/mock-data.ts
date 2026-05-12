// ============================================================
// MOCK DATA — mirrors what the real platform will work with
// ============================================================

export interface StudentProfile {
  id: string;
  name: string;
  visual: number;
  auditory: number;
  readWrite: number;
  kinesthetic: number;
  dominantStyle: string;
  collaborationPref: "solo" | "pair" | "group";
  participationLevel: "low" | "medium" | "high";
  version: number;
  semester: string;
}

export interface TeacherProfile {
  id: string;
  name: string;
  teachingStyle: string;
  interactionLevel: "low" | "medium" | "high";
  pacing: "slow" | "moderate" | "fast";
  approach: string;
}

export interface Relationship {
  from: string;
  to: string;
  type: "friend" | "study_partner" | "neutral" | "conflict";
  strength: number; // 1-5
}

export interface Section {
  id: string;
  course: string;
  courseCode: string;
  teacherId: string;
  studentIds: string[];
  state: "draft" | "simulated" | "active";
  semester: string;
}

export interface SimulationResult {
  sectionId: string;
  compatibilityScore: number;
  styleDistribution: { visual: number; auditory: number; readWrite: number; kinesthetic: number };
  predictedOutcome: "High" | "Medium" | "Low";
  socialGraphImpact: "Supportive" | "Neutral" | "Hindering";
  recommendedTeacher: string;
  factors: { name: string; score: number; impact: "positive" | "neutral" | "negative" }[];
}

// --- Students ---
export const students: StudentProfile[] = [
  { id: "s1", name: "Ahmed Khan", visual: 85, auditory: 40, readWrite: 55, kinesthetic: 30, dominantStyle: "Visual", collaborationPref: "group", participationLevel: "high", version: 2, semester: "Fall 2026" },
  { id: "s2", name: "Sara Ali", visual: 30, auditory: 80, readWrite: 60, kinesthetic: 45, dominantStyle: "Auditory", collaborationPref: "pair", participationLevel: "medium", version: 1, semester: "Fall 2026" },
  { id: "s3", name: "Bilal Ahmed", visual: 50, auditory: 35, readWrite: 90, kinesthetic: 40, dominantStyle: "Read/Write", collaborationPref: "solo", participationLevel: "low", version: 1, semester: "Fall 2026" },
  { id: "s4", name: "Fatima Noor", visual: 40, auditory: 55, readWrite: 35, kinesthetic: 88, dominantStyle: "Kinesthetic", collaborationPref: "group", participationLevel: "high", version: 3, semester: "Fall 2026" },
  { id: "s5", name: "Usman Tariq", visual: 70, auditory: 65, readWrite: 50, kinesthetic: 55, dominantStyle: "Visual", collaborationPref: "pair", participationLevel: "medium", version: 1, semester: "Fall 2026" },
  { id: "s6", name: "Ayesha Malik", visual: 45, auditory: 75, readWrite: 80, kinesthetic: 35, dominantStyle: "Read/Write", collaborationPref: "solo", participationLevel: "medium", version: 2, semester: "Fall 2026" },
  { id: "s7", name: "Hassan Raza", visual: 60, auditory: 50, readWrite: 45, kinesthetic: 82, dominantStyle: "Kinesthetic", collaborationPref: "group", participationLevel: "high", version: 1, semester: "Fall 2026" },
  { id: "s8", name: "Zainab Shah", visual: 88, auditory: 42, readWrite: 65, kinesthetic: 38, dominantStyle: "Visual", collaborationPref: "pair", participationLevel: "medium", version: 1, semester: "Fall 2026" },
  { id: "s9", name: "Omar Farooq", visual: 35, auditory: 85, readWrite: 40, kinesthetic: 60, dominantStyle: "Auditory", collaborationPref: "group", participationLevel: "high", version: 2, semester: "Fall 2026" },
  { id: "s10", name: "Hira Butt", visual: 55, auditory: 45, readWrite: 70, kinesthetic: 78, dominantStyle: "Kinesthetic", collaborationPref: "pair", participationLevel: "medium", version: 1, semester: "Fall 2026" },
  { id: "s11", name: "Danish Iqbal", visual: 75, auditory: 60, readWrite: 50, kinesthetic: 40, dominantStyle: "Visual", collaborationPref: "solo", participationLevel: "low", version: 1, semester: "Fall 2026" },
  { id: "s12", name: "Maryam Javed", visual: 40, auditory: 70, readWrite: 85, kinesthetic: 50, dominantStyle: "Read/Write", collaborationPref: "pair", participationLevel: "medium", version: 2, semester: "Fall 2026" },
];

// --- Teachers ---
export const teachers: TeacherProfile[] = [
  { id: "t1", name: "Dr. Amir Hassan", teachingStyle: "Interactive / Discussion-Based", interactionLevel: "high", pacing: "moderate", approach: "Uses group activities, case studies, and Socratic questioning." },
  { id: "t2", name: "Prof. Nadia Qureshi", teachingStyle: "Lecture-Heavy / Visual", interactionLevel: "medium", pacing: "fast", approach: "Relies on structured slides, diagrams, and demonstrations." },
  { id: "t3", name: "Dr. Kamran Siddiqui", teachingStyle: "Hands-On / Lab-Oriented", interactionLevel: "high", pacing: "slow", approach: "Emphasizes practical exercises, coding labs, and experimentation." },
];

// --- Relationships (social graph edges) ---
export const relationships: Relationship[] = [
  { from: "s1", to: "s5", type: "friend", strength: 4 },
  { from: "s1", to: "s4", type: "study_partner", strength: 5 },
  { from: "s2", to: "s6", type: "friend", strength: 3 },
  { from: "s2", to: "s3", type: "study_partner", strength: 4 },
  { from: "s3", to: "s6", type: "study_partner", strength: 5 },
  { from: "s4", to: "s7", type: "friend", strength: 4 },
  { from: "s4", to: "s10", type: "study_partner", strength: 3 },
  { from: "s5", to: "s8", type: "friend", strength: 3 },
  { from: "s7", to: "s10", type: "friend", strength: 5 },
  { from: "s9", to: "s12", type: "study_partner", strength: 4 },
  { from: "s11", to: "s8", type: "study_partner", strength: 3 },
  { from: "s1", to: "s3", type: "conflict", strength: 2 },
  { from: "s7", to: "s11", type: "conflict", strength: 3 },
  { from: "s9", to: "s2", type: "neutral", strength: 1 },
];

// --- Sections ---
export const sections: Section[] = [
  { id: "sec-a", course: "Data Structures", courseCode: "CS201", teacherId: "t1", studentIds: ["s1", "s2", "s3", "s4", "s5", "s6"], state: "simulated", semester: "Fall 2026" },
  { id: "sec-b", course: "Data Structures", courseCode: "CS201", teacherId: "t2", studentIds: ["s7", "s8", "s9", "s10", "s11", "s12"], state: "simulated", semester: "Fall 2026" },
];

// --- Simulation Results ---
export const simulationResults: SimulationResult[] = [
  {
    sectionId: "sec-a",
    compatibilityScore: 78,
    styleDistribution: { visual: 38, auditory: 28, readWrite: 22, kinesthetic: 12 },
    predictedOutcome: "High",
    socialGraphImpact: "Supportive",
    recommendedTeacher: "Dr. Amir Hassan",
    factors: [
      { name: "Style Alignment", score: 82, impact: "positive" },
      { name: "Social Cohesion", score: 75, impact: "positive" },
      { name: "Class Balance", score: 71, impact: "positive" },
      { name: "Participation Mix", score: 80, impact: "positive" },
    ],
  },
  {
    sectionId: "sec-b",
    compatibilityScore: 54,
    styleDistribution: { visual: 22, auditory: 18, readWrite: 25, kinesthetic: 35 },
    predictedOutcome: "Medium",
    socialGraphImpact: "Neutral",
    recommendedTeacher: "Dr. Kamran Siddiqui",
    factors: [
      { name: "Style Alignment", score: 48, impact: "negative" },
      { name: "Social Cohesion", score: 60, impact: "neutral" },
      { name: "Class Balance", score: 55, impact: "neutral" },
      { name: "Participation Mix", score: 65, impact: "positive" },
    ],
  },
];

// --- Scenario data for what-if comparison ---
export interface Scenario {
  id: string;
  name: string;
  sections: { sectionId: string; teacherId: string; studentIds: string[] }[];
  results: SimulationResult[];
}

export const scenarios: Scenario[] = [
  {
    id: "scenario-a",
    name: "Scenario A — Current Assignment",
    sections: [
      { sectionId: "sec-a", teacherId: "t1", studentIds: ["s1", "s2", "s3", "s4", "s5", "s6"] },
      { sectionId: "sec-b", teacherId: "t2", studentIds: ["s7", "s8", "s9", "s10", "s11", "s12"] },
    ],
    results: simulationResults,
  },
  {
    id: "scenario-b",
    name: "Scenario B — Swapped Teachers",
    sections: [
      { sectionId: "sec-a", teacherId: "t2", studentIds: ["s1", "s2", "s3", "s4", "s5", "s6"] },
      { sectionId: "sec-b", teacherId: "t3", studentIds: ["s7", "s8", "s9", "s10", "s11", "s12"] },
    ],
    results: [
      {
        sectionId: "sec-a",
        compatibilityScore: 61,
        styleDistribution: { visual: 38, auditory: 28, readWrite: 22, kinesthetic: 12 },
        predictedOutcome: "Medium",
        socialGraphImpact: "Supportive",
        recommendedTeacher: "Dr. Amir Hassan",
        factors: [
          { name: "Style Alignment", score: 58, impact: "neutral" },
          { name: "Social Cohesion", score: 75, impact: "positive" },
          { name: "Class Balance", score: 55, impact: "neutral" },
          { name: "Participation Mix", score: 60, impact: "neutral" },
        ],
      },
      {
        sectionId: "sec-b",
        compatibilityScore: 82,
        styleDistribution: { visual: 22, auditory: 18, readWrite: 25, kinesthetic: 35 },
        predictedOutcome: "High",
        socialGraphImpact: "Supportive",
        recommendedTeacher: "Dr. Kamran Siddiqui",
        factors: [
          { name: "Style Alignment", score: 88, impact: "positive" },
          { name: "Social Cohesion", score: 72, impact: "positive" },
          { name: "Class Balance", score: 78, impact: "positive" },
          { name: "Participation Mix", score: 80, impact: "positive" },
        ],
      },
    ],
  },
];

// Helper
export function getStudent(id: string) { return students.find(s => s.id === id); }
export function getTeacher(id: string) { return teachers.find(t => t.id === id); }

# AI-Powered Digital Twin Platform for Classroom Intelligence

## Complete Project Documentation

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Core Concept](#3-core-concept)
4. [Team & Supervision](#4-team--supervision)
5. [Data Sources](#5-data-sources)
6. [PhD App Integration](#6-phd-app-integration)
7. [Features — Committed (FYP Scope)](#7-features--committed-fyp-scope)
8. [Features — Stretch Goals](#8-features--stretch-goals)
9. [Features — Post-FYP Roadmap](#9-features--post-fyp-roadmap)
10. [Explicitly Dropped Ideas](#10-explicitly-dropped-ideas)
11. [What This Platform Is NOT](#11-what-this-platform-is-not)
12. [System Architecture](#12-system-architecture)
13. [Technology Stack](#13-technology-stack)
14. [Tech Stack Analysis & Recommendations](#14-tech-stack-analysis--recommendations)
15. [User Roles](#15-user-roles)
16. [Competitive Analysis](#16-competitive-analysis)
17. [Research Contributions](#17-research-contributions)
18. [Project Timeline](#18-project-timeline)
19. [Important Caveats](#19-important-caveats)
20. [References](#20-references)

---

## 1. Project Overview

**Project Title:** AI-Powered Digital Twin Platform for Classroom Intelligence  
**Domain:** Artificial Intelligence in Education  
**Keywords:** Digital Twin, Learning Analytics, Compatibility Scoring, Social Graph Analysis, Classroom Intelligence  
**Proposal Date:** 19-March-2026  
**University:** Muhammad Ali Jinnah University (MAJU)  
**Duration:** ~12 months (Apr 2026 – Jan 2027)

This project develops an AI-powered platform that creates digital twins of students and teachers — structured behavioral profiles derived from psychological survey data — and simulates how different classroom configurations would perform **before** a semester begins. It is a **decision-support tool**, not a prediction engine that claims to guarantee learning outcomes.

The platform allows Heads of Department (HoDs) to test multiple section configurations, compare predicted compatibility and learning outcomes side by side, and make data-driven decisions about teacher assignments and student groupings.

---

## 2. Problem Statement

Academic institutions assign teachers to class sections each semester through a **largely manual process**. HoDs rely on intuition and limited historical data, with no structured mechanism to evaluate teacher-student compatibility beforehand. This results in:

- **Mismatches** between teaching styles and student learning preferences
- **Negative impact** on engagement and learning outcomes
- Problems **only discovered weeks into the semester**, when it's too late to course-correct
- **Peer relationships** (friendships, conflicts, study partnerships) are never considered during section planning despite significantly affecting classroom dynamics

---

## 3. Core Concept

The platform draws from multiple fields:

| Field | Application |
|-------|-------------|
| **Digital Twins** | Real-world entities (students/teachers) replicated digitally to test scenarios |
| **Learning Analytics** | Data-driven insights from educational data |
| **Agent-Based Modeling** | Simulating interactions between student and teacher agents |
| **Social Network Analysis** | Understanding peer relationship structures within classes |

The simulation considers:
- Learning style compatibility
- Teaching style compatibility
- Peer relationships between students
- Classroom composition balance

**Key differentiator:** No existing platform combines psychological learning style profiling, peer social graph analysis, and what-if scenario simulation for pre-semester classroom configuration. Existing tools (Canvas, Blackboard, Google Classroom) track what *happened* — this platform predicts what is *likely to happen* before it starts.

---

## 4. Team & Supervision

**Supervisor:** Dr. Syed Imran Jami (holds a senior administrative role at the institution with direct access to real institutional data)

| Role | Name | Student ID | Responsibility |
|------|------|-----------|----------------|
| **UI Designer** | Muniba Muhammad Taufiq | SP23-BSCS-0191 | All interface designs, component library, visual language. Works with Adnan throughout the build phase. |
| **Backend Developer** | Abdur Rehman Khubaib Rehmani | SP23-BSCS-0181 | FastAPI backend, compatibility scoring engine, social graph (NetworkX), database schema, Supabase integration, LLM API layer. |
| **Frontend Developer** | Adnan Kamal Manik | SP23-BSCS-0179 | Next.js + Tailwind frontend, all dashboard views, section builder, scenario testing interface, reports UI. |

Both developers are intermediate-level programmers. The team uses AI tools to speed up implementation but deliberately understands everything before committing code.

---

## 5. Data Sources

| Source | Description |
|--------|-------------|
| **Learning Style Survey Data** | Collected through the existing PhD-developed survey app. Outputs scores per student across multiple learning style dimensions (Felder-Silverman model). |
| **Additional Student Surveys** | Collaboration preferences, participation behavior, classroom engagement tendencies, peer relationship data (preferred collaborators, distracting peers). |
| **Teacher Teaching Style Data** | Teaching approach, interaction level, pacing preference, instructional approach — collected via a separate survey. |
| **Institutional Academic Data** | Academic records and institutional data (available through the supervisor) to enrich student profiles. |

---

## 6. PhD App Integration

A foundational component is an **existing survey and scoring application** built by previous bachelor students as part of PhD research by **Dr. Mubassher**, associated with and supervised by the project supervisor (Dr. Syed Imran Jami).

**What the PhD app does:**
- Collects student survey responses
- Processes them through the **Felder-Silverman Learning Style Model** (a renowned psychological model)
- Outputs learning style scores per student across multiple dimensions
- Generates content recommendations for teachers — suggesting how material should be presented based on dominant learning styles

**Integration approach:**
- The platform consumes the PhD app's output data (not built by this team)
- Data is ingested into the platform's Supabase database through a defined pipeline
- Content recommendations are surfaced in the Teacher Dashboard
- The team is building with **mock data** structured to mirror expected output until full access is received

---

## 7. Features — Committed (FYP Scope)

These 8 features are fully committed deliverables.

### F1: Student & Teacher Twin Generation
Each student and teacher is assigned a **digital twin** — a structured profile encoding behavioral characteristics.

- **Student profiles:** Generated from PhD app output — learning style scores across dimensions, dominant style, collaboration preference, participation tendency
- **Teacher profiles:** From a separate survey — teaching style, interaction level, pacing, instructional approach
- **Versioning:** Student profiles are versioned. Retaking the survey creates a new version while preserving history (enables longitudinal research)

### F2: Compatibility Scoring Engine
The academic core of the platform. Given a proposed section (teacher + student group), computes a **compatibility score (0–100)** from three weighted inputs:

1. **Learning-teaching style alignment** — teacher's style vs. distribution of student learning styles
2. **Social graph impact** — graph metrics assessing whether peer dynamics support or hinder engagement
3. **Class composition factors** — learning style spread, dominant-style match ratio

The exact weights are a design decision to be finalized during implementation, potentially informed by the PhD research model.

### F3: Social Graph Modeling
Peer relationships modeled as a **weighted directed graph**:

- **Nodes:** Students
- **Edges:** Relationships with type (friend, study partner, neutral, conflict) and strength (1–5)
- **Data source:** Student survey (preferred collaborators, distracting peers) + optional admin input
- **Computation:** NetworkX computes clustering coefficients, centrality scores, and other metrics
- **Output:** Fed into the compatibility scoring engine; visualized in the HoD dashboard

### F4: Section Builder
The primary HoD workspace:

- Create sections per course, assign teachers, add students
- Linked to course, department, semester, and year
- **Section states:** Draft (being configured) → Simulated (report generated) → Active (semester live)
- Entry point for triggering simulations

### F5: What-If Scenario Testing
The feature that makes this a **decision-support tool**:

- Create multiple named scenarios (e.g., Scenario A: Teacher X with advanced cohort; Scenario B: reverse)
- Simulate all scenarios
- Display results **side by side** — compatibility scores, style breakdowns, predicted outcomes
- **Expected centrepiece of the FYP live demonstration**

### F6: Simulation Report
Per-section output after simulation:

1. Dominant learning style + full distribution (percentages)
2. Compatibility score with factor breakdown
3. Predicted learning outcome indicator (High / Medium / Low)
4. Social graph impact summary
5. Recommended teacher for the section

Reports are viewable in dashboard and **exportable**.

### F7: Teacher Dashboard
A **read-only** view for teachers:

- Learning style breakdown of their assigned class (percentage distribution)
- Class profile summary
- Content approach recommendations from the PhD app's model
- Teachers **cannot** modify sections or trigger simulations

### F8: Multi-Tenant Architecture
Built from the start (not retrofitted):

- Each institution is a separate tenant with **isolated data**
- Users, sections, courses, profiles, reports — never visible across institutions
- Enforced at database level using Supabase **row-level security (RLS)**
- Super-admin handles institution onboarding
- HoD manages their own department within their institution

---

## 8. Features — Stretch Goals

Built only if core features are complete ahead of schedule.

### S1: Early Warning System
- Once semester is active, admins/teachers enter real data (attendance, grades)
- System compares against predicted learning outcomes
- **Automatic flags** raised if actual performance diverges significantly below prediction
- Flags categorized by type (engagement, performance, compatibility) and severity (low, medium, high)
- Closes the feedback loop between prediction and reality

### S2: Natural Language AI Query Interface
- LLM-powered (Claude API / OpenAI API)
- HoDs ask plain English questions: *"Which teacher is best for the evening section of CS101?"*
- System processes query using platform data, returns natural language response with recommendation + reasoning
- API call from backend (keys never exposed to client)
- Lowers barrier for non-technical administrators

### S3: Longitudinal Analytics
- Leverages versioned student profiles
- Timeline view showing how learning style scores shift across semesters
- Accessible to HoDs for planning
- **Genuine research contribution** — tracking learning style evolution at scale

---

## 9. Features — Post-FYP Roadmap

Intentionally out of FYP scope. Planned for commercial product after graduation.

| ID | Feature | Description |
|----|---------|-------------|
| R1 | **Live Engagement Monitoring** | Real-time tracking using attendance, participation, assignment submissions as proxies. Week-by-week timeline per section. |
| R2 | **AI-Generated Teaching Reports** | Automated end-of-semester reports per teacher — performance vs predictions, what worked, recommendations. LLM-generated. |
| R3 | **Student-Facing View** | Students see own profile, scores over time, study approach recommendations. Read-only. |
| R4 | **Post-Semester Validation Engine** | Automated comparison of predictions vs actual outcomes. Deviation data fed back to improve scoring accuracy. Foundation for academic publication. |

---

## 10. Explicitly Dropped Ideas

| Dropped Item | Reason |
|-------------|--------|
| Real-time minute-by-minute class simulation | Too complex, not grounded in available data, no clear value over a well-designed report |
| Animated classroom visualization | Visually appealing but academically shallow; heavy dev time for no real insight |
| Mobile application | Web platform is sufficient for target users; would double frontend work |
| Node.js backend | Python needed for compatibility engine, NetworkX, and future ML integration |
| Custom authentication system | Supabase handles auth; custom auth wastes dev time |
| Blockchain / decentralized storage | Not relevant to the problem |
| LMS features (assignments, grading, content) | This is not a learning management system |

---

## 11. What This Platform Is NOT

- **Not an LMS** — does not host course content, manage assignments, or grade students
- **Not a replacement for Canvas/Blackboard/Google Classroom** — those track what happens during a semester; this predicts before it starts
- **Not a prediction engine** — generates informed estimates and compatibility indicators, not guaranteed outcomes
- **Does not generate or host academic content** — content recommendations come from the PhD app
- **No real-time minute-by-minute simulation** — produces comprehensive reports, not live playback

---

## 12. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    USER ROLES                        │
│         HoD/Admin  ·  Teacher  ·  Super Admin       │
└──────────────────────────┬──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│           FRONTEND — Next.js + Tailwind CSS          │
│                                                      │
│  Section Builder  ·  What-If Scenarios  ·  Reports   │
│  Teacher Dashboard  ·  Multi-Tenant Dashboard        │
│  Admin Panels  ·  Report Export                       │
│                        (Vercel)                       │
└──────────────────────────┬──────────────────────────┘
                           │ REST API
┌──────────────────────────▼──────────────────────────┐
│          BACKEND — Python + FastAPI                   │
│                                                      │
│  Compatibility Scoring Engine  ·  Data Ingestion     │
│  Auth + Multi-Tenant Logic  ·  Scenario Engine       │
│  Social Graph (NetworkX)  ·  Report Generation       │
│  LLM API Integration (Claude/OpenAI)                 │
│                       (Railway)                       │
└───────────┬─────────────────────────┬───────────────┘
            │                         │
┌───────────▼───────────┐   ┌────────▼────────────────┐
│  SUPABASE (PostgreSQL) │   │  Existing PhD Survey App │
│                        │   │  (External System)       │
│  Database + Auth       │   │  Felder-Silverman Model  │
│  Row-Level Security    │   │  Learning Style Scores   │
│  Multi-Tenant Isolation│   │  Content Recommendations │
└────────────────────────┘   └─────────────────────────┘
```

**Key architectural decisions:**
- Frontend communicates with backend via **REST API** only
- NetworkX runs **in-process** within FastAPI (no separate service)
- LLM API calls made from **backend only** (API keys never exposed to client)
- Multi-tenancy enforced at **database level** with RLS policies
- PhD app is an **external system** — output data is ingested, not the app itself

---

## 13. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Frontend** | Next.js + Tailwind CSS | Team has React experience. Next.js adds routing, SSR, and structure. Tailwind enables efficient UI implementation. |
| **Backend** | Python + FastAPI | FastAPI is modern and fast. Python required for compatibility engine, NetworkX, and AI/ML ecosystem. |
| **Database + Auth** | Supabase (PostgreSQL) | Combined database and auth. Multi-tenant RLS well-supported. Saves significant dev time. |
| **Social Graph** | NetworkX (Python) | Industry-standard graph library. Handles weighted directed graphs, centrality, clustering natively. |
| **AI / LLM** | Claude API / OpenAI API | For NL query interface (stretch goal) and report summaries. Called from backend only. |
| **Frontend Hosting** | Vercel | Free tier sufficient. Developer-friendly deployment. |
| **Backend Hosting** | Railway | Developer-friendly with straightforward deployment pipelines. |

---

## 14. Tech Stack Analysis & Recommendations

### Overall Verdict: Strong Stack for This Project

The chosen stack is **well-suited** for a 2-developer FYP team building a data-intensive, AI-powered platform. The decisions are pragmatic and defensible. Below is a layer-by-layer analysis.

---

### Frontend: Next.js + Tailwind CSS — Excellent Choice

**Strengths:**
- Team has existing React experience, so the learning curve is minimal
- Next.js provides file-based routing, SSR/SSG, API routes, and strong project structure out of the box
- Tailwind CSS is highly productive for a team with a dedicated UI designer — utility classes translate designs to code fast
- Vercel deployment is zero-config for Next.js (it's built by the same company)

**Consideration:**
- For the **social graph visualization** (F3), you will need a graph rendering library on the frontend. Recommended options:
  - **React Flow** — best for interactive node-based UIs, drag-and-drop friendly
  - **D3.js** (via `react-d3-graph` or raw D3) — most powerful and customizable, steeper learning curve
  - **vis-network** (via `react-vis-network-graph`) — lightweight, good for simple graph display
  - **Cytoscape.js** — strong for network analysis visualization specifically
- For the **charts and data visualization** (style distributions, score breakdowns, reports), consider **Recharts** (React-native, simple) or **Chart.js** (via `react-chartjs-2`).

**Verdict:** Keep as-is. No change needed.

---

### Backend: Python + FastAPI — Excellent Choice

**Strengths:**
- Python is the **only sensible choice** here given NetworkX, potential ML integration, and the AI/LLM ecosystem
- FastAPI is modern, async-capable, auto-generates OpenAPI docs, has excellent type validation via Pydantic
- The compatibility engine, graph computation, and LLM orchestration all live naturally in Python
- FastAPI's dependency injection system is clean for multi-tenant logic (extracting institution context per request)

**Consideration:**
- Use **Pydantic models** rigorously for all API request/response schemas — this gives you automatic validation and documentation for free
- For the compatibility scoring engine, consider structuring it as a **service layer** separate from API routes so it's independently testable
- Railway hosting is fine for FYP, but be aware of cold starts on free/hobby tiers — if demo performance matters, keep the instance warm before presentations

**Verdict:** Keep as-is. This was the right call over Node.js.

---

### Database + Auth: Supabase (PostgreSQL) — Good Choice with Caveats

**Strengths:**
- Combines database + auth + RLS in one service — massive time saver for a 2-person team
- PostgreSQL is the right database for this relational data model (institutions, departments, courses, sections, profiles, relationships)
- Row-Level Security is a clean way to enforce multi-tenancy without application-level filtering everywhere
- Supabase client libraries are well-documented for both Next.js and Python

**Caveats:**
- **RLS policies can become complex** — test them thoroughly. A misconfigured policy can either leak data across tenants or block legitimate access. Write integration tests specifically for RLS
- **Supabase free tier limits:** 500MB database, 50MB file storage, 50K monthly active users. This is fine for FYP but keep it in mind
- For the **survey data ingestion pipeline**, Supabase's PostgreSQL supports `COPY` and bulk inserts — use these rather than row-by-row insertion for performance
- Consider using **Supabase Edge Functions** for lightweight webhook-style operations (e.g., triggering a profile rebuild when new survey data arrives), but keep heavy computation in FastAPI

**Verdict:** Keep as-is. The time savings justify any trade-offs for an FYP.

---

### Social Graph: NetworkX — Perfect Choice

**Strengths:**
- Industry-standard Python library for exactly this use case
- Handles weighted directed graphs, centrality, clustering coefficients, community detection — all needed for the social graph
- Runs in-process (no separate service to deploy/maintain)
- Well-documented with extensive algorithms built in

**Consideration:**
- NetworkX is **in-memory** — it loads the entire graph into RAM. This is completely fine for classroom-sized graphs (30–200 students per section). It would only be a problem at tens of thousands of nodes, which is not your case
- For **graph persistence**, store edges in PostgreSQL and reconstruct the NetworkX graph on demand. Don't try to serialize NetworkX objects into the database

**Verdict:** Keep as-is. No alternative needed.

---

### AI / LLM: Claude API or OpenAI API — Good Choice

**Strengths:**
- Both APIs are mature, well-documented, and easy to call from Python
- Claude API (Anthropic) has strong reasoning capabilities ideal for the NL query interface
- Calling from backend only is the correct security decision

**Recommendation:**
- **Default to the Claude API** (Anthropic SDK for Python). Claude models are strong at structured reasoning over data, which is exactly what the NL query feature needs (interpreting section data + generating recommendations)
- Use the latest Claude model (`claude-sonnet-4-6` for speed, `claude-opus-4-6` for complex reasoning) — these are the most capable as of 2026
- Structure LLM calls with **system prompts** that define the platform's data schema and scoring logic, then pass relevant section/profile data as context per query
- Set a **token budget** per query to control costs

**Verdict:** Keep as-is. Recommend Claude API as primary.

---

### Hosting: Vercel + Railway — Appropriate for FYP

**Strengths:**
- Both are developer-friendly with Git-based deployment
- Vercel is purpose-built for Next.js
- Railway supports Python/FastAPI with minimal configuration

**Consideration:**
- **Railway free tier** was deprecated — check current pricing. Alternative: **Render** (free tier available for web services, supports FastAPI, auto-deploys from Git). Another option: **Fly.io** (generous free tier, good for Python backends)
- For the **FYP demo**, ensure the backend is warm (not cold-starting) — hit the health endpoint a few minutes before presenting
- Set up **environment variables** properly on both platforms (Supabase URL, API keys, LLM keys) — never commit these to Git

**Verdict:** Vercel is a keep. For Railway, verify current pricing and consider **Render** as an alternative if Railway's free tier is no longer available.

---

### What's Missing from the Stack (Recommendations to Add)

| Need | Recommendation | Why |
|------|---------------|-----|
| **Graph visualization (frontend)** | React Flow or D3.js | Required for F3 (social graph display in HoD dashboard) |
| **Charts & data viz** | Recharts or Chart.js | Required for style distribution charts, score breakdowns, reports |
| **PDF export** | `react-pdf` (frontend) or `WeasyPrint`/`reportlab` (backend) | F6 requires exportable reports |
| **State management** | Zustand or React Context | For managing scenario comparison state, section builder state |
| **API client** | Axios or TanStack Query (React Query) | For structured API calls, caching, loading states in the frontend |
| **Form handling** | React Hook Form + Zod | For survey forms, section builder inputs — validation without boilerplate |
| **Testing** | Pytest (backend) + Vitest (frontend) | Essential for the compatibility engine and RLS policy testing |

---

### Summary Verdict

| Layer | Choice | Rating | Action |
|-------|--------|--------|--------|
| Frontend | Next.js + Tailwind | Excellent | Keep |
| Backend | Python + FastAPI | Excellent | Keep |
| Database + Auth | Supabase (PostgreSQL) | Good | Keep, test RLS thoroughly |
| Social Graph | NetworkX | Perfect | Keep |
| AI/LLM | Claude / OpenAI API | Good | Keep, prefer Claude API |
| Frontend Hosting | Vercel | Excellent | Keep |
| Backend Hosting | Railway | Good | Verify pricing, consider Render as backup |

**The stack is production-grade, well-reasoned, and right-sized for the team.** No major changes recommended. The additions above (graph viz, charts, PDF export, testing) are libraries to add within the existing stack, not replacements.

---

## 15. User Roles

| Role | Access Level | Capabilities |
|------|-------------|-------------|
| **Super Admin** | Platform-wide | Institution onboarding, platform management |
| **HoD / Admin** | Institution + Department | Section builder, scenario testing, simulation reports, early warnings, NL query, longitudinal analytics |
| **Teacher** | Own sections only | View class learning style breakdown, content recommendations (read-only) |
| **Student** | Post-FYP only (R3) | View own learning profile and study recommendations (read-only, future feature) |

---

## 16. Competitive Analysis

| Competitor | Category | Gap This Platform Fills |
|-----------|----------|------------------------|
| Canvas / Blackboard / Google Classroom | LMS (course delivery) | No pre-semester planning, compatibility analysis, or simulation |
| Knewton / DreamBox / ALEKS | Adaptive Learning | Individual student focus; no classroom-level configuration or section planning |
| BrightBytes / Civitas Learning | Retrospective Analytics | Analyze historical data only; no future simulation or social graph data |

**This platform's unique position:** Pre-semester, forward-looking, combining psychological profiling + social graphs + what-if simulation. No existing platform does all three together.

---

## 17. Research Contributions

1. **Psychological profiling at scale** — Using a validated, computerized psychological learning style model (Felder-Silverman) as the basis for generating student behavioral profiles
2. **Social graph in compatibility scoring** — Incorporating peer social relationship graphs into compatibility scoring for classroom configurations
3. **What-if simulation engine** — Combining both inputs into a scenario simulation engine that produces comparable, side-by-side predictions of classroom outcomes before the semester begins
4. **Longitudinal learning style tracking** (stretch goal) — Tracking learning style evolution across semesters using versioned profiles — not studied at scale with a computerized psychological model

---

## 18. Project Timeline

**Total Duration:** ~12 months (Apr 2026 – Jan 2027)  
**Summer Break:** Jul–Aug 2026 (between Phase 2 and Phase 3)  
**FYP-1:** Phases 1–2 (Apr–Jun 2026, pre-summer)  
**FYP-2:** Phases 3–6 (Sep 2026–Jan 2027, post-summer)

### Phase 1 — Foundation & Setup (Apr–May 2026)

| Task | Duration | Assigned To |
|------|----------|-------------|
| Project scaffolding & stack setup | 5 days | Khubaib, Adnan |
| Database schema design | 7 days | Khubaib |
| Authentication & multi-tenant RLS setup | 7 days | Khubaib |
| UI/UX design — all screens & components | 14 days | Muniba |
| Mock data design & PhD app integration planning | 7 days | Khubaib, Adnan |
| Institution onboarding UI | 7 days | Adnan |
| Institution onboarding backend | 7 days | Khubaib |
| Phase 1 milestone demo & review | 2 days | All |

### Phase 2 — Twin Generation & Profiles (May–Jun 2026)

| Task | Duration | Assigned To |
|------|----------|-------------|
| Student profile model & versioning logic | 10 days | Khubaib |
| Teacher profile model & survey | 7 days | Khubaib |
| Survey data ingestion pipeline | 7 days | Khubaib |
| Profile display UI & survey forms | 10 days | Adnan |
| Dashboard design & component library | 10 days | Muniba |
| Phase 2 milestone demo & review | 2 days | All |

### *Summer Break (Jul–Aug 2026)*

### Phase 3 — Scoring Engine & Section Builder (Sep–Oct 2026)

| Task | Duration | Assigned To |
|------|----------|-------------|
| Compatibility scoring algorithm | 14 days | Khubaib |
| Social graph modeling (NetworkX) | 10 days | Khubaib |
| Section builder UI | 14 days | Adnan |
| What-if scenario testing UI | 10 days | Adnan |
| Graph visualization & scenario UX design | 14 days | Muniba |
| Scenario comparison backend API | 7 days | Khubaib |
| Phase 3 milestone demo & review | 2 days | All |

### Phase 4 — Reports & Dashboards (Oct–Nov 2026)

| Task | Duration | Assigned To |
|------|----------|-------------|
| Simulation report generation logic | 10 days | Khubaib |
| Report UI & export functionality | 10 days | Adnan |
| Teacher dashboard implementation | 7 days | Adnan |
| HoD dashboard data aggregation | 7 days | Khubaib |
| Report layout & dashboard design | 10 days | Muniba |
| Phase 4 milestone demo & review | 2 days | All |

### Phase 5 — Stretch Goals (if on track)

| Task | Description |
|------|-------------|
| Early Warning System | Real data vs. prediction comparison + flagging |
| Natural Language AI Query | LLM-powered query interface |
| Longitudinal Analytics | Profile version comparison over time |

### Phase 6 — Testing & Presentation (Dec 2026–Jan 2027)

| Task | Duration | Assigned To |
|------|----------|-------------|
| Integration testing with real data | 10 days | Khubaib, Adnan |
| Bug fixes & polish | 7 days | Khubaib, Adnan |
| UI polish & final design review | 7 days | Muniba, Adnan |
| FYP report writing | 14 days | All |
| Demo preparation | 7 days | All |
| Final presentation | 1 day | All |

---

## 19. Important Caveats

These constraints must be reflected accurately in all project documentation:

1. **PhD app integration is promised but details pending** — The exact output format and data schema have not been received yet. The team builds with mock data structured to mirror expected output.
2. **Compatibility scoring weights not finalized** — The approach and inputs are defined, but exact numerical weights will be determined during implementation.
3. **Decision-support tool, NOT a prediction engine** — Must never claim the system accurately predicts grades or guarantees learning outcomes. It generates informed estimates and compatibility indicators.
4. **Two intermediate-level developers** — Scope must reflect a realistic workload for 2 developers + 1 UI designer.
5. **No real-time simulation** — No minute-by-minute classroom playback. The platform produces comprehensive reports.
6. **No content generation or hosting** — Content recommendations come from the PhD app's existing model, not from this platform.
7. **The Felder-Silverman model is confirmed** as the psychological model used by the PhD app (computerized by Dr. Mubassher, supervised by Dr. Syed Imran Jami).

---

## 20. References

1. Felder, R. M., & Silverman, L. K. (1988). *Learning and Teaching Styles in Engineering Education.* Engineering Education, 78(7), 674-681.
2. Grieves, M. (2014). *Digital Twin: Manufacturing Excellence through Virtual Factory Replication.* White Paper, Florida Institute of Technology.
3. Siemens, G., & Baker, R. S. J. (2012). *Learning Analytics and Educational Data Mining: Towards Communication and Collaboration.* Proceedings of the 2nd International Conference on Learning Analytics and Knowledge.
4. Wasserman, S., & Faust, K. (1994). *Social Network Analysis: Methods and Applications.* Cambridge University Press.
5. Hagberg, A., Schult, D., & Swart, P. (2008). *Exploring Network Structure, Dynamics, and Function using NetworkX.* Proceedings of the 7th Python in Science Conference.

# ClassIQ

### AI-Powered Digital Twin Platform for Classroom Intelligence

## Complete Project Documentation

---

## Document Status

**Brand:** ClassIQ (chosen 2026-05-11; replaces the working title "Classroom Digital Twin"). The long-form academic title above is retained as the formal project description.
**Last updated:** 4 September 2026
**Phase:** FYP-2 build (Phases 3–6 in progress). All eight committed features and the three stretch goals are implemented; remaining work is applying migrations to the shared database, integration testing with real data, and the report / presentation (see §18 and §21).
**Companion docs:** [BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md) · [DATA_MODEL.md](DATA_MODEL.md) · [ClassIQ-design-guide.pdf](ClassIQ-design-guide.pdf) · SQL in [`db/schema.sql`](../db/schema.sql)

### Changelog — what's changed since the proposal

The original proposal text below is preserved. These are the decisions and changes made during the build that supersede or refine it:

1. **Brand → ClassIQ.** Teal `#0D9488` / deep-purple `#3E2F7E` palette with mint, lilac, coral and amber accents, per the design guide. Brand tokens live in `frontend/src/lib/brand.ts`.
2. **Repository flattened into a monorepo.** The standalone `prototype/` (with its own nested git history) was removed. The project now lives as `backend/` (FastAPI) + `frontend/` (Next.js 16) + `db/` (SQL) + `Docs/`. See §20.
3. **Learning-style model locked to FSLSM and fully implemented.** Four Felder-Silverman axes scored on the conventional **−11…+11** scale from the **44-question ILS**. The earlier VARK mock fields were a mistake and have been removed everywhere.
4. **Compatibility engine is built — with concrete default weights.** It now combines **four** weighted factors (a *participation mix* factor was added to the original three): style alignment **0.40**, social cohesion **0.25**, class balance **0.20**, participation **0.15**. Weights are centralised and configurable; final score is 0–100 → predicted outcome High ≥70 / Medium 50–69 / Low <50.
5. **Frontend data-flow is split by area.** HoD/teacher pages **read Supabase directly** (server components, RLS-scoped); **writes** go through the FastAPI backend; **admin** pages use the backend for **both** reads and writes. See §12.
6. **Supabase keys use the new naming.** `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (browser, RLS-protected) and `SUPABASE_SECRET_KEY` (backend, RLS-bypassing) — not the deprecated `anon` / `service_role` names.
7. **Multi-tenancy is enforced two ways.** Frontend reads rely on Supabase **RLS**; the FastAPI backend connects with the **secret key, bypasses RLS, and scopes every query by `institution_id` in application code**.
8. **An institution-admin layer was added** beyond the original eight features: user provisioning with **CSV bulk import** (preview → commit), department management, HoD assignment, institution analytics, and an append-only **audit log**.
9. **Own ingestion layer.** ClassIQ collects its own surveys and builds its own ingestion path — there is no external app to integrate. An `ingestion_jobs` table models four sources (`rdf_bulk_import`, `form_app`, `classiq_internal`, `manual_admin`) that all converge on one internal schema. The FSLSM model and teaching content recommendations come from **Mr. Mubassher** (external); ClassIQ builds no content-recommendation engine.
10. **Actual tech stack pinned** (§13): Next.js 16.2.6 / React 19 / Tailwind 4 / TypeScript 5 on the front end; Python + FastAPI / SQLAlchemy 2 (async) + asyncpg / NetworkX 3.4 / python-jose on the back end. The social graph is rendered with a **custom dependency-free SVG force layout** (not React Flow/D3); charts use **Recharts**; report export uses the **browser print pipeline** (Save as PDF).
11. **F5 what-if scenarios are complete (4 Sep 2026).** `POST/GET/PATCH/DELETE /api/scenarios`, `/simulate`, `/compare` (side-by-side vs the live baseline with per-factor deltas and roster diffs) and `/apply` (copies the scenario onto real sections and re-scores them). The scenarios page has a builder that can start from any live section.
12. **Own ingestion pipeline built.** `backend/app/ingestion/` holds the RDF, CSV, form-app and manual adapters; `services/ingestion_service.py` validates, resolves students, stores raw answers, scores FSLSM and writes a new profile version, with per-row savepoints and idempotency on `external_response_id`. The repo's RDF dump (176 students) parses cleanly end to end; `/ingestion` page for HoD / admins.
13. **Section lifecycle and roster editing.** `activate` / `archive` / `reopen` / `delete` endpoints implement the §7 state machine; `PUT /sections/{id}/students` replaces the roster. Course creation now goes through `POST /api/institution/courses` (audited) instead of a direct Supabase insert.
14. **Stretch goals implemented.** S1 early warning (`section_outcomes`, `early_warning_flags`, pure comparator, teacher data entry, HoD flag triage), S2 Ask ClassIQ (Claude API via the official SDK, backend-only key, cached system prompt + tenant snapshot, per-query token cap, refusal-aware), S3 longitudinal analytics (profile-history per student, cohort drift per term / version).
15. **Automated tests exist.** `backend/tests/` (pytest: engines, adapters, auth path, RLS isolation when a test DB is present) and `frontend/src/**/*.test.ts` (Vitest). See [FYP2_IMPLEMENTATION_PLAN.md](FYP2_IMPLEMENTATION_PLAN.md) for the phase plan that drove this.

---

## Table of Contents

- [Document Status & Changelog](#document-status)
1. [Project Overview](#1-project-overview)
2. [Problem Statement](#2-problem-statement)
3. [Core Concept](#3-core-concept)
4. [Team & Supervision](#4-team--supervision)
5. [Data Sources](#5-data-sources)
6. [FSLSM Source & Ingestion Strategy](#6-fslsm-source--ingestion-strategy)
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
20. [Repository Structure & Companion Docs](#20-repository-structure--companion-docs)
21. [Current Implementation Status (September 2026)](#21-current-implementation-status-september-2026)
22. [References](#22-references)

---

## 1. Project Overview

**Product Name:** ClassIQ
**Project Title:** AI-Powered Digital Twin Platform for Classroom Intelligence  
**Domain:** Artificial Intelligence in Education  
**Keywords:** Digital Twin, Learning Analytics, Compatibility Scoring, Social Graph Analysis, Classroom Intelligence  
**Proposal Date:** 19-March-2026  
**University:** Muhammad Ali Jinnah University (MAJU)  
**Duration:** ~12 months (Apr 2026 – Jan 2027)

ClassIQ is an AI-powered platform that creates digital twins of students and teachers — structured behavioral profiles derived from psychological survey data — and simulates how different classroom configurations would perform **before** a semester begins. It is a **decision-support tool**, not a prediction engine that claims to guarantee learning outcomes.

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
| **UI Designer** | Muniba Muhammad Taufiq | SP23-BSCS-0191 | All interface designs, component library, visual language (ClassIQ design guide). Works with Adnan throughout the build phase. |
| **Backend Developer** | Abdur Rehman Khubaib Rehmani | SP23-BSCS-0181 | FastAPI backend, compatibility scoring engine, social graph (NetworkX), database schema, Supabase integration, LLM API layer. |
| **Frontend Developer** | Adnan Kamal Manik | SP23-BSCS-0179 | Next.js + Tailwind frontend, all dashboard views, section builder, scenario testing interface, reports UI. |

Both developers are intermediate-level programmers. The team uses AI tools to speed up implementation but deliberately understands everything before committing code.

---

## 5. Data Sources

| Source | Description |
|--------|-------------|
| **Learning Style Survey Data** | Collected through ClassIQ's own survey, scored with the **FSLSM** model (developed by Mr. Mubassher) across the four Felder-Silverman axes (see below). |
| **Additional Student Surveys** | Collaboration preferences, participation behavior, classroom engagement tendencies, peer relationship data (preferred collaborators, distracting peers). Stored as auxiliary student profiles. |
| **Teacher Teaching Style Data** | Teaching approach, interaction level, pacing preference, instructional approach — collected via a separate survey. |
| **Institutional Academic Data** | Academic records and institutional data (available through the supervisor) to enrich student profiles. |

### Learning-style model — Felder-Silverman (FSLSM)

ClassIQ uses the **Felder-Silverman Learning Style Model**, scored from the **44-question Index of Learning Styles (ILS)**. Each student is scored on four bipolar axes, on the conventional signed **−11…+11** integer scale (odd values; sign = pole, magnitude = strength):

1. **Active / Reflective** — how the learner processes information
2. **Sensing / Intuitive** — how the learner perceives information
3. **Visual / Verbal** — how information is presented
4. **Sequential / Global** — how the learner progresses toward understanding

> Note: an earlier prototype mistakenly used **VARK** (Visual/Auditory/Read-Write/Kinesthetic) fields in its mock data. VARK is a different, unrelated instrument and has been removed. All schema, types, scoring, charts, and reports use the four FSLSM axes.

---

## 6. FSLSM Source & Ingestion Strategy

ClassIQ's learning-style foundation is the **Felder-Silverman Learning Style Model (FSLSM)** developed by **Mr. Mubassher**, associated with and supervised by the project supervisor (Dr. Syed Imran Jami). There is **no external "app"** to integrate — ClassIQ collects its own surveys and runs its own scoring and ingestion.

**What comes from Mr. Mubassher (external):**
- The **FSLSM** learning-style model itself (the four Felder-Silverman axes, scored from the 44-question ILS).
- **Teaching content recommendations** — suggestions on how material should be presented based on dominant learning styles. ClassIQ surfaces these in the Teacher Dashboard but does **not** build its own content-recommendation engine.

**What ClassIQ builds itself:**
- Its **own survey collection** and an **ingestion layer** (scope: ingestion + scoring). ClassIQ implements the FSLSM scorer over the ILS responses.
- An `ingestion_jobs` table models the import lifecycle and four source types — `rdf_bulk_import`, `form_app`, `classiq_internal`, `manual_admin` — all designed to converge on the **same internal schema**.
- The team can run the FSLSM scorer over the existing RDF dump (`Data_File_Collected_Data_for_KG_in_RDF_Triples.rdf` — 176 students, 44 A/B answers each) as a one-time bulk import, or over a ClassIQ-collected survey (`form_app`).
- The team builds with **mock/sample data** structured to mirror expected output until full access is received.

**The one external dependency** is the teaching content recommendations — they come from **Mr. Mubassher's FSLSM work**, not from ClassIQ.

---

## 7. Features — Committed (FYP Scope)

These 8 features are fully committed deliverables. Build status as of June 2026 is noted per feature (detail in §21).

### F1: Student & Teacher Twin Generation — **implemented**
Each student and teacher is assigned a **digital twin** — a structured profile encoding behavioral characteristics.

- **Student profiles:** Generated from FSLSM scoring of ILS responses — four axis scores (−11…+11), dominant axis, plus auxiliary collaboration/participation attributes
- **Teacher profiles:** From a separate survey — teaching style, interaction level (low/medium/high), pacing (slow/moderate/fast), instructional approach
- **Versioning:** Profiles are versioned (`version` + `is_current` flag). Retaking the survey creates a new version while preserving history (enables longitudinal research)

### F2: Compatibility Scoring Engine — **implemented**
The academic core of the platform. Given a proposed section (teacher + student group), it computes a **compatibility score (0–100)** as a weighted mean of **four** factors:

| Factor | Default weight | What it measures |
|--------|:-------------:|------------------|
| **Style alignment** | 0.40 | Teacher's traits (interaction, pacing) mapped to FSLSM-axis affinities vs. the class's mean axis profile |
| **Social cohesion** | 0.25 | NetworkX graph metrics — positive-tie connectivity & clustering, penalised by conflict density and isolation |
| **Class balance** | 0.20 | Shannon entropy of the dominant-axis distribution across the four FSLSM axes |
| **Participation mix** | 0.15 | L1 distance of the class participation mix from an ideal (15% low / 55% medium / 30% high) |

The final score maps to a predicted outcome: **High ≥70**, **Medium 50–69**, **Low <50**. Weights are centralised in the scoring pipeline and configurable; the exact final values may still be tuned and potentially informed by Mr. Mubassher's FSLSM model.

### F3: Social Graph Modeling — **implemented**
Peer relationships modeled as a **weighted directed graph**:

- **Nodes:** Students
- **Edges:** Relationships with type (friend, study partner, neutral, conflict) and strength (1–5)
- **Data source:** Student survey (preferred collaborators, distracting peers) + optional admin input; relationships are scoped per academic term
- **Computation:** NetworkX computes clustering, connectivity, conflict density, and isolation (edge-type weights: friend 1.0, study_partner 1.2, neutral 0.0, conflict −1.0)
- **Output:** Fed into the compatibility scoring engine (social cohesion factor) and visualized in the HoD dashboard via a custom force-directed SVG graph

### F4: Section Builder — **implemented**
The primary HoD workspace:

- Create sections per course, assign teachers, add students
- Linked to course, department, academic term, and year
- **Section states:** Draft (being configured) → Simulated (report generated) → Active (semester live) → Archived
- Entry point for triggering simulations (`POST /api/sections/{id}/simulate`)

### F5: What-If Scenario Testing — **implemented**
The feature that makes this a **decision-support tool**:

- Compose named scenarios (one or more hypothetical sections: course, label, teacher, roster), optionally starting from a live section
- Run the same scoring engine on every scenario section; compare each against the live baseline **side by side** — compatibility score, per-factor deltas, roster changes, predicted outcomes
- Apply a winning scenario onto the real sections (audited, re-scored immediately)
- **Centrepiece of the FYP live demonstration**

### F6: Simulation Report — **implemented**
Per-section output after simulation:

1. Dominant learning style + full FSLSM distribution (percentages)
2. Compatibility score with **per-factor breakdown** (score, weight, contribution)
3. Predicted learning outcome indicator (High / Medium / Low)
4. Social graph impact summary (supportive / neutral / hindering)
5. Recommended teacher for the section

Reports are viewable in the dashboard and **exportable** via the browser print pipeline ("Export PDF" / "Print" → Save as PDF — dependency-free).

### F7: Teacher Dashboard — **implemented**
A **read-only** view for teachers:

- FSLSM learning-style breakdown of their assigned class (percentage distribution)
- Class profile summary
- Content approach recommendations from Mr. Mubassher's FSLSM model
- Teachers **cannot** modify sections or trigger simulations

### F8: Multi-Tenant Architecture — **implemented**
Built from the start (not retrofitted):

- Each institution is a separate tenant with **isolated data**
- Users, sections, courses, profiles, reports — never visible across institutions
- **Two-layer enforcement:** Supabase **row-level security (RLS)** for direct frontend reads, **plus** application-level `institution_id` scoping on every backend query (the backend uses the secret key and bypasses RLS)
- Super-admin handles institution onboarding; an **institution-admin** role manages users, departments, and HoD assignment within the institution; HoD manages their own department

---

## 8. Features — Stretch Goals

Built only if core features are complete ahead of schedule.

### S1: Early Warning System — **implemented**
- Once semester is active, admins/teachers enter real data (attendance, grades)
- System compares against predicted learning outcomes
- **Automatic flags** raised if actual performance diverges significantly below prediction
- Flags categorized by type (engagement, performance, compatibility) and severity (low, medium, high)
- Closes the feedback loop between prediction and reality

### S2: Natural Language AI Query Interface — **implemented ("Ask ClassIQ")**
- LLM-powered via the Claude API (official `anthropic` SDK, default model `claude-opus-5`, configurable). The backend builds a tenant-scoped JSON snapshot (sections, results, teachers, scenarios, FSLSM distribution — names only, no emails) and sends it as a cached system block; answers are capped per query and logged to the audit trail.
- HoDs ask plain English questions: *"Which teacher is best for the evening section of CS101?"*
- System processes query using platform data, returns natural language response with recommendation + reasoning
- API call from backend (keys never exposed to client)
- Lowers barrier for non-technical administrators

### S3: Longitudinal Analytics — **implemented**
- Leverages versioned student profiles (`is_current` / `version`)
- Timeline view showing how FSLSM scores shift across semesters
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
- **Does not generate or host academic content** — content recommendations come from Mr. Mubassher's FSLSM model
- **No real-time minute-by-minute simulation** — produces comprehensive reports, not live playback

---

## 12. System Architecture

```
┌─────────────────────────────────────────────────────┐
│                    USER ROLES                        │
│  Super Admin · Institution Admin · HoD · Teacher     │
└──────────────────────────┬──────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────┐
│        FRONTEND — Next.js 16 + React 19 + Tailwind 4 │
│                     (frontend/, Vercel)              │
│                                                      │
│  Section Builder · What-If Scenarios · Reports       │
│  Teacher Dashboard · HoD Dashboard · Social Graph    │
│  Admin Panels (users / CSV import / depts / audit)   │
└───────────┬───────────────────────────┬─────────────┘
            │ direct reads               │ writes (all roles)
            │ (HoD/teacher,              │ + admin reads
            │  server components,        │ Bearer JWT
            │  RLS via publishable key)  │
            │                ┌───────────▼─────────────┐
            │                │  BACKEND — Python +      │
            │                │  FastAPI (backend/,      │
            │                │  Railway/Render)         │
            │                │                          │
            │                │ Scoring Engine (4 factor)│
            │                │ FSLSM Scorer · NetworkX  │
            │                │ Section Simulation       │
            │                │ Auth (Supabase JWT)      │
            │                │ Multi-Tenant scoping     │
            │                │ CSV import · Audit log   │
            │                │ LLM layer (deferred, S2) │
            │                └───────────┬──────────────┘
            │           secret key,      │
            │           bypasses RLS,    │
            │           scopes inst_id   │
┌───────────▼────────────────────────────▼─────────────┐   ┌──────────────────────────┐
│              SUPABASE (PostgreSQL)                    │   │  FSLSM Model (Mubassher)  │
│        Database + Auth · Row-Level Security          │   │  (External)               │
│        Multi-Tenant Isolation · db/schema.sql        │   │  Felder-Silverman / ILS   │
└──────────────────────────────────────────────────────┘   │  Content Recommendations  │
                                                            └──────────────────────────┘
```

**Key architectural decisions:**
- The frontend talks to data **two ways**: HoD/teacher pages **read Supabase directly** in server components (publishable key, RLS-scoped); **writes** (create/update/simulate section) and **all admin** reads/writes go through the **FastAPI** backend.
- NetworkX runs **in-process** within FastAPI (no separate service)
- LLM API calls are made from **backend only** (keys never exposed to client); the dependency is currently deferred
- **Multi-tenancy is enforced twice**: Supabase **RLS** for direct frontend reads, and **application-level `institution_id` scoping** on every backend query (the backend connects with the secret key and bypasses RLS)
- Mr. Mubassher's **FSLSM model + content recommendations** are the only external input — that data is ingested; there is no external app to integrate

---

## 13. Technology Stack

Actual pinned stack as built (versions verified June 2026):

| Layer | Technology (actual) | Notes |
|-------|---------------------|-------|
| **Frontend** | Next.js **16.2.6**, React **19.2.4**, Tailwind CSS **4**, TypeScript 5 | App Router; Next 16 renames middleware → `src/proxy.ts`; `cookies()`/`params` are async |
| **Backend** | Python 3.12 + FastAPI (0.115+) | Async throughout; auto OpenAPI docs; Pydantic 2 schemas |
| **ORM / DB driver** | SQLAlchemy 2 (async) + asyncpg | UUID PKs, `institution_id` on tenant tables, soft deletes |
| **Database + Auth** | Supabase (PostgreSQL) | `db/schema.sql`, `auth_trigger.sql`, `seed_minimal.sql`, `verify.sql`. Keys: `…PUBLISHABLE_KEY` (browser) / `SUPABASE_SECRET_KEY` (backend) |
| **Auth verification** | python-jose | Verifies Supabase JWTs — HS256 (shared secret) + asymmetric JWKS fallback |
| **Social graph (compute)** | NetworkX 3.4 | Social-cohesion metrics, in-process |
| **Social graph (render)** | Custom SVG force-directed layout | Dependency-free; ~deterministic physics. *Not* React Flow/D3/cytoscape |
| **Charts / data viz** | Recharts 3.x | FSLSM distributions, score breakdowns |
| **CSV import** | papaparse (frontend) + python-multipart (backend) | Admin user bulk import (preview → commit) |
| **Icons** | lucide-react | UI iconography |
| **Report export** | Browser print pipeline → "Save as PDF" | Dependency-free; no react-pdf/WeasyPrint |
| **AI / LLM** | Claude API / OpenAI API | Backend-only; **deferred** (dependency commented out) until S2 |
| **Frontend Hosting** | Vercel | Zero-config for Next.js |
| **Backend Hosting** | Railway (or Render) | Verify current free-tier pricing; keep instance warm for demos |

---

## 14. Tech Stack Analysis & Recommendations

### Overall Verdict: Strong Stack for This Project

The chosen stack is **well-suited** for a 2-developer FYP team building a data-intensive, AI-powered platform. The decisions are pragmatic and defensible. Below is a layer-by-layer analysis. *Where the build later diverged from a recommendation, it is noted.*

---

### Frontend: Next.js + Tailwind CSS — Excellent Choice

**Strengths:**
- Team has existing React experience, so the learning curve is minimal
- Next.js provides file-based routing, SSR/SSG, API routes, and strong project structure out of the box
- Tailwind CSS is highly productive for a team with a dedicated UI designer — utility classes translate designs to code fast
- Vercel deployment is zero-config for Next.js (it's built by the same company)

**Graph visualization — decision taken:** The team chose a **custom dependency-free SVG force-directed layout** rather than React Flow / D3 / cytoscape. For classroom-sized graphs this keeps the bundle small and the rendering fully controllable; revisit a library only if interactions outgrow it.

**Charts — decision taken:** **Recharts** adopted for FSLSM distributions and score breakdowns.

**Verdict:** Keep as-is. Now pinned to Next.js 16 / React 19 / Tailwind 4.

---

### Backend: Python + FastAPI — Excellent Choice

**Strengths:**
- Python is the **only sensible choice** here given NetworkX, potential ML integration, and the AI/LLM ecosystem
- FastAPI is modern, async-capable, auto-generates OpenAPI docs, has excellent type validation via Pydantic
- The compatibility engine, graph computation, and LLM orchestration all live naturally in Python
- FastAPI's dependency injection system is clean for multi-tenant logic (extracting institution context per request)

**As built:**
- Pydantic 2 schemas are used rigorously for request/response shapes
- The scoring engine lives in a separate `engines/` package (pure computation), independently testable from the routers — exactly the service-layer separation recommended
- Railway hosting is fine for FYP, but be aware of cold starts on free/hobby tiers — keep the instance warm before presentations

**Verdict:** Keep as-is. This was the right call over Node.js.

---

### Database + Auth: Supabase (PostgreSQL) — Good Choice with Caveats

**Strengths:**
- Combines database + auth + RLS in one service — massive time saver for a 2-person team
- PostgreSQL is the right database for this relational data model (institutions, departments, courses, sections, profiles, relationships)
- Row-Level Security is a clean way to enforce multi-tenancy for direct frontend reads
- Supabase client libraries are well-documented for both Next.js and Python

**Caveats:**
- **RLS policies can become complex** — test them thoroughly. Note that the backend deliberately **bypasses RLS** and scopes `institution_id` in app code, so both paths must be kept correct. Write integration tests for both.
- Use the new key names (`publishable` / `secret`), not the deprecated `anon` / `service_role`
- **Supabase free tier limits:** 500MB database, 50MB file storage, 50K MAU — fine for FYP
- For survey-data ingestion, use bulk inserts / `COPY` rather than row-by-row

**Verdict:** Keep as-is. The time savings justify any trade-offs for an FYP.

---

### Social Graph: NetworkX — Perfect Choice

**Strengths:**
- Industry-standard Python library for exactly this use case
- Handles weighted directed graphs, centrality, clustering coefficients, community detection
- Runs in-process (no separate service to deploy/maintain)

**As built:** Edges persisted in PostgreSQL and the NetworkX graph reconstructed on demand — the recommended pattern (don't serialize NetworkX objects). In-memory size is a non-issue at classroom scale (30–200 students).

**Verdict:** Keep as-is.

---

### AI / LLM: Claude API or OpenAI API — Good Choice

**Strengths:**
- Both APIs are mature, well-documented, and easy to call from Python
- Claude API (Anthropic) has strong reasoning capabilities ideal for the NL query interface
- Calling from backend only is the correct security decision

**Status:** Deferred to the S2 stretch goal — the `anthropic` dependency is commented out until then. When enabled, **default to the Claude API**, use the latest models, define a system prompt that encodes the platform's data schema + scoring logic, and set a per-query token budget.

**Verdict:** Keep as-is. Recommend Claude API as primary when picked up.

---

### Hosting: Vercel + Railway — Appropriate for FYP

**Consideration:**
- **Railway free tier** was deprecated — check current pricing. Alternative: **Render** (free tier for web services, supports FastAPI, auto-deploys from Git) or **Fly.io**
- For the demo, keep the backend warm (hit the health endpoint a few minutes before presenting)
- Set environment variables properly on both platforms — never commit them

**Verdict:** Vercel is a keep. For Railway, verify pricing and consider Render as a backup.

---

### Stack Additions — Decisions Taken

| Need | Original recommendation | Decision as built |
|------|------------------------|-------------------|
| **Graph visualization** | React Flow / D3.js | **Custom SVG force-directed layout** (dependency-free) |
| **Charts & data viz** | Recharts / Chart.js | **Recharts** ✓ |
| **PDF export** | react-pdf / WeasyPrint | **Browser print → Save as PDF** (no extra dependency) |
| **CSV import** | — | **papaparse** (FE) + **python-multipart** (BE) |
| **State management** | Zustand / Context | **None** — Supabase-centric server components |
| **API client** | Axios / TanStack Query | **Custom typed fetch wrappers** (`api.ts` / `api.server.ts`) |
| **Form handling** | React Hook Form + Zod | **Vanilla React forms** (revisit if forms grow) |
| **Testing** | Pytest + Vitest | **Planned** — not yet established |

---

### Summary Verdict

| Layer | Choice | Rating | Action |
|-------|--------|--------|--------|
| Frontend | Next.js 16 + React 19 + Tailwind 4 | Excellent | Keep |
| Backend | Python + FastAPI | Excellent | Keep |
| Database + Auth | Supabase (PostgreSQL) | Good | Keep, test RLS + app scoping |
| Social Graph (compute) | NetworkX | Perfect | Keep |
| Social Graph (render) | Custom SVG | Good | Keep; revisit if interactions grow |
| AI/LLM | Claude / OpenAI API | Good | Enable for S2; prefer Claude |
| Frontend Hosting | Vercel | Excellent | Keep |
| Backend Hosting | Railway | Good | Verify pricing, consider Render |

**The stack is production-grade, well-reasoned, and right-sized for the team.** The biggest open item is establishing automated testing (Pytest for the scoring engine + RLS/app-scoping; Vitest for the frontend).

---

## 15. User Roles

| Role | Access Level | Capabilities |
|------|-------------|-------------|
| **Super Admin** | Platform-wide | Institution onboarding, system-wide stats, platform management |
| **Institution Admin** | Institution-wide | User provisioning (incl. CSV bulk import), department management, HoD assignment, institution analytics, audit log |
| **HoD** | Institution + Department | Section builder, scenario testing, simulation reports, social graph; (stretch) early warnings, NL query, longitudinal analytics |
| **Teacher** | Own sections only | View class FSLSM breakdown + content recommendations (read-only) |
| **Student** | Post-FYP only (R3) | View own learning profile and study recommendations (read-only, future feature) |

*Note: the original proposal merged "HoD/Admin" into one role. The build separates **Institution Admin** (manages the tenant: users, departments, HoDs) from **HoD** (plans sections within a department).*

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

> **Progress against plan (as of June 2026):** The team is **ahead of schedule**. Much of what the plan placed in Phase 3 (compatibility scoring algorithm, NetworkX social graph, section builder) is already implemented during FYP-1, along with the dashboards, reports, and an institution-admin layer that was not in the original plan. Remaining FYP-1 polish: the save-named-scenario flow (F5) and an automated test suite.

### Phase 1 — Foundation & Setup (Apr–May 2026)

| Task | Duration | Assigned To |
|------|----------|-------------|
| Project scaffolding & stack setup | 5 days | Khubaib, Adnan |
| Database schema design | 7 days | Khubaib |
| Authentication & multi-tenant RLS setup | 7 days | Khubaib |
| UI/UX design — all screens & components | 14 days | Muniba |
| Mock data design & FSLSM ingestion planning | 7 days | Khubaib, Adnan |
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

1. **FSLSM content-recommendation handoff still pending** — The exact format for receiving Mr. Mubassher's content recommendations is not finalized. The team builds its **own survey + ingestion layer** (RDF bulk import / ClassIQ survey, converging on one schema) and works with mock data structured to mirror expected output. Content recommendations come from Mr. Mubassher's FSLSM model; there is no external app to integrate.
2. **Compatibility scoring weights have defaults but are not final** — Default weights are now set in the scoring pipeline (style 0.40 / social 0.25 / balance 0.20 / participation 0.15) and are configurable. Exact final values may still be tuned and potentially informed by Mr. Mubassher's FSLSM model.
3. **Decision-support tool, NOT a prediction engine** — Must never claim the system accurately predicts grades or guarantees learning outcomes. It generates informed estimates and compatibility indicators.
4. **Two intermediate-level developers** — Scope must reflect a realistic workload for 2 developers + 1 UI designer.
5. **No real-time simulation** — No minute-by-minute classroom playback. The platform produces comprehensive reports.
6. **No content generation or hosting** — Content recommendations come from Mr. Mubassher's FSLSM model, not from this platform.
7. **The Felder-Silverman model is confirmed** as the psychological model (developed by Mr. Mubassher, supervised by Dr. Syed Imran Jami). The 44-question ILS is scored on the −11…+11 scale per axis. VARK is **not** used.

---

## 20. Repository Structure & Companion Docs

The project is a single monorepo (the former standalone `prototype/` and its nested git history were removed).

```
D:\FYP-
├── backend/                 # Python + FastAPI service
│   ├── app/
│   │   ├── core/            # config, security (JWT verification)
│   │   ├── db/              # async SQLAlchemy session
│   │   ├── models/          # ORM entities (see DATA_MODEL.md)
│   │   ├── repositories/    # data-access layer
│   │   ├── routers/         # API endpoints
│   │   ├── schemas/         # Pydantic request/response shapes
│   │   ├── services/        # orchestration (compatibility, csv_import, audit, supabase_admin)
│   │   ├── engines/         # pure computation: fslsm/, graph/, scoring/
│   │   ├── deps.py          # auth + tenant dependencies
│   │   └── main.py          # app factory + middleware
│   └── requirements.txt
├── frontend/                # Next.js 16 + React 19 + Tailwind 4
│   └── src/
│       ├── app/(auth)/      # login
│       ├── app/(dashboard)/ # home, students, teachers, sections, reports,
│       │                    #   scenarios, social-graph, teacher-dashboard, admin/*
│       ├── components/      # Sidebar, FslsmBars, admin/*
│       ├── lib/             # api.ts, api.server.ts, types.ts, brand.ts, supabase
│       └── proxy.ts         # Next 16 middleware (route guarding)
├── db/                      # SQL: schema.sql, auth_trigger.sql, seed_minimal.sql, verify.sql
├── Docs/                    # project.md (this file), BACKEND_ARCHITECTURE.md,
│                            #   DATA_MODEL.md, ClassIQ-design-guide.pdf, FYP_Detailed_Timeline.xlsx
└── ClassIQ-Standalone.html  # standalone HTML brand mockup
```

**Companion documents:**
- **[BACKEND_ARCHITECTURE.md](BACKEND_ARCHITECTURE.md)** — backend module layout, request flow, engine pipeline, deployment topology (Mermaid diagrams)
- **[DATA_MODEL.md](DATA_MODEL.md)** — database schema and entities (prose + SQL)
- **[ClassIQ-design-guide.pdf](ClassIQ-design-guide.pdf)** — visual language / brand (teal `#0D9488`, deep-purple `#3E2F7E`, mint, lilac, coral, amber)

**Data model (high level):** institutions → departments / courses / academic_terms; students + versioned student_profiles + student_aux_profiles; teachers + versioned teacher_profiles; sections + section_students (enrollment); peer_relationships (directed, term-scoped, typed, strength 1–5); simulation_runs / simulation_results / simulation_result_factors; auth_users + user_departments; audit_logs; ingestion_jobs. See DATA_MODEL.md for the authoritative schema.

---

## 21. Current Implementation Status (September 2026)

| Area | Status | Where it lives |
|------|--------|----------------|
| FSLSM scorer (4 axes, −11…+11, 44-Q ILS) | ✅ Done | `backend/app/engines/fslsm/scorer.py` |
| Compatibility engine (4 weighted factors → 0–100) | ✅ Done | `backend/app/engines/scoring/` (`pipeline`, `style_alignment`, `social_cohesion`, `class_balance`, `participation`) |
| Social graph metrics (NetworkX) | ✅ Done | `backend/app/engines/graph/networkx_builder.py` |
| Section simulation + persisted results | ✅ Done | `POST /api/sections/{id}/simulate` (shared `score_roster` path with scenarios) |
| Section lifecycle (activate / archive / reopen / delete) + roster editing | ✅ Done | `routers/sections.py`, `repositories/sections.py`, Section Builder buttons |
| What-if scenarios (build, simulate, compare, apply) | ✅ Done | `routers/scenarios.py`, `services/scenario_service.py`, `engines/scenario_compare.py`, `scenarios/ScenariosView.tsx` |
| Auth (Supabase JWT: HS256 + JWKS) | ✅ Done | `backend/app/core/security.py`, `deps.py` |
| Multi-tenancy (RLS + app-level `institution_id`) | ✅ Done | backend repositories + `repositories/refs.py`; Supabase RLS |
| Profile versioning (`is_current` / `version`) | ✅ Done | `student_profiles`, `teacher_profiles` |
| Survey ingestion (RDF / CSV / form-app / manual) | ✅ Done | `backend/app/ingestion/`, `services/ingestion_service.py`, `routers/ingestion.py`, `/ingestion` page |
| Institution onboarding (super-admin) | ✅ Done | `/api/admin/institutions`, `/admin/*` |
| User provisioning + CSV import (preview→commit) | ✅ Done | `institution_users_import`, `csv_import.py`, papaparse |
| Department management + HoD assignment | ✅ Done | `institution_departments`, admin pages |
| Course catalogue (audited) | ✅ Done | `routers/institution_courses.py`; Section Builder "New Course" |
| Audit log (append-only) | ✅ Done | `audit_logs`, `services/audit.py` — every mutation writes a row |
| HoD dashboard / students / teachers / sections | ✅ Done | `frontend/src/app/(dashboard)/*` (Supabase-direct reads) |
| Simulation Reports + print/PDF export + report API | ✅ Done | `reports/`, `ReportActions.tsx`, `GET /api/reports/sections/{id}` |
| Teacher Dashboard (read-only + S1 data entry) | ✅ Done | `teacher-dashboard/page.tsx`, `components/OutcomeEntry.tsx` |
| Social graph view (custom SVG) | ✅ Done | `social-graph/SocialGraphView.tsx` |
| Institution analytics (+ department drill-down, simulations by department) | ✅ Done | `institution_analytics`, `/admin/analytics`, `AnalyticsDrilldown.tsx` |
| S1 Early warning | ✅ Done (migration pending) | `db/migrations/2026-09-04_early_warning.sql`, `engines/early_warning.py`, `routers/early_warning.py`, `/early-warning` |
| S2 Ask ClassIQ (NL query) | ✅ Done (needs `ANTHROPIC_API_KEY`) | `backend/app/llm/`, `routers/llm.py`, `/ask` |
| S3 Longitudinal analytics | ✅ Done | `routers/longitudinal.py`, `/api/students/{id}/profile-history`, `/longitudinal`, `components/ProfileHistory.tsx` |
| Automated tests (pytest / Vitest) | ✅ Done | `backend/tests/` (69 tests; RLS suite skips without `TEST_DATABASE_URL`), `frontend/src/lib/stats.test.ts` |
| Migrations applied to the shared Supabase project | ⬜ Pending | `db/migrations/2026-09-04_*.sql` — project was unreachable on 4 Sep 2026 |
| Integration testing with real data, report, presentation | ⬜ Pending | Phase 6 team activities |

Legend: ✅ implemented · 🟡 partial/stub · ⬜ not started/pending.

---

## 22. References

1. Felder, R. M., & Silverman, L. K. (1988). *Learning and Teaching Styles in Engineering Education.* Engineering Education, 78(7), 674-681.
2. Grieves, M. (2014). *Digital Twin: Manufacturing Excellence through Virtual Factory Replication.* White Paper, Florida Institute of Technology.
3. Siemens, G., & Baker, R. S. J. (2012). *Learning Analytics and Educational Data Mining: Towards Communication and Collaboration.* Proceedings of the 2nd International Conference on Learning Analytics and Knowledge.
4. Wasserman, S., & Faust, K. (1994). *Social Network Analysis: Methods and Applications.* Cambridge University Press.
5. Hagberg, A., Schult, D., & Swart, P. (2008). *Exploring Network Structure, Dynamics, and Function using NetworkX.* Proceedings of the 7th Python in Science Conference.

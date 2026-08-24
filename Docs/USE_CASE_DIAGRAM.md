# ClassIQ — Use Case Diagram

> AI-Powered Digital Twin Platform for Classroom Intelligence
> Derived from `project.md` (features F1–F8, §15 User Roles) and the implemented
> FastAPI routers + Next.js pages. Last updated 3 June 2026.

## Actors

| Actor | Type | Notes |
|-------|------|-------|
| **Super Admin** | Human (platform) | Onboards institutions, monitors the whole platform. |
| **Institution Admin** | Human (tenant) | Manages users, departments, HoD assignment within one institution. |
| **HoD** (Head of Dept.) | Human (department) | Primary planner — builds sections, runs simulations, reads reports. |
| **Teacher** | Human (read-only) | Views the FSLSM breakdown + content recs for their own sections. |
| **Student** | Human (future, R3) | Post-FYP read-only self view — **out of current scope**, shown dashed. |
| **Supabase Auth** | External system | Issues/verifies JWTs; backs the *Log in* use case. |
| **FSLSM (Mr. Mubassher)** | External | Provides the FSLSM model + teaching content recommendations. No external app to integrate — ClassIQ collects its own surveys. |

Role inheritance: privileges are cumulative — **Institution Admin** inherits the
authenticated-user cases, **HoD** acts within a department, **Teacher** is the most
restricted. Each actor below lists only the cases *added* at that level.

---

## Simplified Use Case Diagram (Mermaid)

> A high-level overview of the three core roles and what each does.

```mermaid
flowchart LR
  IA([Institution Admin]):::actor
  HOD([HoD]):::actor
  T([Teacher]):::actor

  subgraph INST[Institution Admin]
    USR(Manage users)
    DEPT(Manage departments)
    HASN(Assign HoD)
  end

  subgraph PLAN[Section Planning]
    SEC(Build / edit sections)
    SIM(Run simulation)
    REP(View report)
    VIZ(Visualise social graph)
  end

  subgraph TV[Teacher View]
    TF(View class FSLSM breakdown)
    TR(View content recommendations)
  end

  IA --> USR & DEPT & HASN
  HOD --> SEC & SIM & REP & VIZ
  T --> TF & TR

  classDef actor fill:#0D9488,stroke:#0b5,color:#fff;
```

---

## UML Use Case Diagram (PlantUML)

> Render at <https://www.plantuml.com/plantuml> or with the PlantUML VS Code extension.

```plantuml
@startuml ClassIQ-UseCases
left to right direction
skinparam packageStyle rectangle
skinparam actorStyle awesome

actor "Super Admin"        as SA
actor "Institution Admin"  as IA
actor "HoD"                as HOD
actor "Teacher"            as T
actor "Student\n(future, R3)" as ST
actor "Supabase Auth"      as AUTH  <<external>>
actor "FSLSM model\n(Mr. Mubassher)" as FSLSM <<external>>

' ---- shared / account ----
usecase "Log in (Supabase JWT)"          as UC_LOGIN
usecase "View own account / role (/me)"  as UC_ME

' ---- platform administration (Super Admin) ----
package "Platform Administration" {
  usecase "Onboard institution"          as UC_ONBOARD
  usecase "Manage institutions"          as UC_MANAGE_INST
  usecase "View system overview / stats" as UC_SYS_OVERVIEW
  usecase "View system-wide audit log"   as UC_SYS_AUDIT
  usecase "Monitor ingestion jobs"       as UC_INGEST_JOBS
}

' ---- institution administration (Institution Admin) ----
package "Institution Administration" {
  usecase "Provision user (create / update)" as UC_USER
  usecase "Bulk import users (CSV)"           as UC_CSV
  usecase "Preview CSV import"                as UC_CSV_PREVIEW
  usecase "Commit CSV import"                 as UC_CSV_COMMIT
  usecase "Manage departments"                as UC_DEPT
  usecase "Assign / remove HoD"               as UC_HOD_ASSIGN
  usecase "View institution analytics"        as UC_INST_ANALYTICS
  usecase "View institution audit log"        as UC_INST_AUDIT
}

' ---- section planning & simulation (HoD) ----
package "Section Planning & Simulation" {
  usecase "Browse students & profiles"        as UC_VIEW_STUDENTS
  usecase "Browse teachers & profiles"        as UC_VIEW_TEACHERS
  usecase "Build / edit section\n(assign teacher + students)" as UC_SECTION
  usecase "Run section simulation"            as UC_SIMULATE
  usecase "Compute compatibility score"       as UC_SCORE
  usecase "Score FSLSM (4 axes)"              as UC_FSLSM
  usecase "Build social graph (NetworkX)"     as UC_GRAPH
  usecase "View simulation report"            as UC_REPORT
  usecase "Export report (PDF / print)"       as UC_EXPORT
  usecase "Visualise social graph"            as UC_VIZ
  usecase "Compare what-if scenarios"         as UC_WHATIF
}

' ---- teacher (read-only) ----
package "Teacher View" {
  usecase "View class FSLSM breakdown"        as UC_T_FSLSM
  usecase "View content recommendations"      as UC_T_RECS
}

' ---- data ingestion (ClassIQ-owned) ----
package "Data Ingestion" {
  usecase "Ingest survey responses\n& score FSLSM"  as UC_INGEST
  usecase "Provide content recommendations"          as UC_PROVIDE_RECS
}

' ===== actor associations =====
SA  --> UC_LOGIN
IA  --> UC_LOGIN
HOD --> UC_LOGIN
T   --> UC_LOGIN
UC_LOGIN ..> AUTH : <<uses>>

SA  --> UC_ME
IA  --> UC_ME
HOD --> UC_ME
T   --> UC_ME

SA --> UC_ONBOARD
SA --> UC_MANAGE_INST
SA --> UC_SYS_OVERVIEW
SA --> UC_SYS_AUDIT
SA --> UC_INGEST_JOBS

IA --> UC_USER
IA --> UC_CSV
IA --> UC_DEPT
IA --> UC_HOD_ASSIGN
IA --> UC_INST_ANALYTICS
IA --> UC_INST_AUDIT

HOD --> UC_VIEW_STUDENTS
HOD --> UC_VIEW_TEACHERS
HOD --> UC_SECTION
HOD --> UC_SIMULATE
HOD --> UC_REPORT
HOD --> UC_VIZ
HOD --> UC_WHATIF

T --> UC_T_FSLSM
T --> UC_T_RECS

ST ..> UC_T_FSLSM : (future, R3)

IA  --> UC_INGEST
FSLSM --> UC_PROVIDE_RECS

' ===== include / extend relationships =====
UC_CSV     ..> UC_CSV_PREVIEW : <<include>>
UC_CSV     ..> UC_CSV_COMMIT  : <<include>>
UC_SIMULATE ..> UC_SCORE      : <<include>>
UC_SCORE    ..> UC_FSLSM      : <<include>>
UC_SCORE    ..> UC_GRAPH      : <<include>>
UC_SIMULATE ..> UC_REPORT     : <<include>>
UC_REPORT   <.. UC_EXPORT     : <<extend>>
UC_WHATIF   ..> UC_REPORT     : <<include>>
UC_VIZ      ..> UC_GRAPH      : <<include>>
UC_T_RECS   ..> UC_PROVIDE_RECS : <<include>>
UC_INGEST   ..> UC_FSLSM       : <<include>>

note bottom of UC_WHATIF
  Baseline renders from real results;
  "save named scenario" backend is still a stub (F5 partial).
end note
@enduml
```

---

## Quick-view version (Mermaid)

> Mermaid has no native UML use-case notation, so this is a grouped graph
> approximation for rendering inline in Markdown/GitHub.

```mermaid
flowchart LR
  SA([Super Admin]):::actor
  IA([Institution Admin]):::actor
  HOD([HoD]):::actor
  T([Teacher]):::actor
  ST([Student · future R3]):::future
  AUTH[[Supabase Auth]]:::ext
  MUB[[FSLSM model · Mr. Mubassher]]:::ext

  subgraph SHARED[Account]
    LOGIN(Log in - JWT)
    ME(View own role)
  end

  subgraph PLAT[Platform Admin]
    ONB(Onboard / manage institutions)
    SYS(System overview & stats)
    SAUD(System audit log)
    JOBS(Monitor ingestion jobs)
  end

  subgraph INST[Institution Admin]
    USR(Provision users)
    CSV(Bulk import users - CSV)
    DEPT(Manage departments)
    HASN(Assign / remove HoD)
    IANL(Institution analytics)
    IAUD(Institution audit log)
  end

  subgraph PLAN[Section Planning & Simulation]
    VS(Browse students)
    VT(Browse teachers)
    SEC(Build / edit section)
    SIM(Run simulation)
    SCORE(Compute compatibility)
    FSLSM(Score FSLSM)
    GRAPH(Build social graph)
    REP(View report)
    EXP(Export PDF)
    VIZ(Visualise social graph)
    WI(Compare what-if scenarios)
  end

  subgraph TV[Teacher View - read only]
    TF(Class FSLSM breakdown)
    TR(Content recommendations)
  end

  SA --> LOGIN & ME & ONB & SYS & SAUD & JOBS
  IA --> LOGIN & ME & USR & CSV & DEPT & HASN & IANL & IAUD
  HOD --> LOGIN & ME & VS & VT & SEC & SIM & REP & VIZ & WI
  T --> LOGIN & ME & TF & TR
  ST -.-> TF
  LOGIN -.uses.-> AUTH
  MUB -->|content recs| TR

  SIM -. include .-> SCORE
  SCORE -. include .-> FSLSM
  SCORE -. include .-> GRAPH
  SIM -. include .-> REP
  REP -. extend .-> EXP
  WI -. include .-> REP
  VIZ -. include .-> GRAPH

  classDef actor fill:#0D9488,stroke:#0b5,color:#fff;
  classDef ext fill:#3E2F7E,stroke:#222,color:#fff;
  classDef future fill:#fff,stroke:#999,color:#777,stroke-dasharray:4 3;
```

---

## Traceability — use case → implementation

| Use case | Backend endpoint(s) | Frontend page |
|----------|---------------------|---------------|
| Log in | Supabase JWT (verified in `core/security.py`, `deps.py`) | `(auth)/login` |
| View own role | `GET /api/me` | sidebar / layout |
| Onboard / manage institutions | `GET/POST/PATCH /api/admin/institutions` | `admin/institutions` |
| System overview / audit / ingestion | `GET /api/admin/system/{overview,audit,ingestion-jobs}` | `admin/system` |
| Provision user | `GET/POST/PATCH /api/.../users` | `admin/users` |
| Bulk CSV import (preview→commit) | `POST /api/.../users/import/{preview,commit}` | `admin/users/import` |
| Manage departments | `GET/POST/PATCH /api/.../departments` | `admin/departments` |
| Assign / remove HoD | `POST/DELETE /api/.../departments/{id}/hods` | `admin/departments/[id]` |
| Institution analytics | `GET /api/.../analytics/{overview,…,score-trend}` | `admin/analytics` |
| Institution audit log | `GET /api/.../audit` | `admin/audit` |
| Browse students / teachers | `GET /api/students`, `GET /api/teachers` (+ Supabase-direct reads) | `students`, `teachers` |
| Build / edit section | `POST/PATCH /api/sections` | `sections` (Section Builder) |
| Run simulation | `POST /api/sections/{id}/simulate` | `sections` → `reports` |
| Compute compatibility / FSLSM / graph | `engines/scoring/*`, `engines/fslsm/scorer.py`, `engines/graph/networkx_builder.py` | — |
| View / export report | `GET /api/sections/{id}` + persisted results | `reports`, `ReportActions.tsx` |
| Visualise social graph | Supabase-direct reads + `peer` repo | `social-graph` |
| Compare what-if scenarios | baseline live; save-scenario **stub** | `scenarios` |
| Teacher class view | Supabase-direct reads | `teacher-dashboard` |
| Ingest survey & score FSLSM | `ingestion_jobs` + `engines/fslsm/scorer.py` (processor pending) | — |
| Content recommendations | external — Mr. Mubassher's FSLSM model | `teacher-dashboard` |

**Status caveats reflected in the diagram:**
- *Compare what-if scenarios* — baseline works; the save-named-scenario backend is a stub (F5 partial).
- *Data ingestion* — ClassIQ collects its own surveys; table + sources modelled, processor
  pending. There is **no external app** to integrate. Teaching content recommendations
  come from **Mr. Mubassher's FSLSM model** — the one external dependency.
- *Student* actor — dashed; R3 post-FYP, not in current scope.
- LLM / NL-query (S2), Early-warning (S1), Longitudinal (S3) — deferred, omitted here.

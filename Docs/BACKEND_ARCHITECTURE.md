# ClassIQ — Backend Architecture

**Status:** Draft v1 — 2026-05-11 · §5, §11 and §13 updated to the as-built state on 2026-09-04
**Owner:** Khubaib (backend lead)
**Stack:** Python 3.12 · FastAPI · SQLAlchemy 2.x · Pydantic v2 · NetworkX · Supabase Postgres · Anthropic SDK
**Related:** [DATA_MODEL.md](DATA_MODEL.md) · [project.md](../project.md)

---

## 1. System Context

```mermaid
flowchart LR
    subgraph Users
        HoD[HoD / Admin]
        Teacher[Teacher]
        SuperAdmin[Super Admin]
    end

    subgraph Frontend["ClassIQ Frontend — Vercel"]
        Next[Next.js + Tailwind]
    end

    subgraph Backend["ClassIQ Backend — Railway / Render"]
        API[FastAPI app]
        Engine[Scoring Engine + NetworkX]
        Ingest[Ingestion Workers]
    end

    subgraph Data["Supabase"]
        Auth[Supabase Auth]
        DB[(Postgres + RLS)]
    end

    subgraph External["External Systems"]
        FormApp[ClassIQ Survey / Form App]
        FSLSM[FSLSM Content Recs<br/>Mr. Mubassher]
        LLM[Anthropic / OpenAI API]
    end

    HoD -->|HTTPS| Next
    Teacher -->|HTTPS| Next
    SuperAdmin -->|HTTPS| Next

    Next -->|JWT + REST| API
    Next -.->|Auth flows| Auth

    API --> Engine
    API --> Ingest
    API --> DB
    API -.->|S2 NL queries| LLM

    FormApp -.->|responses| Ingest
    FSLSM -.->|content recs| Ingest

    Auth --- DB
```

**Notes**
- Frontend talks REST to FastAPI only (no direct DB writes from client beyond what Supabase Auth needs).
- Supabase Auth issues the JWT; FastAPI verifies it and resolves the institution scope.
- The ClassIQ form-app is *upstream* — it pushes to Ingestion, never the reverse. Mr. Mubassher's FSLSM is the external source of teaching content recommendations only.

---

## 2. FastAPI Module Layout

```mermaid
flowchart TB
    subgraph app["app/"]
        Main["main.py<br/>FastAPI factory + middleware"]
        Deps["deps.py<br/>session, current_user, tenant scope"]

        subgraph core["core/"]
            Config["config.py — Pydantic Settings"]
            Sec["security.py — JWT verify"]
            Log["logging.py"]
        end

        subgraph db["db/"]
            Sess["session.py"]
            Base["base.py"]
        end

        subgraph models["models/"]
            ORM["SQLAlchemy ORM<br/>mirrors DATA_MODEL.md"]
        end

        subgraph schemas["schemas/"]
            Pyd["Pydantic v2<br/>request + response"]
        end

        subgraph routers["routers/"]
            R_Auth["auth"]
            R_Sec["sections"]
            R_Scen["scenarios"]
            R_Sim["simulations"]
            R_Rep["reports"]
            R_Ing["ingestion"]
            R_Twn["twins (student/teacher)"]
            R_Adm["admin"]
        end

        subgraph services["services/"]
            S_Compat["compatibility_service"]
            S_Scen["scenario_service"]
            S_Rep["report_service"]
            S_Ing["ingestion_service"]
        end

        subgraph repos["repositories/"]
            Repo["data access<br/>encapsulates Supabase queries"]
        end

        subgraph engines["engines/"]
            E_Score["scoring/<br/>pipeline + factor modules"]
            E_FSLSM["fslsm/<br/>A-B → axis scores"]
            E_Graph["graph/<br/>NetworkX builder"]
        end

        subgraph ingestion["ingestion/"]
            Ing_RDF["rdf_parser"]
            Ing_Form["form_app_adapter"]
            Ing_Manual["manual_admin_adapter"]
        end

        subgraph llm["llm/"]
            LLM_Cli["client (Anthropic SDK)"]
            LLM_Pr["prompts (S2)"]
        end
    end

    Main --> routers
    routers --> services
    services --> repos
    services --> engines
    services --> ingestion
    services --> llm
    repos --> models
    routers --> schemas
    services --> schemas
    Main --> Deps
    Deps --> core
    Deps --> db
```

**Layering rule:** routers → services → (repositories | engines | adapters). Repositories own DB access; engines own pure computation; routers stay thin.

---

## 3. Request Flow (auth + tenant + service)

```mermaid
sequenceDiagram
    autonumber
    participant C as Next.js client
    participant FA as FastAPI<br/>(CORS + TrustedHost)
    participant Auth as auth.dependency<br/>(verify JWT)
    participant Tnt as tenant.dependency<br/>(institution scope)
    participant R as Router
    participant Svc as Service
    participant Rep as Repository
    participant PG as Supabase Postgres

    C->>FA: GET /api/sections (Bearer JWT)
    FA->>Auth: verify_jwt(token)
    Auth->>PG: SELECT * FROM auth_users WHERE id = uid
    PG-->>Auth: {role, institution_id}
    Auth-->>Tnt: current_user
    Tnt-->>R: institution_scope + role
    R->>Svc: list_sections(scope)
    Svc->>Rep: get_sections(institution_id, term)
    Rep->>PG: SELECT … (RLS auto-filters by institution)
    PG-->>Rep: rows
    Rep-->>Svc: domain objects
    Svc-->>R: response DTO
    R-->>FA: 200 + JSON
    FA-->>C: response
```

**Two guarantees enforced here**
- JWT verification on every request (no anonymous calls except `/health`, `/auth/*`).
- RLS is enforced at DB level using the Postgres `auth.uid()` from the Supabase-issued JWT — application code never has to add `WHERE institution_id = X` manually.

---

## 4. Scoring Engine Pipeline (F2)

```mermaid
flowchart TB
    Input["Section input bundle<br/>(teacher_profile, current student_profiles,<br/>student_aux_profiles, peer_relationships)"]

    subgraph Factors["Factor scorers — each returns 0..100"]
        FA["style_alignment<br/>teacher style vs class style distribution"]
        FB["social_cohesion<br/>NetworkX metrics on peer subgraph"]
        FC["class_balance<br/>FSLSM spread + dominant ratio"]
        FD["participation_mix<br/>aux profile distribution"]
    end

    subgraph Agg["Weighted aggregator"]
        Cfg[(scoring_configs.weights JSONB)]
        Sum["sum(score_i × weight_i)"]
    end

    subgraph Out["Output"]
        Score["compatibility_score 0..100"]
        Factors_Out["simulation_result_factor rows<br/>(name, score, weight, impact)"]
        Outcome["predicted_outcome<br/>High / Medium / Low"]
        Social["social_graph_impact<br/>Supportive / Neutral / Hindering"]
        Reco["recommended_teacher_id<br/>(if better match exists)"]
    end

    Input --> FA
    Input --> FB
    Input --> FC
    Input --> FD

    FA --> Sum
    FB --> Sum
    FC --> Sum
    FD --> Sum
    Cfg --> Sum

    Sum --> Score
    FA --> Factors_Out
    FB --> Factors_Out
    FC --> Factors_Out
    FD --> Factors_Out

    Score --> Outcome
    FB --> Social
    Score --> Reco
```

**Engine contract**

```
score_section(section_input, scoring_config) -> SimulationResult
  where SimulationResult contains:
    compatibility_score, factors[], predicted_outcome,
    social_graph_impact, recommended_teacher_id, style_distribution
```

Each factor scorer is a pure function `(input) -> (score, evidence)`. The aggregator is the only place weights are read. Factor weights live in `scoring_configs.weights` JSONB so the team can tune without DDL changes — see [DATA_MODEL.md §10](DATA_MODEL.md).

---

## 5. Ingestion Pipeline (RDF / form-app → DB)

```mermaid
flowchart TB
    subgraph S1["Source — choose one adapter"]
        RDF["RDF Bulk Import<br/>(Data_File_…RDF_Triples.rdf)"]
        Form["ClassIQ Form-App Webhook<br/>(JSON per submission)"]
        Manual["Admin Manual Entry"]
    end

    subgraph S2["Adapter layer<br/>(ingestion/)"]
        Adapt["Normalize → InternalResponse<br/>{ student_external_id, email, full_name,<br/>  answers: [{q_seq, choice}] x44, source }"]
    end

    subgraph S3["Pipeline (ingestion_service)"]
        Job["Create ingestion_jobs row<br/>status=running"]
        Validate["Validate<br/>• 44 questions present<br/>• A/B only<br/>• instrument resolves"]
        UpsertS["Upsert students<br/>(by institution_id, external_id)"]
        WriteR["INSERT survey_responses<br/>(idempotent on external_response_id)"]
        WriteA["INSERT survey_answers (44 rows)"]
        Score["FSLSM scorer<br/>raw = A_count − B_count per axis"]
        WriteP["INSERT student_profiles<br/>set is_current=true,<br/>flip prior rows to is_current=false"]
        FinishOK["ingestion_jobs.status=succeeded<br/>summary JSONB updated"]
        FinishErr["ingestion_jobs.status=failed/partial<br/>errors[] in summary"]
    end

    RDF --> Adapt
    Form --> Adapt
    Manual --> Adapt

    Adapt --> Job --> Validate
    Validate -->|ok| UpsertS --> WriteR --> WriteA --> Score --> WriteP --> FinishOK
    Validate -->|fail| FinishErr
    WriteR -.duplicate.-> FinishOK
```

**Key properties**
- **Idempotent.** `UNIQUE (instrument_id, external_response_id)` on `survey_responses` means re-running the same import is safe.
- **Source-agnostic.** Adapters normalize to one internal shape — the pipeline downstream is unaware of the origin.
- **Re-scoreable.** Raw answers stored separately from derived scores. If the FSLSM scorer changes, re-run scoring without re-collecting responses.
- **As built (Sep 2026):** adapters in `app/ingestion/` (`rdf_parser`, `csv_adapter`, `form_app_adapter`, `manual_admin_adapter`) normalise to `InternalResponse`; `services/ingestion_service.py` runs the pipeline with a savepoint per response so one bad row never sinks a batch, and `dry_run=True` validates without writing. The default ILS instrument is defined in `app/ingestion/ils_instrument.py` and seeded on first use (also `db/migrations/2026-09-04_seed_ils_instrument.sql`).

---

## 6. NetworkX Integration

```mermaid
flowchart LR
    subgraph Load["Load (in-process)"]
        Q["SELECT peer_relationships<br/>WHERE academic_term_id = T<br/>AND from/to IN section students"]
        Build["nx.DiGraph()<br/>add nodes + weighted edges<br/>edge weight = strength × type_factor<br/>(friend +1, study_partner +1.2,<br/> neutral 0, conflict −1)"]
    end

    subgraph Metrics["Compute"]
        M1["density"]
        M2["clustering coefficient"]
        M3["betweenness centrality<br/>(per node)"]
        M4["conflict_density<br/>(custom — sum of negative edges)"]
        M5["isolated_nodes count"]
    end

    subgraph Score["Score"]
        Norm["normalize each metric → 0..100"]
        Combine["combine into social_cohesion factor"]
        Label["label social_graph_impact:<br/>≥70 Supportive · 40-69 Neutral · <40 Hindering"]
    end

    Q --> Build --> M1 & M2 & M3 & M4 & M5 --> Norm --> Combine --> Label
```

**Why in-process:** classroom-sized graphs (30–200 students) fit in RAM trivially. No separate graph service required. Graph is constructed fresh per simulation; no NetworkX state is persisted.

**Persistence model:** edges live in Postgres (`peer_relationships`); graph objects are ephemeral.

---

## 7. Section State Machine

```mermaid
stateDiagram-v2
    [*] --> draft : HoD creates section

    draft --> draft : edit teacher/students
    draft --> simulated : run simulation

    simulated --> draft : re-edit (invalidates results)
    simulated --> simulated : re-run with new scoring_config
    simulated --> active : HoD applies for semester

    active --> archived : academic_term ends

    archived --> [*]
```

**Invariants**
- Cannot move `draft → active` directly; must `simulated` first (forces an informed decision).
- Editing a `simulated` section drops it back to `draft` and orphans prior `simulation_runs` (kept for audit, not shown to user).
- Only one `active` section per `(course, academic_term, label)` at a time (UNIQUE constraint in DATA_MODEL §5).

---

## 8. Scenario Simulation Flow (F5)

```mermaid
sequenceDiagram
    autonumber
    participant HoD
    participant FE as Frontend
    participant API as FastAPI
    participant ScenSvc as scenario_service
    participant Eng as scoring engine
    participant DB as Postgres

    HoD->>FE: Compose Scenarios A and B
    FE->>API: POST /scenarios (name, sections[])
    API->>ScenSvc: create_scenario(payload)
    ScenSvc->>DB: INSERT scenarios + scenario_sections + scenario_section_students
    DB-->>ScenSvc: ids
    ScenSvc-->>API: scenario.id

    HoD->>FE: Run Simulation
    FE->>API: POST /scenarios/{id}/simulate
    API->>ScenSvc: simulate(scenario_id, scoring_config_id)
    ScenSvc->>DB: INSERT simulation_runs (status=running)

    par For each scenario_section
        ScenSvc->>Eng: score_section(input)
        Eng-->>ScenSvc: SimulationResult
        ScenSvc->>DB: INSERT simulation_results + factor rows
    end

    ScenSvc->>DB: UPDATE simulation_runs.status=succeeded
    ScenSvc-->>API: aggregated results
    API-->>FE: JSON (compatibility per section + factors)
    FE-->>HoD: Side-by-side compare view
```

**Parallelism note:** if scenario count or section count is high, run section-level scoring concurrently via `asyncio.gather` over thread-bound calls (NetworkX work is CPU-bound but small per section).

---

## 9. Deployment Topology

```mermaid
flowchart LR
    Dev[Developer]
    GH[(GitHub repo<br/>main branch)]

    subgraph Vercel["Vercel"]
        FE["Next.js app<br/>SSR + static"]
    end

    subgraph BackendHost["Backend host — Railway (primary) / Render (backup)"]
        FAPI[FastAPI container]
        Health["/health"]
    end

    subgraph Supabase["Supabase"]
        Auth[Auth]
        PG[(Postgres + RLS)]
        Edge["Edge Functions (light webhooks only)"]
    end

    subgraph Secrets["Secrets"]
        FE_Env["Vercel env<br/>NEXT_PUBLIC_SUPABASE_URL<br/>NEXT_PUBLIC_SUPABASE_ANON_KEY<br/>NEXT_PUBLIC_API_BASE_URL"]
        BE_Env["Railway env<br/>SUPABASE_URL<br/>SUPABASE_SERVICE_ROLE_KEY<br/>SUPABASE_JWT_SECRET<br/>ANTHROPIC_API_KEY"]
    end

    Dev -->|push| GH
    GH -->|auto deploy| FE
    GH -->|auto deploy| FAPI

    FE -->|fetch| FAPI
    FE -->|auth| Auth

    FAPI --> PG
    FAPI -->|verify JWT| Auth

    FE_Env -.-> FE
    BE_Env -.-> FAPI

    Edge -.optional.-> FAPI
```

**Decision points**
- Railway is the primary backend host per [project.md §14](../project.md). Render is the documented fallback if Railway free-tier ToS changes.
- `SUPABASE_SERVICE_ROLE_KEY` lives **only** in the backend env. Frontend uses `ANON_KEY` (RLS-bound).
- Anthropic key is backend-only (S2 stretch goal).

---

## 10. Multi-Tenant Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant C as Client
    participant API as FastAPI
    participant Sup as Supabase Auth
    participant PG as Postgres

    C->>API: GET /api/students (Authorization: Bearer JWT)
    API->>API: decode JWT (using SUPABASE_JWT_SECRET)
    Note over API: extract sub = auth.uid()

    API->>PG: SET LOCAL request.jwt.claims = '<jwt>'<br/>(passes auth.uid() into Postgres GUC)
    Note over PG: auth.uid() now resolves<br/>inside RLS policies

    API->>PG: SELECT * FROM students
    Note over PG: RLS policy:<br/>institution_id = current_institution_id()<br/>uses auth.uid() to look up<br/>auth_users.institution_id

    PG-->>API: rows scoped to tenant
    API-->>C: 200 JSON

    Note over C,PG: Cross-tenant access is impossible —<br/>RLS cannot be bypassed by the client.<br/>Only SERVICE_ROLE_KEY (backend-only)<br/>bypasses RLS, for admin/ingestion tasks.
```

**Tenant-scoped service role usage:** for ingestion and super-admin actions, the backend connects with `SERVICE_ROLE_KEY` and explicitly passes `institution_id` in queries — RLS bypass is intentional but always paired with explicit scoping.

---

## 11. API Surface (as built — 4 September 2026)

Every route is under `/api` except the health probes. Roles: **staff** = hod, institution_admin, super_admin. The live OpenAPI document at `/docs` is authoritative.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `GET` | `/health`, `/ready` | public | Liveness / DB readiness |
| `GET` | `/api/me` | any | Current user + role + institution |
| `GET` | `/api/students`, `/api/students/{id}` | staff | Roster + current profile |
| `GET` | `/api/students/{id}/profile-history` | staff | S3 — every profile version with term + source |
| `GET` | `/api/teachers`, `/api/teachers/{id}` | staff | Teachers + current profile |
| `GET POST` | `/api/sections` | staff | List (with latest result) / create draft |
| `GET PATCH DELETE` | `/api/sections/{id}` | staff | Detail / label + teacher / soft delete |
| `PUT` | `/api/sections/{id}/students` | staff | Replace roster (simulated → draft) |
| `POST` | `/api/sections/{id}/simulate` | staff | Run the engine, persist result |
| `POST` | `/api/sections/{id}/activate` · `/archive` · `/reopen` | staff | §7 state machine |
| `GET POST` | `/api/scenarios` | staff | List / create what-if scenario |
| `POST` | `/api/scenarios/from-section/{section_id}` | staff | Clone a live section into a scenario |
| `GET PATCH DELETE` | `/api/scenarios/{id}` | staff | Detail / edit / delete |
| `POST` | `/api/scenarios/{id}/simulate` | staff | Score every scenario section (one run) |
| `GET` | `/api/scenarios/{id}/compare` | staff | Side-by-side vs live baseline, factor deltas, roster diff |
| `POST` | `/api/scenarios/{id}/apply` | staff | Copy onto live sections + re-score |
| `GET` | `/api/reports/sections/{id}` | staff, teacher (own) | F6 report payload + run history |
| `POST` | `/api/ingestion/rdf` · `/csv` | staff | Bulk import (multipart; `dry_run` form field) |
| `POST` | `/api/ingestion/form` · `/manual` | staff | Form-app JSON / one typed submission |
| `GET` | `/api/ingestion/jobs`, `/jobs/{id}`, `/instrument` | staff | Job history, one job, the 44-question ILS |
| `GET` | `/api/analytics/longitudinal` | staff | S3 cohort drift per term / version, top shifts |
| `GET` | `/api/early-warning/overview`, `/flags` | staff | S1 dashboard + flag list |
| `PATCH` | `/api/early-warning/flags/{id}` | staff | acknowledge / resolve / reopen |
| `GET POST` | `/api/early-warning/sections/{id}/outcomes` | staff, teacher (own) | Read / record weekly actuals |
| `POST` | `/api/early-warning/sections/{id}/evaluate` | staff, teacher (own) | Re-run the comparator |
| `GET` | `/api/llm/status` · `POST /api/llm/query` | staff | S2 Ask ClassIQ |
| `GET POST PATCH` | `/api/admin/institutions` | super_admin | Tenant management |
| `GET` | `/api/admin/system/overview` · `/audit` · `/ingestion-jobs` | super_admin | Platform-wide views |
| `GET POST PATCH DELETE` | `/api/institution/departments` (+ `/hods`) | admin | Departments, HoD assignment |
| `GET POST PATCH` | `/api/institution/users` (+ `/import/preview`, `/import/commit`) | admin | User provisioning, CSV import |
| `GET POST PATCH DELETE` | `/api/institution/courses` | staff | Course catalogue (audited) |
| `GET` | `/api/institution/analytics/overview` · `/departments/{id}` · `/score-trend` · `/simulations-by-department` | admin | Institution analytics |
| `GET` | `/api/institution/audit` | admin | Tenant audit tail |

Pydantic schemas live in `app/schemas/` and mirror the DB shapes from DATA_MODEL with optional fields per route.

---

## 12. Cross-Cutting Concerns

| Concern | Approach |
|---|---|
| Logging | structured JSON via `structlog`; correlation_id per request |
| Errors | one `APIError` base class → mapped to HTTP via exception handler |
| Validation | Pydantic v2 on all request/response; `Field(..., examples=[...])` for OpenAPI |
| Migrations | Alembic against Supabase Postgres; checked into `backend/alembic/` |
| Tests | `pytest` + `pytest-asyncio`; test DB is a separate Supabase project or local Postgres; **RLS policy tests live in `tests/rls/`** and run as different JWT subjects |
| Performance | scoring engine functions are pure → easy to memoize per `(section_id, scoring_config_id)` if needed |
| Secrets | never in code; loaded via `pydantic-settings` from env |
| LLM cost | system prompt cached (Anthropic prompt caching); per-query token cap; no PII in prompts |

---

## 13. Open Items

- **Apply the 2026-09-04 migrations** (`db/migrations/2026-09-04_seed_ils_instrument.sql`, `2026-09-04_early_warning.sql`) to the shared Supabase project — it was unreachable when they were written; both are idempotent.
- **Per-role RLS policy matrix** — currently described in [DATA_MODEL.md §12](DATA_MODEL.md); needs explicit per-table/per-role read/write table. `tests/rls/test_rls_isolation.py` is the executable check once `TEST_DATABASE_URL` points at a seeded database.
- **Scoring weights starting values** — defaults are seeded (0.40 / 0.25 / 0.20 / 0.15); tune with Mr. Mubassher's input.
- **Early-warning expectation bands** (`engines/early_warning.py::EXPECTED`) — first-pass thresholds; calibrate against a real semester.
- **NetworkX type_factor weights** for edge type → numeric — tune empirically.
- **Job queue** — ingestion + simulation still run synchronously inside the request; the 176-student RDF import completes well inside a request, but introduce `arq` / `RQ` if bulk imports grow.
- **LLM cost telemetry** — `/api/llm/query` logs token usage to `audit_logs`; add a per-institution monthly cap if the stretch goal ships to real users.

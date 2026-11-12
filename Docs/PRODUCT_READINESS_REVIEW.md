# ClassIQ: code review and path to a paid product

Reviewed 25–26 October 2026 against `project.md`, `BACKEND_ARCHITECTURE.md`,
`DATA_MODEL.md`, the implementation plan, SQL, and the current working tree.

**Verdict:** ClassIQ has a substantial working prototype. It is not ready for an
external production rollout. The strongest commercial opportunity is helping a
department prepare, compare, approve, and explain a workable semester plan, with
measurable time savings. Paid value and learning benefits still need validation.

## Scope and evidence

The review concentrated on authorization, tenant boundaries, provisioning,
ingestion, section/scenario state and transactions, scoring orchestration, and the
teacher dashboard. Existing LLM-provider and instructional-artifact work was
preserved. This is a risk-focused review, not a line-by-line certification of every
module, a penetration test, or a completed customer pilot.

The established decisions remain: Next.js + FastAPI + Supabase; browser reads and
backend writes; FSLSM/44-question ILS; the four factors with weights
0.40/0.25/0.20/0.15; explicit section lifecycle; scenarios separate from live
sections; human decision support; no LMS, content generation, or animated classroom.
Product changes below are proposals, not new approved architectural decisions.

## Issues fixed in this working tree

| Priority | Finding and consequence | Change and evidence |
|---|---|---|
| P0 | RLS `ALL` policies allowed browser mutations, including account-role changes and audit modification when grants permitted them. | October security migration makes policies SELECT-only and revokes browser mutations across 29 tables. PostgreSQL tests attempt privilege escalation and verify grants. |
| P0 | Auth signup trigger trusted user-editable role/institution metadata. | Trigger accepts authorization fields only from `app_metadata`; backend provisioning and seed script use it. PostgreSQL tests reject forged signup metadata. |
| P1 | Deactivated accounts retained browser read access; the future student role inherited tenant reads. | Active-staff restrictive policy blocks tenant and global reads for these accounts. Backend already checks `is_active`. |
| P1 | HoDs could create institution admins and edit account activation through a shared gate. Foreign department IDs were accepted before provisioning. | Separate admin/roster gates, HoD role limits and assigned-department checks, tenant reference validation, and protection against disabling self or editing super admins as an institution admin. |
| P1 | Access tokens could omit security claims; asymmetric verification could perform blocking HTTP in the async request loop. | Require expiry/subject/audience/project issuer; execute verification in a worker thread; remove import-time network calls and identity debug logging. |
| P1 | Active/archived sections could be edited through PATCH or overwritten by scenario apply. | Lifecycle checks on both paths; archived sections cannot be rescored. Regression tests exercise each state. |
| P1 | Applying a scenario committed changes before rescoring and swallowed scoring failures. Section create/update/simulate could commit independently of audit. | Callers own commits; apply locks its scenario/existing destinations, scores all sections, then commits. Scoring failure rolls back. Tests verify commit ordering and failure behavior. |
| P1 | Invalid student IDs were silently discarded, so a roster replacement could remove valid enrollments while appearing successful. | Section and scenario writes reject incomplete reference sets before mutation. |
| P1 | A shared ILS instrument made external response IDs globally unique. One tenant's import could suppress another's matching IDs. | Lookup and uniqueness include institution; dry-run also recognizes repeated IDs within the batch. SQL migration and cross-tenant duplicate tests included. |
| P2 | Teacher recommendation required each successive candidate to beat the previous best by three points, missing a better candidate just one point above it. | Choose the highest score among candidates that beat the original score by at least three points. Regression test covers 70 → 73 → 74. |
| P2 | Generic and current-term participation profiles could count the same student twice. | Choose one profile per student, preferring the requested term, then latest collection time. Scoring service version is now `0.1.1`. |
| P2 | Teacher dashboard included removed enrollments and deleted students/profiles. | Filter those records; exclude soft-deleted sections. TypeScript and production build verify the query/shape changes. |
| P2 | “Invite” only created an account; the Admin create-user endpoint does not send invitation mail. | Provision an unconfirmed account with trusted metadata, then explicitly call `/auth/v1/invite`. Mock-transport tests verify requests and report partial delivery failure. Password setup and recovery remain open below. |
| P2 | A fresh install lacked the institution-admin enum and a usable default scoring configuration; database manifests were ignored. | Fresh schema includes the role; minimal seed includes default weights; manifests are tracked for reproducible migration/test installs. |
| P2 | Architecture docs claimed backend JWT-based RLS enforcement that the code does not perform. | Corrected both access paths, metadata trust, transaction ownership, idempotency, and readiness claims. |

The security design follows Supabase's guidance that user metadata is mutable and
must not drive authorization. See [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).
Invitation behavior was checked against the [Auth invite implementation](https://github.com/supabase/auth/blob/master/internal/api/invite.go).

## Verification and limits

- Backend pytest: **132 passed, 5 skipped**. Covers existing engines/adapters/auth
  plus new authorization, lifecycle, roster, scoring, and provisioning regressions.
- `cd db && npm ci && npm test` runs PostgreSQL in PGlite with a minimal Supabase
  auth-schema shim: signup forgery, tenant isolation, write privileges on 29 tables,
  inactive/student/anonymous access, super-admin read behavior, migration re-runs,
  and survey idempotency. These execute SQL; they are not text-pattern assertions.
- Frontend Vitest, ESLint, TypeScript and production build are checked locally.
- The five existing tests requiring `TEST_DATABASE_URL` remain skipped. No shared
  database migration, real invitation email, live LLM call, authenticated browser
  workflow, backup restore, or load test was performed. PGlite verifies PostgreSQL
  behavior, not Supabase Auth/PostgREST/email configuration.
- Final local totals: **12 database tests and 8 frontend tests passed**; ESLint,
  TypeScript and the Next.js production build passed. `git diff --check` passed.
- Transaction regression tests exercise service control flow with stub sessions;
  real API/database rollback and concurrent edits still need integration testing.

## Deployment requirements for these fixes

Use a staging Supabase project first. The shared project was not modified.

1. Deploy during a provisioning maintenance window: backend provisioning now
   writes trusted app metadata, and the new trigger rejects the old payload.
2. Run `db/auth_trigger.sql`, then
   `db/migrations/2026-10-25_browser_read_only.sql`, then
   `db/migrations/2026-10-26_ingestion_scope.sql` using a privileged migration account.
   Existing installations missing the institution-admin enum need
   `db/migration_institution_admin.sql` first. Run `seed_minimal.sql` only for the
   intended development/bootstrap tenant, not as general production tenant setup.
3. Deploy the matching backend/frontend. The backend's database role must retain
   write rights; the browser must use the publishable key. Auth administration uses
   the secret key separately.
4. Run Supabase integration tests with separate tenant and role fixtures, test a
   complete invitation/password setup, and verify section/scenario rollback with
   an injected scoring failure. Confirm historic data and audit records remain.
5. Keep browser writes disabled if application issues occur. Reconcile partial
   Auth provisioning using its returned user ID; do not repeatedly create accounts.

## Remaining launch blockers

| Priority | Evidence / gap | Acceptance criterion |
|---|---|---|
| P1 | HoD APIs such as `routers/sections.py`, `routers/students.py`, and the LLM snapshot still use institution-wide scope. Tenant RLS does not restrict teachers to assigned sections or HoDs to assigned departments. | One authorization model enforced in API and RLS; negative tests across two tenants, two departments, two teachers, join tables, reports, analytics and LLM context. A direct REST request must not bypass page filters. |
| P1 | Login offers password recovery, but there is no dedicated password-update/confirmation flow. Provisioning spans Auth and SQL without full retry/compensation. | A new institution admin and teacher can accept an invite, set/reset a password and sign in; expired links and partial failures have recoverable states. Delivery retry is idempotent. |
| P1 | Fresh teacher creation does not create a teaching profile; practical teacher-profile, survey and peer-data collection workflows are incomplete. | An institution can populate the inputs needed for meaningful planning using its own data, without running demo seeds or editing SQL. |
| P1 | Scores can use neutral defaults for missing profiles. Stored runs do not preserve a complete snapshot of input profile/edge/config versions; readers can display historical results beside changed rosters. | Visible completeness and missing-data status; stale-result handling; immutable simulation inputs; a historic result can be reproduced. |
| P1 | `engines/early_warning.py` maps compatibility bands to assumed grade/attendance expectations and suggests assignment/roster changes. These thresholds are not validated educational predictions. | Separate institution-set observed-data alert thresholds from experimental compatibility scores. Require human review and track actions without asserting causality. |
| P1 | Teacher recommendations consider the whole institution without subject eligibility, workload or availability. | Ineligible teachers cannot be recommended; every hard constraint is checked before apply, with an understandable reason when no solution exists. |
| P1 | No verified release pipeline, Supabase integration gate, restore drill, production monitoring, or tenant data lifecycle. LLM calls lack tenant usage budgets. | CI gates, staging smoke tests, restore evidence, error monitoring, retention/export/deletion workflow, upload bounds and LLM spend/rate limits. |
| P2 | Reports, planning details and LLM snapshots contain per-row queries; history reads can be unbounded. | Measure representative cohorts, add pagination/batched queries where needed, and set a response-time target against real data volumes. |

These are release gates, not claims that a full production hardening effort was
completed by this review. Drafting policies is insufficient: verify them against
the actual Supabase deployment before an external pilot.

## Product direction: what a department would pay for

**Proposed buyer:** the HoD or academic coordinator of one university department;
the institution admin/registrar is the budget owner to validate. Start with one
department and one term, with spreadsheet imports. This is a customer hypothesis,
not evidence of willingness to pay.

**Proposed promise:** “Prepare an explainable, approved section and teacher plan
with fewer conflicts and less spreadsheet rework.” The existing scenario builder,
comparison, audit trail and reporting are useful foundations for this promise.

Academic scheduling guidance emphasizes student demand, faculty availability,
room assignments and modality together. That supports prioritizing operational
constraints and measurable planning outcomes. [AASCU course scheduling guide](https://aascu.org/resources/course-scheduling-data-guide/).
Existing scheduling products already connect demand to seat/section adjustments;
ClassIQ should test whether a simpler departmental workflow serves a local unmet
need rather than assuming its dashboards alone differentiate it.
[Coursedog scheduling workflow](https://coursedog.my.site.com/support/articles/Knowledge/LeveragingCourseDemandProjectionsinAcademicScheduling67fdaa32a4c92).

Keep FSLSM in the research scope as a self-reported preference signal. Do not sell
matching learning styles as an established route to higher grades. The evidence
review does not support that commercial claim; ClassIQ's own hard-coded affinity
rules also have no validation demonstrated here.
[Pashler et al., Learning Styles: Concepts and Evidence](https://doi.org/10.1111/j.1539-6053.2009.01038.x).

## Prioritized enhancement proposal

| Order | Build | Customer value | Evidence to collect |
|---|---|---|---|
| 1 | Guided institution/term setup; roster and teacher import preview; data validation; missing-input checklist; editable teacher profiles. | Reach a usable plan without developer assistance. | Time from a real spreadsheet to first valid scenario; import correction rate. |
| 2 | Hard constraints: section capacity, teacher eligibility/availability/load, locked assignments and duplicate enrollment rules. Add conflict explanations before automation. | Avoid plans that look good but cannot be used. | Zero violations in approved pilot plans; fewer manual corrections than the existing process. |
| 3 | Planning workspace: baseline vs alternatives, named revisions, completeness/staleness indicators, reviewer comments, explicit approval and roster export. | Give the HoD a defensible decision and handoff to existing systems. | Time spent preparing/revising plans; percentage of plans actually exported and used. |
| 4 | Weekly outcome import and intervention follow-up: owner, due date, action taken and resolution, using explicit institutional alert thresholds. | Turn alerts into accountable support work. | Follow-up completion and time to action; avoid claiming alerts caused grade changes. |
| 5 | Limited assistant with linked source records, visible data date/scope, uncertainty and per-tenant budgets. | Explain plans and prepare review summaries with less administrative effort. | Answer accuracy on a fixed institution-approved question set; cost per active department. |
| 6 | Integrate the one SIS/LMS most requested by paying pilots; add annual institution administration and billing. | Reduce recurring data-entry effort and make renewal practical. | Import time, repeat-term use and actual renewal commitments. |

Do not add a mobile app, LMS replacement, classroom animation, more LLM providers,
or a broad autonomous planner before validating the first three items. Automatic
plan generation should follow reliable constraints and comparison, not precede them.

## Small-team delivery and paid-pilot test

Indicative sequencing for the documented two-developer team; estimates need
rescoping after the access-control work and customer interviews.

1. **First 2–3 weeks:** close access/auth/provenance blockers, establish integration
   checks, and observe three coordinators completing their current planning task.
   Record the baseline time and error/correction count.
2. **Next 3–5 weeks:** complete setup/import, core constraints, comparison/approval
   and export. Test one real department dataset with staff supervision.
3. **Following term/pilot:** operate with two or three departments, track the same
   planning task against baseline, and review weekly follow-up use. Validate
   educational outcomes over a term separately from immediate workflow value.

Proposed pilot acceptance targets (targets, not measured results): first usable
plan within one working day after valid imports; at least 30% less coordinator
time on a matched planning task; no hard-constraint violations in approved plans;
at least two pilot departments willing to pay to use it for the next term. Also
track support hours and cloud/LLM cost so paid use can sustain the service.

For the initial commercial test, sell a **fixed-scope departmental pilot per term**
with onboarding, agreed data volume and support limits. Keep normal staff seats
included. Interview the budget owner before quoting; no market price or
willingness-to-pay evidence was established in this review. Price against measured
administrative effort saved and the cost of delivering onboarding/support. After
repeat-term use, test an annual institution package with paid integrations.

The next implementation milestone should be **“one department can safely import
its own data, compare feasible plans, approve one and export it”**. That is a
concrete product outcome to validate before expanding the feature list.

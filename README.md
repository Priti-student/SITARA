# SITARA

**Unified, Intelligent Industrial Approval & Compliance Management Platform**

SITARA is a single-window platform that generates a personalised approval
checklist for entrepreneurs and industrial units, guides them through guided
documentation with pre-validation, coordinates parallel departmental
workflows, schedules inspections, tracks service-level timelines, issues
renewal alerts, and provides one dashboard for applications, approvals,
renewals and incentives.

> Status: **Phase 10 complete** — Demo seed data, end-to-end walkthrough & hardening (rich walkthrough dataset, 52-check live E2E, per-IP rate limiting, helmet headers).
> Phases 1–9 (auth/RBAC, knowledge engine, checklist wizard, guided applications, parallel workflows & SLAs, risk-based inspections, renewals & compliance, incentives, analytics & grievances) also done. See [Roadmap](#roadmap).

---

## Tech stack

| Tier | Technology |
|---|---|
| Backend | Node.js 22 · Express 5 · TypeScript · Zod |
| Database | PostgreSQL 16 via Prisma 7 (driver adapter `@prisma/adapter-pg`) |
| Auth | JWT (access + rotating refresh), bcrypt, RBAC |
| Frontend | React 19 · TypeScript · Vite 8 · React Router 7 |
| Tests | Vitest · Supertest |

## Repository layout

```
SITARA/
├── regulatory_rules.json   # Seed data for the Regulatory Knowledge Engine (Phase 2)
├── server/                 # Express API
│   ├── prisma/             # Schema + migrations + seed
│   └── src/                # config · middleware · routes · services · controllers · utils
└── web/                    # React (Vite) frontend
    └── src/                # api · context · pages
```

## Prerequisites

- Node.js ≥ 22
- PostgreSQL running locally on `localhost:5432`
- Git

## Setup

### 1. Backend (`server/`)

```bash
cd server
npm install

# Create your environment file from the template (NO real secrets are committed)
cp .env.example .env      # Windows: copy .env.example .env
#   → set DATABASE_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

# Create the database + tables and seed roles + bootstrap admin
npx prisma migrate dev --name init
npx prisma db seed

npm run dev               # API on http://localhost:4000
```

The seed script reads `ADMIN_EMAIL`/`ADMIN_PASSWORD` from `.env` only —
credentials are never hardcoded or committed.

### 2. Frontend (`web/`)

```bash
cd web
npm install
npm run dev               # SPA on http://127.0.0.1:5173 (proxies /api -> :4000)
```

Open **http://127.0.0.1:5173** in a browser.

### 3. Tests & checks

```bash
cd server
npm test                  # Vitest + Supertest (health + full auth lifecycle)
npx tsc --noEmit          # server typecheck
cd ../web
npx tsc --noEmit && npm run build   # web typecheck + production build
```

## API (v1)

| Method | Path | Description |
|---|---|---|
| `GET`  | `/api/v1/health`          | Liveness + DB connectivity probe |
| `POST` | `/api/v1/auth/register`   | Create account (APPLICANT / UNIT_USER) |
| `POST` | `/api/v1/auth/login`      | Email + password → token pair |
| `POST` | `/api/v1/auth/refresh`    | Rotate refresh token |
| `POST` | `/api/v1/auth/logout`     | Revoke refresh token |
| `GET`  | `/api/v1/auth/me`         | Current user profile (auth required) |
| `GET`  | `/api/v1/rules`            | Rule catalogue (filters: ruleType, authority, q) |
| `GET`  | `/api/v1/rules/:id`        | Rule detail with linked approval/authority |
| `POST` | `/api/v1/rules/evaluate`   | Run the knowledge engine on a unit/profile context |
| `GET`  | `/api/v1/rules/approval-types` | Approval-type master catalogue with requirements |
| `POST` | `/api/v1/units`             | Register an industrial unit (caller becomes OWNER) |
| `GET`  | `/api/v1/units` / `/:id`    | My units / unit detail |
| `POST` | `/api/v1/checklists/preview` | Run engine without persisting |
| `POST` | `/api/v1/checklists`        | Persist a checklist (items + risk) and notify |
| `GET`  | `/api/v1/checklists` / `/:id` | My checklists / detail (labelled documents, stage-grouped) |
| `PATCH`| `/api/v1/checklists/:id/items/:itemId` | Update item status (PENDING/APPLIED/…) |
| `GET`  | `/api/v1/notifications`    | In-app notifications + unread count |
| `POST` | `/api/v1/notifications/:id/read` · `/read-all` | Mark notifications read |
| `POST` | `/api/v1/applications`     | Create a DRAFT application (unit + approval type) |
| `GET`  | `/api/v1/applications` / `/:id` | My applications / detail (form schema + requirements) |
| `PUT`  | `/api/v1/applications/:id/form` | Save guided-form responses (draft) |
| `POST` | `/api/v1/applications/:id/documents` | Upload (multipart) with pre-validation + duplicate detection |
| `POST` | `/api/v1/applications/:id/documents/reuse` | Reuse a unit-vault document |
| `DELETE`| `/api/v1/applications/:id/documents/:docId` | Remove an attached document |
| `POST` | `/api/v1/applications/:id/submit` | Gated submit (422 until form+docs complete) → workflow activated (UNDER_SCRUTINY) |
| `POST` | `/api/v1/applications/:id/query-response` | Applicant responds to a department query |
| `GET`  | `/api/v1/units/:id/documents` | Unit verified-data vault |
| `GET`  | `/api/v1/department/inbox` | Officer inbox: active workflow items with SLA flags |
| `GET`  | `/api/v1/department/applications/:id` | Full workflow view (parallel tracks, events, approvals) |
| `POST` | `/api/v1/department/applications/:id/approve` | Approve current step (step + role enforced, e.g. AA for final) |
| `POST` | `/api/v1/department/applications/:id/reject` | Reject the application (notifies applicant) |
| `POST` | `/api/v1/department/applications/:id/query` | Raise a query (track pauses; applicant notified) |
| `POST` | `/api/v1/department/applications/:id/escalate` | Manual escalation (mark-up note required) |
| `POST` | `/api/v1/department/sla/run` | Trigger SLA pass now (watchdog also runs every 60s) |
| `GET`  | `/api/v1/inspections` | List joint inspections (filters: `status`, `applicationId`, `mine=true`) |
| `POST` | `/api/v1/inspections` | Plan a joint inspection (departments default from workflow tracks) |
| `GET`  | `/api/v1/inspections/:id` | Detail: participants, observations, risk snapshot, audit events |
| `POST` | `/api/v1/inspections/:id/assign` | Assign an inspector to a participating department |
| `POST` | `/api/v1/inspections/:id/start` | Begin the site visit (assigned inspector or officer) |
| `POST` | `/api/v1/inspections/:id/observation` | Inspector files their department's field observations |
| `POST` | `/api/v1/inspections/:id/complete` | Consolidated findings + compliance verdict (COMPLIANT/DEFICIENT/NON_COMPLIANT) |
| `POST` | `/api/v1/inspections/:id/cancel` | Cancel a planned/in-progress visit with a reason |
| `GET`  | `/api/v1/inspections/risk/:applicationId` | Compute/persist risk assessment (0–100 score → scrutiny level) |
| `GET`  | `/api/v1/inspections/inspectors` | Active inspector directory for assignment |
| `GET`  | `/api/v1/renewals/due` | Approvals in the renewal window (filters: `days=`; owner-scoped) |
| `GET`  | `/api/v1/renewals/:approvalId` | Renewal readiness: countdown, pending renewal, blockers |
| `POST` | `/api/v1/renewals` | Open a renewal draft prefilled from the original application |
| `POST` | `/api/v1/renewals/sweep` | Run the expiry/alert pass now (watchdog also runs every 60s) |
| `GET`  | `/api/v1/compliance` | Remediation cases + status counts (filters: `status`, `unitId`) |
| `GET`  | `/api/v1/compliance/units/:unitId` | Derived unit compliance status (open cases + last verdict) |
| `GET`  | `/api/v1/compliance/:caseId` | Case detail: findings, history, action flags |
| `POST` | `/api/v1/compliance/:caseId/remediate` | Applicant files remediation proof (OPEN → REMEDIATED) |
| `POST` | `/api/v1/compliance/:caseId/resolve` | Officer verifies: accept (→ RESOLVED) or reject (→ reopen) |
| `GET`  | `/api/v1/incentives/schemes` | Scheme catalogue (optional `?unitId=` enriches every row with a live eligibility evaluation + your claim state) |
| `POST` | `/api/v1/incentives/schemes/:id/check` | Dry-run eligibility for a unit — per-condition expected/actual checks |
| `GET`  | `/api/v1/incentives/claims` | Claims queue + status counts (filters: `status`, `unitId`; applicant-scoped) |
| `POST` | `/api/v1/incentives/claims` | File a claim (server re-checks eligibility, window & ceiling → 422/409) |
| `GET`  | `/api/v1/incentives/claims/:id` | Claim detail: scheme, unit, audit timeline, action flags |
| `POST` | `/api/v1/incentives/claims/:id/review` | Officer starts review (SUBMITTED → UNDER_REVIEW) |
| `POST` | `/api/v1/incentives/claims/:id/decide` | Approve (with amount ≤ request/ceiling) or reject with notes |
| `POST` | `/api/v1/incentives/claims/:id/disburse` | State/platform admin records the disbursement reference (→ DISBURSED) |
| `POST` | `/api/v1/incentives/claims/:id/utilise` | Unit records how the funds were used (→ UTILISED) |
| `GET`  | `/api/v1/analytics/overview` | Dashboard KPIs, 6-month application trend, breakdowns & department workload (scope: `PLATFORM` for officers, `MINE` otherwise) |
| `GET`  | `/api/v1/analytics/alerts` | Consolidated alert feed (SLA breaches, overdue renewals/grievances…) scoped to the caller |
| `GET`  | `/api/v1/grievances` | Grievance queue + status counts (filters: `status`, `unitId`; filer-scoped) |
| `POST` | `/api/v1/grievances` | File a grievance (priority sets SLA: HIGH 2d · MEDIUM 5d · LOW 10d) |
| `GET`  | `/api/v1/grievances/:grievanceId` | Detail: timeline, assignee, overdue flag, action flags (`can`) |
| `POST` | `/api/v1/grievances/:grievanceId/acknowledge` | Officer takes the case (OPEN/ESCALATED → IN_PROGRESS) |
| `POST` | `/api/v1/grievances/:grievanceId/respond` | Officer adds a response (notifies the filer) |
| `POST` | `/api/v1/grievances/:grievanceId/resolve` | Officer resolves (`accepted: true`) or rejects with notes |
| `POST` | `/api/v1/grievances/:grievanceId/escalate` | Escalate one level — filers only once the SLA is missed |
| `POST` | `/api/v1/grievances/sweep` | Run the overdue/auto-escalation pass now (watchdog also runs every 60s) |

All responses use a uniform envelope:
`{ "success": true, "data": ... }` / `{ "success": false, "error": { "code", "message", "details?" } }`.

## Roles (seeded)

`SUPER_ADMIN` · `STATE_ADMIN` · `DEPARTMENT_USER` · `APPROVING_AUTHORITY` ·
`INSPECTOR` · `APPLICANT` · `UNIT_USER`

## Verifying roles work (3 layers)

**1. Data layer — roles exist in the DB**

```bash
cd server
npx prisma studio      # open http://localhost:5555, inspect Role (7 rows) and UserRole
```

**2. Auth layer — a user carries the right role**

```bash
cd server
npm run db:seed:demo   # creates one user per role; passwords = DEMO_USER_PASSWORD (.env)
```

Then sign in (e.g. `demo-superadmin@sitara.test`) and call
`GET /api/v1/auth/me` — the response contains `"roles": ["..." ]`.

**3. Authorization layer — RBAC is enforced**

`GET /api/v1/admin/ping` is guarded by `requireRoles("SUPER_ADMIN")`:

| Who | Expect |
|---|---|
| No token | **401** `UNAUTHENTICATED` |
| `demo-applicant@sitara.test` (valid token) | **403** `FORBIDDEN` |
| `admin@sitara.gov.in` / `demo-superadmin@sitara.test` | **200** with your roles echoed |

The same matrix is covered automatically by `tests/rbac.test.ts` (run `npm test`).

**One-command verification** — logs in as every demo role + the bootstrap admin
and probes the guarded route:

```bash
cd server
npm run roles:check        # DATA (role rows) · AUTH (/me claims) · RBAC (/admin/ping)
```

Expected output (abridged):

```
WHO                    EMAIL                           AUTH   PING   VERDICT
SUPER_ADMIN            demo-super-admin@sitara.test    OK     200    ✓ ALLOWED
DEPARTMENT_USER        demo-department-user@sitara.test OK    403    ✓ DENIED (expected for this role)
APPLICANT              demo-applicant@sitara.test      OK     403    ✓ DENIED (expected for this role)
ADMIN (.env)           admin@sitara.gov.in             OK     200    ✓ ALLOWED
<no token>             —                               n/a    401    ✓ DENIED (401, expected)
```

> Want your own admin? Edit `ADMIN_EMAIL`/`ADMIN_PASSWORD` in `server/.env` and
> re-run `npm run db:seed` — the seed now **refreshes** those credentials on
> every run. All demo/seed passwords come from `.env`, never from code.

## Regulatory Knowledge Engine (Phase 2)

The `regulatory_rules.json` seed is imported into `RegulatoryRule` rows on every
`npm run db:seed`, alongside the master catalogue (departments, authorities,
approval types, document types, requirements).

Engine behaviour (`server/src/rules/`):

- **Conditions** are JSON: boolean flags, numeric suffixes (`_gte`, `_lt`…),
  array membership/intersection, and `anyOf`/`allOf` combinators.
- **Evaluator** (`evaluator.ts`) is pure and deterministic — fed a
  unit/profile context it returns applicable approvals (with merged documents,
  stage, department), a risk classification (RED/AMBER/GREEN), workflow hints,
  and the list of fired rule IDs.
- **Engine service** (`engine.ts`) loads active rules from PostgreSQL and
  evaluates the same pure core.

Example — a pharmaceuticals factory in Pune with pollution-relevant activity is
classified **RED** and gets: Environmental Clearance, MPCB Consent to Establish,
Consent to Operate (+ its 60-day renewal alert), Fire Provisional NOC, and ESI
registration, each with its document checklist.

The admin rule viewer lives at **/rules** (SUPER_ADMIN / STATE_ADMIN).

## Discovery wizard → checklist (Phase 3)

A 5-step wizard (`/checklists/new`) collects location → industry → size → stage →
activity flags, and calls the engine live (`POST /checklists/preview`) before
persisting. A saved checklist (`Checklist` + `ChecklistItem` rows) carries a
snapshot of the result, risk category, approvals grouped by stage (pre-establishment
→ post-operation) and each required document — with an in-app notification
(`CHECKLIST_READY`). Applicants track item status (PENDING/APPLIED/APPROVED/
SKIPPED/NOTED) from `/checklists/:id`; `/notifications` lists alerts.

## Department workflows (Phase 5)

Submitting an application activates one `WorkflowInstance` **per department track**
(`ApprovalType.workflow` route — e.g. MPCB CTE fans out to ENV + INDUSTRY in
parallel). Each track walks ordered steps with per-step SLA deadlines; officers
act through `/api/v1/department/*` and every action writes an immutable
`WorkflowEvent` (audit trail). Highlights:

- **Role/step enforcement** — `DEPARTMENT_USER` approves examiner steps;
  the final "Approve" step requires `APPROVING_AUTHORITY` (403 otherwise).
- **Queries** — raising one pauses the track (`QUERY` on the application);
  the applicant replies via `POST /applications/:id/query-response` and the
  track resumes (`QUERY_WAITING` → `ACTIVE`).
- **SLA watchdog** — a 60s interval detects overdue instances, records
  `SLA_BREACH`/`AUTO_ESCALATED` and bumps `escalatedAt`; same pass runnable
  manually via `POST /department/sla/run`.
- **Completion** — when every track resolves, the application becomes
  `APPROVED` (or `REJECTED`) and a single `Approval` record with its certificate
  number is issued; state admins are notified.

Verified by `tests/p5.workflow.test.ts` (fan-out, role guard, query loop,
rejection, auto-escalation) and the live script `scripts/p5-e2e.ts`
(`npm run dev` + `npx tsx scripts/p5-e2e.ts` — 16 checks across applicant,
ENV officer, approving authority and INDUSTRY officer).

## Inspections & risk-based scrutiny (Phase 6)

- **Risk scoring** — `server/src/inspections/risk.ts` is a pure scorer: it
  weights classification (RED = 40), capital outlay (≥ ₹10 Cr = 25),
  workforce (≥ 100 = 15), rejected documents (10), prior rejections (10) and
  prior non-compliance (30) into a **0–100 score**: `0–39 → LOW/DESK`,
  `40–59 → MEDIUM/ENHANCED`, `≥ 60 → HIGH/PHYSICAL`. Factors are persisted as
  a JSON snapshot with the `RiskAssessment` row; a completed `NON_COMPLIANT`
  inspection re-lifts the application's risk.
- **Joint planning** — one officer plans **one visit for all departments**;
  participants default to the application's active workflow tracks and can be
  adjusted. One open inspection per application (409 on duplicate).
- **Lifecycle** — `SCHEDULED → IN_PROGRESS → COMPLETED` (or `CANCELLED` with
  a reason). Officers (planners) schedule/assign/complete/cancel; assigned
  inspectors (+ officers) start the visit and file **department-specific
  field observations**; completion requires at least one observation and
  produces consolidated findings plus a `COMPLIANT` / `DEFICIENT` /
  `NON_COMPLIANT` verdict — all written to the `WorkflowEvent` audit trail
  (`INSPECT_*` types).
- **Surfaces** — applicant sees risk + inspections on the application page;
  officers get risk panel, planning form and inspector assignment on the
  department application view; `/inspections` list + `/inspections/:id`
  detail serve officers and inspectors (filters, "mine" toggle, start /
  observe / complete / cancel actions). Seeded inspectors:
  `demo-inspector-{env|fire|industry|labour}@sitara.test`.

Verified by `tests/p6.inspections.test.ts` (risk scoring, RBAC, joint
planning, duplicate block, assignment, lifecycle, non-compliance risk lift,
cancel flow) and the live script `scripts/p6-e2e.ts`
(`npm run dev` + `npm run db:seed:demo` + `npx tsx scripts/p6-e2e.ts` —
28 checks covering RED-app risk lift, planning, applicant visibility,
assignment, field observations, completion and audit trail).

## Renewals & compliance monitoring (Phase 7)

- **Approval lifecycle** — every `Approval` carries renewal state
  (`renewalCount`, `renewedAt`, `renewalAlertAt`, links to its renewal
  application). A **renewal application EXTENDS the existing approval** —
  same certificate number, new validity — instead of minting a second record.
- **Expiry sweep** — `runRenewalPass()` (timer every 60s + officer-only
  `POST /renewals/sweep`) lapses past-validity approvals to `EXPIRED` and
  sends **one pre-expiry alert per renewal cycle** (60-day default window,
  guarded by `renewalAlertAt`). Idempotent: re-running is always safe.
- **Renewal readiness** — `GET /renewals/:approvalId` reports the countdown
  plus explicit blockers: `APPROVAL_REVOKED`, `RENEWAL_PENDING` (duplicate
  prevention) and `OPEN_COMPLIANCE_CASE`. Only a unit's own members can file
  a renewal; the draft inherits the original application's form data and is
  linked both ways (`Application.linkedApprovalId` ↔ `Approval.renewalApplicationId`).
- **Auto-opened compliance cases** — completing an inspection with a
  `DEFICIENT` (15-day window) or `NON_COMPLIANT` (7-day) verdict opens a
  `ComplianceCase` with a remediation deadline and notifies the applicant.
- **Remediation loop** — `OPEN → REMEDIATED → RESOLVED`, with officer
  rejection reopening the case (`CASE_OPENED/REMEDIATED/REOPENED/RESOLVED`
  audit events). Open cases block renewal until resolved; the unit's
  compliance status derives from open cases first, then the last verdict.
- **Surfaces** — `/renewals` (window filter, countdowns, blocker panel,
  start-renewal, officer sweep) and `/compliance` (status counts, case
  history timeline, remediate/resolve forms) + dashboard cards.

Verified by `tests/p7.renewals.test.ts` (7 tests: issuance, scoping,
auto-opened case + renewal block, remediation loop, prefilled draft +
duplicate block, renewal extension, sweep idempotency) and the live script
`scripts/p7-e2e.ts` (`npm run dev` + `npm run db:seed:demo` +
`npx tsx scripts/p7-e2e.ts` — 41 checks covering due list, readiness,
inspection → case → block → remediate → resolve → renew → sweep).

## Incentives: eligibility & utilisation (Phase 8)

- **Scheme catalogue** — `IncentiveScheme` rows (seeded: MSME capital
  subsidy, interest subvention, green compliance bonus, skill development
  grant) carry a **condition-tree `eligibility` JSON** evaluated by the
  Phase-2 condition engine against a context built from the unit's profile
  plus derived facts (`hasActiveApproval`, `openComplianceCases`,
  `isVerified`). `GET /incentives/schemes?unitId=…` returns every scheme
  enriched with a live evaluation — each top-level condition becomes a
  human-readable check (expected vs. actual) so units see *exactly* why
  they do (not) qualify.
- **Server-side re-check at filing** — `POST /incentives/claims` re-runs
  eligibility, the application window and the amount ceiling before
  accepting: `CLAIM_INELIGIBLE` (422, with the failed checks),
  `AMOUNT_EXCEEDS_CEILING` (422), `WINDOW_CLOSED` (409),
  `CLAIM_IN_PROGRESS` / `CLAIM_ALREADY_AVAILED` (409 — one live claim per
  unit+scheme; `REJECTED` lets the unit re-apply).
- **Claim lifecycle** — `SUBMITTED → UNDER_REVIEW → APPROVED / REJECTED →
  DISBURSED → UTILISED`, every transition guarded (409 `BAD_STATE`),
  audit-logged in `IncentiveClaimEvent` and pushed as notifications.
  Officers (dept desk/approver) review and sanction (amount must cover
  the request and stay under the ceiling); **money movement is restricted
  to STATE_ADMIN/SUPER_ADMIN** (`disburse`, UTR reference); only the
  **unit** records utilisation — officers get 403.
- **Scoping** — applicants only ever see their own units' claims (404 on
  foreign units); officers see the full review queue with status counts.
- **Surfaces** — `/schemes` (unit selector, category filter, per-check
  "Why / Why not?" panel, inline claim filing) and `/claims` (status
  filter chips with counts, audit timeline, role-aware action forms) +
  dashboard cards.

Verified by `tests/p8.incentives.test.ts` (7 tests: catalogue +
eligibility + scoping, dry-run checks, filing guards, full lifecycle with
RBAC, rejection + re-apply, timeline/action flags, queue scoping) and the
live script `scripts/p8-e2e.ts` (`npm run dev` + `npm run db:seed:demo` +
`npx tsx scripts/p8-e2e.ts` — 30 checks covering eligibility, filing
guards, review → approve → disburse → utilise, rejection, timeline and
notifications).

## Dashboards, analytics, alerts & grievances (Phase 9)

- **Scoped analytics** — `GET /analytics/overview` builds a KPI board
  (units, applications, active/overdue tracks, inspections done, renewals
  due, open compliance cases & grievances), a **6-month application
  trend** (filed vs. approved), status breakdowns per module and a
  department workload table. Officers (dept desk, approver, inspector,
  state/platform admin) see `PLATFORM` scope; applicants/unit users are
  scoped to `MINE` (their own units' filings only).
- **Consolidated alert feed** — `GET /analytics/alerts` derives signals
  from live data (overdue workflow SLAs, expiring renewals, compliance
  deadlines, overdue grievance response SLAs) with severity, count, deep
  link and timestamp — platform-level for officers, unit-scoped for
  everyone else.
- **Grievances with SLA clocks** — `POST /grievances` files a grievance
  with priority-driven SLA (HIGH 2d · MEDIUM 5d · LOW 10d) and a
  `GRV-YYYYMMDD-XXXX` reference. Officers **acknowledge** (→
  IN_PROGRESS), **respond**, then **resolve**/reject; each transition is
  audit-logged in `GrievanceEvent`, notified to the filer, and surfaced
  through `can` action flags on the detail.
- **Auto-escalation** — a 60s watchdog (`POST /grievances/sweep` also
  runnable manually) escalates grievances whose response SLA is missed
  (level +1, re-notifies filer & state admins); filers may escalate once
  themselves after the deadline (`ESCALATED` → officers can acknowledge
  again). Lists are scoped — applicants only ever see their own filings.
- **Surfaces** — `/analytics` (KPI grid, trend chart, alert feed,
  breakdown cards, department workload) and `/grievances` (status filter
  chips with counts, SLA-missed badges, filing form, detail panel with
  audit timeline + role-aware acknowledge/respond/resolve/escalate
  forms) + dashboard cards.

Verified by `tests/p9.grievances.test.ts` + `tests/p9.analytics.test.ts`
(12 tests: filing/SLA/scoping, lifecycle & RBAC, escalation rules, sweep
auto-escalation, overview scoping & trend, alert feed) and the live
script `scripts/p9-e2e.ts` (`npm run dev` + `npm run db:seed:demo` +
`npx tsx scripts/p9-e2e.ts` — 37 checks covering the full grievance
journey plus analytics/alert payloads).

## Demo seed data, walkthrough & hardening (Phase 10)

- **`npm run db:seed:data`** builds a walkthrough-ready dataset through the real
  service layer: one pharma unit with all six application states (DRAFT,
  UNDER_SCRUTINY, QUERY, APPROVED ×3 incl. a renewed CTO, REJECTED), a completed
  COMPLIANT inspection, a full claim lifecycle (filed + utilised), one open and
  one resolved grievance, plus a checklist and audit events. Idempotent —
  re-running wipes and rebuilds the same unit (`SITARA-P10-DEMO`), so counts
  never drift. Requires `db:seed` + `db:seed:demo` first.
- **`npm run e2e:p10`** (server must be running) drives the entire citizen
  journey live: security probes (401/403/malformed-JSON/helmet/rate-limit
  headers) → knowledge-engine preview → unit + checklist → guided submission →
  2-track parallel fan-out with SLA stamps → ENV query round-trip → risk scoring
  (HIGH/PHYSICAL) → joint ENV+INDUSTRY inspection (assign/start/observe/complete)
  → dual-track approval + issued certificate → renewal readiness → MSME claim
  through UTILISED → grievance RESOLVED → analytics/alerts/notifications → SLA
  pass → **cleanup** (walkthrough unit wiped; the demo dataset is untouched).
  Prints `LIVE E2E ALL GREEN — 52 checks` and exits non-zero on any failure.
- **Hardening:** helmet security headers, per-IP rate limiting
  (global `/api/v1` budget + stricter `/api/v1/auth` budget — returns the standard
  JSON envelope with `RATE_LIMITED` and `Retry-After`), malformed JSON → 400,
  secrets only from `server/.env`.

## Security notes

- **No secrets in code or config.** Passwords, DB credentials and JWT secrets
  live in `server/.env` (gitignored; template at `server/.env.example`).
- Passwords hashed with bcrypt (12 rounds); refresh tokens stored as SHA-256
  hashes and rotated on every use.
- JWT access tokens carry only identity + roles; profile data is always read
  fresh from the DB.
- Central error handler never leaks stack traces; malformed JSON → clean 400.

## Roadmap

- **P2** ✅ Master data + Regulatory Knowledge Engine (rule parser/evaluator)
- **P3** ✅ Discovery wizard → personalised approval checklist (units, notifications)
- **P4** ✅ Guided applications, document pre-validation & verified-data reuse
- **P5** ✅ Parallel department workflows, SLAs, queries, audit trail
- **P6** ✅ Risk-based scrutiny + joint inspection planning
- **P7** ✅ Renewals & compliance monitoring
- **P8** ✅ Incentives/schemes eligibility & utilisation
- **P9** ✅ Dashboards, analytics, alerts & grievance escalation
- **P10** ✅ Demo seed data, end-to-end walkthrough, hardening

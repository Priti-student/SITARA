# SITARA

**Unified, Intelligent Industrial Approval & Compliance Management Platform**

SITARA is a single-window platform that generates a personalised approval
checklist for entrepreneurs and industrial units, guides them through guided
documentation with pre-validation, coordinates parallel departmental
workflows, schedules inspections, tracks service-level timelines, issues
renewal alerts, and provides one dashboard for applications, approvals,
renewals and incentives.

> Status: **Phase 1 complete** — Foundations (auth, roles, units, health check,
> web scaffold). See [Roadmap](#roadmap) for the phases ahead.

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

All responses use a uniform envelope:
`{ "success": true, "data": ... }` / `{ "success": false, "error": { "code", "message", "details?" } }`.

## Roles (seeded)

`SUPER_ADMIN` · `STATE_ADMIN` · `DEPARTMENT_USER` · `APPROVING_AUTHORITY` ·
`INSPECTOR` · `APPLICANT` · `UNIT_USER`

## Security notes

- **No secrets in code or config.** Passwords, DB credentials and JWT secrets
  live in `server/.env` (gitignored; template at `server/.env.example`).
- Passwords hashed with bcrypt (12 rounds); refresh tokens stored as SHA-256
  hashes and rotated on every use.
- JWT access tokens carry only identity + roles; profile data is always read
  fresh from the DB.
- Central error handler never leaks stack traces; malformed JSON → clean 400.

## Roadmap

- **P2** Master data + Regulatory Knowledge Engine (rule parser/evaluator)
- **P3** Discovery wizard → personalised approval checklist
- **P4** Dynamic forms, document pre-validation, verified-data reuse
- **P5** Parallel department workflows, SLAs, queries, audit trail
- **P6** Risk-based scrutiny + joint inspection planning
- **P7** Renewals & compliance monitoring
- **P8** Incentives/schemes eligibility & utilisation
- **P9** Dashboards, analytics, alerts & grievance escalation
- **P10** Demo seed data, end-to-end walkthrough, hardening

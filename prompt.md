# PG Management & Tenant Communication Platform — Master Build Specification

**Document type:** Master `prompt.md` for AI coding agents (senior-developer-level build brief)
**Status:** Production build, not a prototype
**Owner:** Shiva

---

## 0. How to Use This Document

This is the single source of truth for every agent working on this codebase. Any agent (human or AI) picking up a task must read Sections 1–6 before touching code, then jump to its own **Role Card** (Section 7) and the **Memory Map protocol** (Section 8) before writing anything.

Do not re-derive architecture decisions already made here. Do not silently deviate from the stack, folder structure, or naming conventions below — if something here is genuinely wrong, flag it in `/docs/deviations.md` with a reason, don't just change it.

---

## 1. Project Summary

A centralized **PG (Paying Guest) Management Platform** with two portals:

- **Admin Web App** — full operational control (rooms, tenants, billing, electricity, complaints, assets, reports, WhatsApp, settings).
- **Tenant Portal** — self-service view (dues, payment history, complaints, Wi-Fi info, contacts, notifications).

WhatsApp is a **notification channel bolted onto the core system**, never a dependency the core relies on to function. If WhatsApp is disconnected, rent records, billing, complaints, and reports must keep working normally.

Full feature list: see the original concept doc (rooms, tenants, rent, electricity billing, PDF bills, payment verification, complaints, assets, move-in/move-out, reports, notification center, audit log, search/filters). Nothing in that list is optional for MVP scope unless explicitly deferred to Phase 2/3 below.

---

## 2. Tech Stack (Fixed — Do Not Substitute Without Discussion)

| Layer | Choice | Notes |
|---|---|---|
| Frontend (Admin + Tenant) | **React.js** (Vite) + React Router + Tailwind CSS + React Hook Form + Recharts | Two separate route trees under one app, or two apps sharing a component library — agent's own judgement, document the choice in `/docs/architecture.md` |
| Backend | **Node.js + Express.js**, TypeScript | JS is acceptable only for throwaway scripts, never for API/business logic |
| Primary Database | **Supabase (PostgreSQL)** | See Section 5 for detailed rules |
| Auth | **Supabase Auth** (email/password + JWT) wired through backend middleware — not raw client-side-only auth | See Section 9 for session rules |
| File/Document Storage | **Supabase Storage** (tenant ID docs, photos, payment screenshots, PDFs) | Buckets must be private with signed URLs, never public |
| Background Jobs / Queue | **BullMQ + Redis** | Rent reminders, electricity notifications, PDF generation/send, WhatsApp dispatch, retries |
| WhatsApp Integration | **Baileys** (Node.js WhatsApp Web library), run as an isolated microservice | See Section 10 |
| PDF Generation | **WeasyPrint** (or Puppeteer/PDFKit if WeasyPrint isn't viable in the chosen runtime) — must render correctly, no layout breakage | Templated HTML → PDF, not string-concatenated PDF drawing |
| State/Build Memory | **Graphify-based memory map** | See Section 8 — mandatory |

**Do not** introduce a second database, a second ORM, or a second auth provider without updating this table and explaining why.

---

## 3. Do's and Don'ts

### Do
- Write TypeScript on the backend, with strict mode on.
- Keep WhatsApp, billing, and core CRUD as **separate service layers** — the API layer calls services, services never talk to Baileys directly except through the WhatsApp service module.
- Use Zod (or equivalent) for all request validation at the API boundary.
- Use parameterized queries / Supabase client methods exclusively — never string-concatenated SQL.
- Write every currency value in paise/integer form in the DB (avoid float rent/electricity math); format to ₹ only at the presentation layer.
- Keep all WhatsApp message templates in one config file (`/config/whatsapp-templates.ts`), not scattered inline strings.
- Log every admin-side mutating action to the audit log table (Section 6.13).
- Use environment variables for all secrets, Supabase keys, Redis URL, JWT secret — never hardcode.
- Write migrations for every schema change (Supabase CLI / SQL migration files), never hand-edit the live schema.
- Keep the queue worker and the API server as separate processes/entry points, even if deployed together initially.

### Don't
- Don't put business logic in React components — components call API/service hooks only.
- Don't send WhatsApp messages synchronously from a request handler — everything mutating tenant-facing comms goes through the BullMQ queue.
- Don't blast all reminders at once — always stagger via the queue (see Section 10.3).
- Don't store tenant ID documents, payment screenshots, or agreements in a public bucket or on the filesystem — Supabase Storage private buckets only.
- Don't use `any` in TypeScript except at a well-commented boundary (e.g. raw third-party payloads).
- Don't use AI-generated emoji anywhere in code — no emoji in commit messages, comments, log strings, console output, UI copy, or variable/function names. Icons in the UI come from an icon library (e.g. lucide-react), never emoji characters.
- Don't build a dark theme. See Section 11.
- Don't let a tenant's API calls reach another tenant's data by ID manipulation — every tenant-scoped query must be filtered server-side by the authenticated tenant's own ID, never trust a client-supplied tenant ID.
- Don't re-read/re-analyze the whole repo for every small change — follow the Memory Map protocol (Section 8).

---

## 4. Loop Engineering Protocol (Build Workflow)

Every feature/module goes through this loop, not a single one-shot generation pass:

1. **Spec** — Restate the module's scope from this document in 3–5 bullets before writing code. Confirm it against the Memory Map (does this module already exist partially? what does it depend on?).
2. **Scaffold** — Create the minimal file/folder structure and types/interfaces first, no implementation logic yet.
3. **Implement** — Write the actual logic in small, reviewable increments (one endpoint/component at a time, not a giant dump).
4. **Self-check** — Re-read the diff against Section 3 (Do's/Don'ts) and Section 12 (Security). Check for emoji, dark-theme leakage, unvalidated input, unscoped queries.
5. **Update Memory Map** — Append/update the relevant node in the memory map (Section 8) with what changed, what it exposes, what it depends on. This is not optional — a module isn't "done" until its memory-map entry is written.
6. **Report** — Summarize what was built, what's stubbed, what's pending, in plain language — no emoji, no filler.

Repeat per module. Don't attempt the whole platform in one pass — go module by module per the phase order in Section 13.

---

## 5. Supabase & Dataset Rules

- **Schema ownership:** All tables live in Supabase Postgres, defined via SQL migration files checked into `/db/migrations/`. Never apply schema changes through the Supabase dashboard UI directly in a way that isn't captured in a migration file.
- **Row Level Security (RLS):** RLS must be **enabled on every table containing tenant data**. Policy pattern:
  - Admin role: full access scoped to their own PG/org (support multi-PG later — Section 13 Phase 3).
  - Tenant role: `SELECT`/`UPDATE` only on rows where `tenant_id = auth.uid()` (or the mapped tenant record), never broader.
- **Service role key** (bypasses RLS) is used **only** in trusted backend contexts (queue workers, admin-verified operations) — never exposed to frontend, never used in a request path that takes unvalidated tenant input.
- **Storage buckets:** `tenant-documents`, `payment-screenshots`, `generated-bills`, `assets-photos` — all private, accessed via short-lived signed URLs generated server-side.
- **Datasets:** If seed/reference datasets are used (e.g. sample room/tenant data for dev), keep them in `/db/seed/` as SQL or JSON, clearly separated from production migrations, and never auto-run against a production Supabase project.
- **Realtime (optional, Phase 2):** Supabase Realtime can back the live notification center once the core dashboard is stable — don't build this before the core CRUD is solid.

---

## 6. Consolidated API Endpoints

All routes prefixed `/api/v1`. Auth required unless marked public. `[Admin]` / `[Tenant]` denotes role restriction; unmarked = either, scoped by RLS.

### 6.1 Auth
```
POST   /auth/register            [public]  admin/tenant registration (role-specific flow)
POST   /auth/login                [public]
POST   /auth/refresh              [public]  refresh JWT
POST   /auth/logout
GET    /auth/me
```

### 6.2 Rooms
```
GET    /rooms                     [Admin]
POST   /rooms                     [Admin]
GET    /rooms/:id                 [Admin]
PATCH  /rooms/:id                 [Admin]
DELETE /rooms/:id                 [Admin]
GET    /rooms/:id/beds            [Admin]
PATCH  /rooms/:id/beds/:bedId     [Admin]  assign/vacate bed
```

### 6.3 Tenants
```
GET    /tenants                   [Admin]
POST   /tenants                   [Admin]
GET    /tenants/:id               [Admin]  / [Tenant] self only
PATCH  /tenants/:id               [Admin]  / [Tenant] self, limited fields
DELETE /tenants/:id                [Admin]
POST   /tenants/:id/documents     [Admin]/[Tenant self]  upload ID/photo/agreement
GET    /tenants/:id/documents/:docId  signed URL
POST   /tenants/registration-link  [Admin]  generate self-registration form link
POST   /tenants/self-register/:token [public, token-scoped]
```

### 6.4 Rent
```
GET    /rent/records               [Admin]
POST   /rent/records                [Admin]  generate monthly rent record(s)
GET    /rent/records/:id
PATCH  /rent/records/:id            [Admin]  status, late fee override
GET    /tenants/:id/rent-history    [Tenant self]/[Admin]
```

### 6.5 Electricity
```
GET    /electricity/bills          [Admin]
POST   /electricity/bills           [Admin]  enter readings, auto-calculate
GET    /electricity/bills/:id
PATCH  /electricity/bills/:id       [Admin]
```

### 6.6 Bills / PDF
```
POST   /bills/:id/generate-pdf      [Admin]
POST   /bills/:id/send               [Admin]  queue WhatsApp send of PDF
GET    /bills/:id/pdf                signed URL
```

### 6.7 Payments
```
GET    /payments                    [Admin]
POST   /payments                    [Tenant]  submit payment + screenshot
PATCH  /payments/:id/verify          [Admin]  approve/reject
GET    /payments/:id
```

### 6.8 Complaints
```
GET    /complaints                  [Admin]
POST   /complaints                  [Tenant]
GET    /complaints/:id
PATCH  /complaints/:id               [Admin]  status, assignee, resolution note
POST   /complaints/:id/comments     [Admin]/[Tenant]
```

### 6.9 Assets
```
GET    /rooms/:id/assets            [Admin]
POST   /rooms/:id/assets            [Admin]
PATCH  /assets/:id                  [Admin]
DELETE /assets/:id                  [Admin]
```

### 6.10 Move-In / Move-Out
```
POST   /tenants/:id/move-in          [Admin]
POST   /tenants/:id/move-out         [Admin]  triggers final bill + deposit settlement flow
GET    /tenants/:id/move-out-summary [Admin]
```

### 6.11 Reports
```
GET    /reports/rent                [Admin]  ?range=&roomId=&tenantId=
GET    /reports/electricity         [Admin]
GET    /reports/revenue             [Admin]
GET    /reports/export              [Admin]  ?format=pdf|csv
```

### 6.12 Notifications
```
GET    /notifications               [Admin]/[Tenant]
PATCH  /notifications/:id/read
```

### 6.13 Audit Log
```
GET    /audit-log                    [Admin]  ?actor=&action=&range=
```

### 6.14 WhatsApp
```
GET    /whatsapp/status              [Admin]  connected|disconnected|pairing
POST   /whatsapp/connect             [Admin]  initiates session, returns QR payload
GET    /whatsapp/qr                  [Admin]  QR image/data for the settings screen (poll or websocket)
POST   /whatsapp/disconnect          [Admin]
GET    /whatsapp/message-log         [Admin]
```

### 6.15 Contacts / Wi-Fi / Settings
```
GET    /contacts                    [Admin]/[Tenant read-only]
POST   /contacts                    [Admin]
PATCH  /contacts/:id                 [Admin]
GET    /settings/wifi               [Admin]/[Tenant]
PATCH  /settings/wifi                [Admin]
GET    /settings/reminders          [Admin]
PATCH  /settings/reminders           [Admin]
```

Any new endpoint added during the build must be appended to this section — this file stays the single consolidated list, don't let endpoints live only in code comments.

---

## 7. Agent Roles

| Role | Responsibility | Owns |
|---|---|---|
| **Solution Architect** | Owns this document, the schema, the folder structure, and the Memory Map integrity. Reviews every module's Section-4-Step-5 memory update. | `/docs/architecture.md`, migrations review |
| **Backend Engineer** | Express/TypeScript API, service layer, validation, RLS-aware query patterns | `/server/src/*` |
| **Frontend Engineer (Admin)** | Admin dashboard, all admin-facing screens listed in Section 6 | `/web/admin/*` |
| **Frontend Engineer (Tenant)** | Tenant portal screens | `/web/tenant/*` |
| **Integration Engineer (WhatsApp/Queue)** | Baileys microservice, BullMQ workers, message templates, retry/backoff logic | `/services/whatsapp/*`, `/services/queue/*` |
| **PDF/Reports Engineer** | Bill/report PDF templates and generation pipeline | `/services/pdf/*` |
| **Security Reviewer** | Audits RLS policies, JWT flow, file upload handling, input validation before each phase closes | `/docs/security-review-*.md` |
| **QA / Reliability** | Test plans per module, edge cases (bed reassignment races, duplicate payment submissions, queue retry storms) | `/tests/*` |

One agent can hold multiple roles for a solo/small build, but each role's checklist must still be run — don't skip Security Reviewer or QA steps because the same agent wrote the feature.

---

## 8. Memory Map Protocol (Mandatory — Graphify)

**Problem this solves:** if an agent is swapped or a module is modified later, it should not need to re-read/re-analyze the entire codebase to understand what exists and how pieces connect.

**Mechanism:** Maintain a **Graphify-based memory map** — a graph of nodes (modules/services/tables/endpoints) and edges (dependencies/calls) that is updated as part of every change, not reconstructed from scratch.

Rules:
1. The memory map lives at `/docs/memory-map/` — one graph file (Graphify project/export) plus per-node markdown summaries in `/docs/memory-map/nodes/<node-name>.md`.
2. Each node file records: what it does, its public interface (endpoints/exported functions/DB tables touched), what it depends on, what depends on it, last-updated date, and open TODOs.
3. Before modifying any module, an agent reads **only that module's node file and its direct dependency edges** — not the whole codebase — to get sufficient context.
4. After modifying a module, the agent updates that node's file and re-links any changed edges in the graph, in the same work session (this is Step 5 of the Loop Engineering Protocol, Section 4).
5. The Solution Architect role periodically spot-checks that the graph matches reality (drift check) — if code and map disagree, the map loses and must be corrected immediately, not deferred.

Goal: a targeted edit to, say, the Complaints module should only require reading `complaints.md` and the 2–3 nodes it touches (tenants, notifications) — never the rent, electricity, or WhatsApp subsystems.

---

## 9. Auth / Session Rules

- JWT-based sessions via Supabase Auth, issued once at login.
- **Single login persists** — access token refresh must happen silently via refresh token rotation (httpOnly cookie or secure storage, agent's choice documented in `/docs/architecture.md`), so the user is not repeatedly prompted to log in on the same device.
- Session must remain valid across app restarts until explicit logout or refresh-token expiry (set a long but bounded refresh token lifetime — document the value chosen).
- WhatsApp connection state is **independent of the admin's login session** — once an admin pairs WhatsApp (Section 10), that session persists on the backend/microservice regardless of which device the admin is currently logged in from, and regardless of admin JWT refreshes. Logging in from a new device must show WhatsApp as already connected, not prompt re-pairing.
- Tenant and Admin JWTs carry role + scoped ID claims; every protected route checks role and scope server-side, never trusts client-side route guarding alone.

---

## 10. WhatsApp Integration Detail

### 10.1 Connect/Disconnect Flow (Settings screen)
- Admin Settings → WhatsApp section shows: current status (Connected / Disconnected / Pairing), a **Connect** button (shows QR code to scan when clicked), and a **Disconnect** button (visible only when connected).
- QR flow: `POST /whatsapp/connect` starts a Baileys session in the microservice; frontend polls or subscribes (`GET /whatsapp/qr` or a websocket/SSE channel) until a QR payload is available, renders it, and transitions to "Connected" once Baileys reports an authenticated session.
- `POST /whatsapp/disconnect` tears down the Baileys session and clears stored credentials for that PG/admin.
- Session credentials (Baileys auth state) are persisted server-side (encrypted at rest) so a server restart doesn't force re-pairing — this is what makes the connection durable across admin devices/logins.

### 10.2 Risk Note
Baileys automates a personal WhatsApp account and carries account-restriction risk if messaged at high volume. Keep this documented in `/docs/architecture.md` as a known tradeoff; evaluate the official WhatsApp Business Platform API before scaling beyond a single-PG prototype.

### 10.3 Message Queue
All outbound WhatsApp messages (reminders, bills, receipts, complaint updates, announcements) go through BullMQ, with:
- Randomized/staggered delay between messages (never a synchronous batch blast).
- Retry with backoff on failure.
- Message status tracking (`queued`, `sent`, `failed`, `retrying`) visible in `/whatsapp/message-log`.
- Templates centralized per Section 3's Do's list.

---

## 11. UI/UX Requirements

- **No dark theme.** Light, clean, high-contrast, readable interface as the only theme — don't build a theme toggle unless separately requested.
- Clear information hierarchy on the admin dashboard (Section on original concept: room/tenant/rent/electricity/complaint summary cards, recent activity, upcoming dues).
- Use an icon library (e.g. lucide-react) for all iconography — never emoji, in UI copy or in code/comments/logs.
- Data-dense tables (rooms, tenants, payments) must be sortable/filterable per Section 6/25 requirements, with clear empty and loading states.
- Forms (tenant registration, complaint creation, payment submission) use React Hook Form with inline validation errors, not silent failures.

---

## 12. Security Requirements

- **AuthN/AuthZ:** Supabase Auth + JWT, role-based access control enforced server-side on every route (Section 9).
- **RLS everywhere** tenant data lives (Section 5) — this is the primary tenant-isolation boundary, not just app-layer checks; both layers must agree.
- **Input validation:** Zod schemas at every API boundary; reject unknown fields.
- **Injection protection:** parameterized queries only; no raw SQL string building from user input.
- **File upload safety:** validate MIME type and size server-side before storing in Supabase Storage; never trust client-declared content type; scan filenames for path traversal; store under generated IDs, not user-supplied filenames.
- **Rate limiting:** on auth endpoints and payment-screenshot submission at minimum, to blunt brute-force and abuse.
- **Secrets management:** all keys (Supabase service role key, JWT secret, Redis URL, Baileys session encryption key) in environment variables, never committed.
- **Transport security:** HTTPS everywhere in any deployed environment.
- **Audit logging:** every admin mutating action logged with actor, action, timestamp, affected record (Section 6.13).
- **Signed URLs, short expiry:** for all document/PDF/screenshot access — never permanent public links.
- **CSRF/XSS:** sanitize any user-supplied text rendered in the UI (complaint text, resolution notes); use React's default escaping, avoid `dangerouslySetInnerHTML` except for the PDF template pipeline, which is server-side and template-controlled, not user-input-controlled.
- **Dependency hygiene:** lockfile committed, periodic `npm audit` pass noted in QA checklist.

---

## 13. Phased Build Order

**Phase 1 (MVP — build this first, in this order):**
1. Auth (admin + tenant), core schema + RLS
2. Rooms + Beds
3. Tenants (incl. document upload, self-registration link)
4. Rent records + manual status management
5. Electricity billing (manual entry + calculation)
6. PDF bill generation
7. Payment submission + verification
8. Complaints
9. Tenant dashboard (dues, history, Wi-Fi, contacts)
10. Notification center + audit log
11. Reports (rent/electricity/revenue) + export
12. WhatsApp integration (connect/disconnect, queue, reminders, bill send) — built last in Phase 1 so the core system is fully functional independent of it, per Section 1

**Phase 2 (after MVP is stable):**
Online/UPI rent payment, automatic payment confirmation, digital receipts, digital agreements + e-signature, visitor management, Supabase Realtime notification center.

**Phase 3:**
Multi-PG/multi-building support, staff/accountant logins, advanced analytics, mobile app.

Do not pull Phase 2/3 items forward without updating this section.

---

## 14. Definition of Done (per module)

A module is done only when:
- Endpoints match Section 6 (or Section 6 has been updated to match reality).
- RLS policies exist and were tested with both roles.
- No emoji, no dark-theme styling, no `any` leakage, no hardcoded secrets.
- Memory map node file written/updated (Section 8).
- Basic QA pass noted (happy path + at least one edge case) in `/tests/`.
- Audit logging added for any admin mutation introduced.
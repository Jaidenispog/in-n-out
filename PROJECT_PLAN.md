# In N Out — Project Plan

A mobile-first staff app that replaces the `RETURN SHEET DATA.xlsx` spreadsheet for a
car-rental / insurance-repair business. Staff record customer cars coming **in** for
repair, company/loan cars going **out**, and cars being **returned**, plus bookings,
availability, before/after photos, and a full who-did-what audit trail.

## Tech stack

| Concern | Choice | Why |
| --- | --- | --- |
| UI | React 19 + React Router 7 | Component model, client routing for a PWA |
| Language | TypeScript (strict) | Row types mirror the DB; catches mistakes at build |
| Build/dev | Vite 8 | Fast dev server + optimised production build |
| Styling | Tailwind CSS 4 (custom iOS theme in `src/index.css`) | Apple-style look, consistent tokens |
| Backend | Supabase (Postgres + Auth + Storage) — free tier | Auth, database, private photo storage in one free service |
| Offline/install | `vite-plugin-pwa` (Workbox) | Add-to-Home-Screen, app shell caching, no App Store needed |
| Spreadsheet import | `xlsx` (Node script) | One-off + repeatable import of the legacy workbook |
| Hosting | Vercel / Netlify / Cloudflare Pages — free tier | Static hosting of `dist/` with SPA rewrites |

Everything runs on free tiers. No Apple Developer Program is required for V1 (it's a PWA);
the same code can later be wrapped with Capacitor for TestFlight without a rewrite.

## Architecture

- **`src/lib/`** — the whole data layer. `supabase.ts` (client + `supabaseReady` gate),
  `db.ts` (every read/write; screens never call Supabase directly), `types.ts` (row shapes
  matching the schema), `utils.ts` (rego/phone normalisation, date/time, status labels/tones),
  `photos.ts` (upload to the private bucket + signed URLs).
- **`src/pages/`** — the screens: Login, Dashboard, NewMovement (car in/out), ReturnCar,
  Availability (cars + status), Bookings, SearchPage, RecordDetail (view/edit + history),
  ImportReview, Settings.
- **`src/components/`** — UI kit (`ui.tsx`), app shell / bottom tab bar (`AppShell.tsx`),
  list cards (`cards.tsx`), photo picker.
- **`src/auth/`** — `AuthContext` (email/password session + staff profile).
- **`supabase/schema.sql`** — tables, indexes, audit triggers, Row-Level Security, the
  private `photos` storage bucket. Idempotent (safe to re-run).
- **`scripts/`** — `import.mjs` + `import-lib.mjs` (spreadsheet import), `create-staff.mjs`
  (bulk staff logins), `make-icons.mjs` (PWA icons).

### Data model (tables)
`staff_users`, `customers`, `vehicles`, `vehicle_movements` (Sheet22 in/out),
`vehicle_returns` (Car return Sheet), `bookings`, `photos`, `audit_logs`, `raw_import_rows`
(every original spreadsheet row kept verbatim). Every business row carries `created_by`,
`updated_by`, `created_at`, `updated_at`; changes are captured with before/after JSON by an
audit trigger.

### Security model
- Auth = Supabase email/password. No in-app signup — staff accounts are created by an admin
  (dashboard or `scripts/create-staff.mjs`); a trigger auto-creates each `staff_users` profile.
- All 15 staff share one access level (any staff member can add/edit/update). Row-Level
  Security lets any authenticated staff read/write business tables; every write is audit-logged.
- Photos live in a **private** bucket, read via short-lived signed URLs.
- The `service_role` key is used **only** by local scripts (import / create-staff) and is never
  shipped to the frontend or the host.

## Build phases

- **Done (V1):** full schema + RLS + audit; all screens; car in/out, return, bookings (with
  override-able double-booking check), search, availability, photos, import review, settings
  (name, team, CSV export); defensive spreadsheet importer (dry-run + full-reset `--force`);
  PWA manifest + service worker; SPA deploy rewrites.
- **This iteration:** stand up a live Supabase project; import the real spreadsheet; verify
  every workflow end-to-end; small correctness fixes (booking-status wording, free a car when
  its booking is cancelled, dashboard "returned today" accuracy); staff bulk-create script;
  planning docs; Star365 review; deploy.

## MVP scope (what "done" means)
Runs locally with no errors; staff log in; create a car in/out record; record a return; search
by name / phone / rego; view availability; create + view bookings; attach before/after photos;
records track who created/edited them; the importer loads only `Sheet22` + `Car return Sheet`;
UI is mobile-first and Apple-style; setup/import/env are documented.

## Future scope (not in V1)
Per-role permissions; Star365 sync (see `STAR365_FINDINGS.md`); a `no_show`/`confirmed` booking
state if the office needs them; DB-level (GiST) hard block on overlapping bookings; offline photo
queue; Capacitor/TestFlight native build; richer reporting.

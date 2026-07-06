# In N Out — staff car movement app

Mobile-first PWA that replaces the `RETURN SHEET DATA.xlsx` spreadsheet. Staff log in on their
iPhones, record cars coming in / going out / being returned, take before & after photos, book cars,
and search everything. Every edit records who did it.

**Everything runs on free tiers.** No Apple Developer Program needed — staff install it from Safari
via *Share → Add to Home Screen*.

## 1. Create the free Supabase project (one-time, ~10 minutes)

1. Sign up at [supabase.com](https://supabase.com) (free) → **New project** (pick a region near
   Melbourne, e.g. Sydney; set a strong database password and keep it somewhere safe).
2. In the dashboard: **SQL Editor → New query**, paste the whole contents of
   [`supabase/schema.sql`](supabase/schema.sql), press **Run**. This creates all tables, the audit
   log, security rules, and the private photo bucket.
3. **Authentication → Sign In / Up → Email**: turn **off** "Allow new users to sign up"
   (staff accounts are created by you, next step) and turn **off** "Confirm email"
   (so accounts work instantly).
4. **Authentication → Users → Add user → Create new user**: create one account per staff member
   (email + password). ~15 accounts. They can be any email you choose.
   - Optional: set each person's display name later in the app (Settings → your name).
5. **Project Settings → API**: copy the **Project URL**, the **anon public** key, and the
   **service_role** key (keep service_role secret — it bypasses security and is only used by the
   import script on your computer).

## 2. Configure and import the spreadsheet

```bash
cd in-n-out
npm install
cp .env.example .env      # then edit .env with the three values from step 1.5
```

Dry run first (touches nothing, writes a report to `import-output/`):

```bash
npm run import:dry -- "/path/to/RETURN SHEET DATA.xlsx"
```

Then the real import:

```bash
npm run import -- "/path/to/RETURN SHEET DATA.xlsx"
```

- Only `Sheet22` and `Car return Sheet` are read; every other sheet is ignored.
- Every original row is preserved in `raw_import_rows`, even the messy ones.
- Unreadable dates / missing regos are flagged and appear in the app under **Import review**.
- Recent movements that look like a car might still be out are marked *active — please confirm*.
- Re-running is blocked unless you pass `--force` (which replaces previously **imported** records
  but keeps everything staff created in the app).

## 3. Run it

```bash
npm run dev        # local development
npm run build      # production build (output in dist/)
```

## 4. Deploy free + install on iPhones

Any free static host works. Easiest is [Vercel](https://vercel.com) (free Hobby plan):

1. Push this folder to a GitHub repo → vercel.com → **Import project**.
2. Framework preset: **Vite**. Add the two env vars `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY` (the anon key is safe in the frontend — Row Level Security protects the
   data; never put the service_role key here).
3. Deploy → you get `https://your-app.vercel.app`.
4. On each iPhone: open that URL **in Safari** → Share → **Add to Home Screen**. It opens
   full-screen with the app icon, like a native app.

Netlify or Cloudflare Pages work the same way (build command `npm run build`, output `dist`).

Deep-link routing is already handled: `vercel.json` rewrites all paths to the app (for Vercel),
and `public/_redirects` does the same for Netlify and Cloudflare Pages — so refreshing on
`/bookings` or opening a shared record link won't 404.

## Honest cost notes

- **TestFlight / App Store are NOT free** — they require the Apple Developer Program
  (US$99/year). That's why V1 is a PWA. If you join the program later, this same app can be
  wrapped with Capacitor and shipped to TestFlight without a rewrite.
- **Supabase free tier**: 500 MB database + 1 GB file storage — years of records, and roughly
  5,000–10,000 compressed photos. One caveat: free projects **pause after ~1 week with zero
  traffic**; daily staff use keeps it alive, and unpausing is one click in the dashboard.
- Vercel/Netlify/Cloudflare free tiers are more than enough for 15 staff.

## Project structure

```
supabase/schema.sql    — full database schema: tables, audit triggers, RLS, storage policies
scripts/import.mjs     — spreadsheet import CLI (dry-run + live)
scripts/import-lib.mjs — defensive parsers (dates, times, regos, phones, purposes)
scripts/make-icons.mjs — regenerates the PNG app icons
src/lib/               — types, supabase client, data access (db.ts), photo upload
src/components/        — UI kit, app shell (tab bar), photo picker, list cards
src/pages/             — the 10 screens
src/auth/              — login session + staff profile
```

## Day-to-day

- **New movement** (+ button): customer car in, our car out, purpose, before photos. Warns if the
  outgoing car is already out or booked — staff can override.
- **Record return** (+ button): rego auto-matches the active movement, closes it, frees the car.
- **Cars**: live availability with status badges and search.
- **Bookings**: create/cancel bookings, overdue highlighting, one tap converts a booking into a
  movement when the car actually goes out.
- **Search**: rego, name, mobile, purpose — across everything, including the imported history.
- **Import review**: the messy spreadsheet rows that need a quick human check.
- **Settings**: your name, team list, CSV export of every table, sign out.

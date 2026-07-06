import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// The project URL + anon key are safe to ship in the client build: the anon key is
// public by design (it goes to every browser) and every request is gated by Row
// Level Security — see supabase/schema.sql. Committing them lets the hosted build
// work without depending on host env vars. VITE_SUPABASE_* still override these
// (e.g. to point a fork at a different project). The service_role secret is NEVER
// here — it lives only in .env, used by the local import/staff scripts.
const DEFAULT_URL = 'https://ssxxihvcaquidhuzcxzt.supabase.co'
const DEFAULT_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNzeHhpaHZjYXF1aWRodXpjeHp0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMzMDUxMTksImV4cCI6MjA5ODg4MTExOX0.GN7_oDn4gpU8ysL1E2O1HCD6pOD4BqNOkAf-O_igx14'

// Use the committed values directly. We deliberately DO NOT read VITE_SUPABASE_*
// from the host env here: a *masked* key (the "••••" the Supabase dashboard shows)
// accidentally pasted into a Vercel env var would otherwise override these and inject
// a non-ASCII bullet (U+2022) into request headers — which throws
// "String contains non ISO-8859-1 code point" and blocks every request.
const url = DEFAULT_URL
const anonKey = DEFAULT_ANON_KEY

// Always configured now (defaults above), but keep the flag so the setup screen
// still works if someone deliberately blanks the values.
export const supabaseReady = Boolean(url && anonKey)

export const supabase: SupabaseClient = createClient(url, anonKey)

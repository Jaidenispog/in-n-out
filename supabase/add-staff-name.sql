-- One-time schema additions for In N Out. Run once in the Supabase dashboard →
-- SQL Editor → New query → Run. Safe to re-run (uses "if not exists"; existing
-- rows default to ''). Covers three features:
--   1) staff_name  — attribute an entry to the person who made it (shared login)
--   2) owner_name / owner_phone on movements — who fines & charges go to (not the driver)

alter table public.vehicle_movements
  add column if not exists staff_name text not null default '';

alter table public.vehicle_returns
  add column if not exists staff_name text not null default '';

alter table public.vehicle_movements
  add column if not exists owner_name text not null default '';

alter table public.vehicle_movements
  add column if not exists owner_phone text not null default '';

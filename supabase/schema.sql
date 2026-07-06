-- In N Out — full database schema for Supabase (Postgres)
-- Run this once in the Supabase SQL Editor (Dashboard → SQL Editor → New query → paste → Run).
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE everywhere.

-- ============================================================
-- 1. TABLES
-- ============================================================

-- One profile row per Supabase auth user (created automatically on signup).
create table if not exists public.staff_users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text not null default '',
  role text not null default 'staff',
  created_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  driver_name text not null default '',
  mobile_number text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  rego text not null unique, -- normalized: trimmed, uppercased
  rego_raw text not null default '',
  make text not null default '',
  model text not null default '',
  vehicle_type text not null default '',
  status text not null default 'unknown'
    check (status in ('available', 'out', 'booked', 'repair', 'unknown')),
  is_company_car boolean not null default false,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Sheet22 workflow: customer car comes IN, company car goes OUT.
create table if not exists public.vehicle_movements (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid references public.customers (id) on delete set null,
  driver_name text not null default '',
  driver_phone text not null default '',
  cars_in_rego text not null default '',      -- normalized customer car rego
  cars_in_rego_raw text not null default '',
  cars_out_vehicle_id uuid references public.vehicles (id) on delete set null,
  cars_out_rego text not null default '',     -- normalized company car rego
  cars_out_rego_raw text not null default '',
  rego_raw text not null default '',          -- Sheet22 "REGO" column, as-is
  make_raw text not null default '',
  purpose text not null default '',           -- canonical: RENT/COURTESY/REPAIRS/TOWED/SWAP/PICKUP/RETURN/OTHER
  purpose_raw text not null default '',
  moved_at timestamptz,                       -- best-effort combined date+time
  movement_date date,
  movement_time text not null default '',
  status text not null default 'active'
    check (status in ('active', 'returned', 'closed')),
  needs_review boolean not null default false,
  review_reason text not null default '',
  client_details_raw text not null default '',
  driver_collecting_raw text not null default '',
  signed_off text not null default '',
  notes text not null default '',
  source_sheet text not null default '',
  source_row integer,
  created_by uuid references public.staff_users (id) on delete set null,
  updated_by uuid references public.staff_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Car return Sheet workflow: customer brings the company car back.
create table if not exists public.vehicle_returns (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid references public.vehicle_movements (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  returned_vehicle_id uuid references public.vehicles (id) on delete set null,
  returned_rego text not null default '',     -- normalized
  returned_rego_raw text not null default '',
  driver_name text not null default '',
  driver_name_raw text not null default '',
  mobile_number text not null default '',
  mobile_number_raw text not null default '',
  returned_at timestamptz,
  return_date date,
  return_time text not null default '',
  bond_status text not null default '',
  notes text not null default '',
  needs_review boolean not null default false,
  review_reason text not null default '',
  source_sheet text not null default '',
  source_row integer,
  created_by uuid references public.staff_users (id) on delete set null,
  updated_by uuid references public.staff_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  vehicle_rego text not null default '',      -- normalized, kept even if vehicle row missing
  customer_id uuid references public.customers (id) on delete set null,
  booking_name text not null default '',
  booking_mobile text not null default '',
  start_at timestamptz not null,
  expected_return_at timestamptz,
  purpose text not null default '',
  status text not null default 'booked'
    check (status in ('booked', 'active', 'completed', 'cancelled')),
  notes text not null default '',
  created_by uuid references public.staff_users (id) on delete set null,
  updated_by uuid references public.staff_users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid references public.vehicles (id) on delete set null,
  movement_id uuid references public.vehicle_movements (id) on delete cascade,
  return_id uuid references public.vehicle_returns (id) on delete cascade,
  booking_id uuid references public.bookings (id) on delete cascade,
  photo_type text not null default 'other'
    check (photo_type in ('before_handover', 'after_return', 'damage', 'odometer', 'fuel', 'other')),
  storage_path text not null,
  notes text not null default '',
  uploaded_by uuid references public.staff_users (id) on delete set null,
  uploaded_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  staff_user_id uuid,
  action text not null,
  table_name text not null,
  record_id text not null default '',
  before_json jsonb,
  after_json jsonb,
  created_at timestamptz not null default now()
);

-- Every original spreadsheet row, untouched, so nothing is ever lost.
create table if not exists public.raw_import_rows (
  id uuid primary key default gen_random_uuid(),
  source_sheet text not null,
  source_row integer not null,
  raw_json jsonb not null,
  imported_at timestamptz not null default now(),
  linked_table text not null default '',
  linked_record_id uuid
);

-- ============================================================
-- 2. INDEXES
-- ============================================================

create index if not exists idx_vehicles_rego on public.vehicles (rego);
create index if not exists idx_vehicles_status on public.vehicles (status);
create index if not exists idx_movements_cars_in on public.vehicle_movements (cars_in_rego);
create index if not exists idx_movements_cars_out on public.vehicle_movements (cars_out_rego);
create index if not exists idx_movements_status on public.vehicle_movements (status);
create index if not exists idx_movements_moved_at on public.vehicle_movements (moved_at desc);
create index if not exists idx_movements_review on public.vehicle_movements (needs_review) where needs_review;
create index if not exists idx_returns_rego on public.vehicle_returns (returned_rego);
create index if not exists idx_returns_returned_at on public.vehicle_returns (returned_at desc);
create index if not exists idx_returns_review on public.vehicle_returns (needs_review) where needs_review;
create index if not exists idx_bookings_vehicle on public.bookings (vehicle_rego, status);
create index if not exists idx_bookings_start on public.bookings (start_at);
create index if not exists idx_photos_movement on public.photos (movement_id);
create index if not exists idx_photos_return on public.photos (return_id);
create index if not exists idx_audit_record on public.audit_logs (table_name, record_id);
create index if not exists idx_customers_name on public.customers (driver_name);

-- ============================================================
-- 3. TRIGGERS — profile autocreate, updated_at, audit log
-- ============================================================

-- Auto-create a staff profile whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.staff_users (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Generic audit trigger: writes who did what, with before/after snapshots.
create or replace function public.write_audit_log()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  rec_id text;
begin
  if tg_op = 'DELETE' then
    rec_id := old.id::text;
  else
    rec_id := new.id::text;
  end if;
  insert into public.audit_logs (staff_user_id, action, table_name, record_id, before_json, after_json)
  values (
    auth.uid(),
    lower(tg_op),
    tg_table_name,
    rec_id,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['customers', 'vehicles', 'vehicle_movements', 'vehicle_returns', 'bookings', 'photos']
  loop
    execute format('drop trigger if exists trg_audit on public.%I', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function public.write_audit_log()', t);
    if t <> 'photos' then
      execute format('drop trigger if exists trg_updated_at on public.%I', t);
      execute format('create trigger trg_updated_at before update on public.%I for each row execute function public.set_updated_at()', t);
    end if;
  end loop;
end;
$$;

-- ============================================================
-- 4. ROW LEVEL SECURITY — logged-in staff only, service role for import
-- ============================================================

alter table public.staff_users enable row level security;
alter table public.customers enable row level security;
alter table public.vehicles enable row level security;
alter table public.vehicle_movements enable row level security;
alter table public.vehicle_returns enable row level security;
alter table public.bookings enable row level security;
alter table public.photos enable row level security;
alter table public.audit_logs enable row level security;
alter table public.raw_import_rows enable row level security;

-- Staff profiles: everyone logged in can see the team; you can edit your own name.
drop policy if exists staff_select on public.staff_users;
create policy staff_select on public.staff_users for select to authenticated using (true);
drop policy if exists staff_update_own on public.staff_users;
create policy staff_update_own on public.staff_users for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- Business tables: every logged-in staff member can read and write (edits are audit-logged).
do $$
declare
  t text;
begin
  foreach t in array array['customers', 'vehicles', 'vehicle_movements', 'vehicle_returns', 'bookings', 'photos']
  loop
    execute format('drop policy if exists rw_select on public.%I', t);
    execute format('create policy rw_select on public.%I for select to authenticated using (true)', t);
    execute format('drop policy if exists rw_insert on public.%I', t);
    execute format('create policy rw_insert on public.%I for insert to authenticated with check (true)', t);
    execute format('drop policy if exists rw_update on public.%I', t);
    execute format('create policy rw_update on public.%I for update to authenticated using (true) with check (true)', t);
    execute format('drop policy if exists rw_delete on public.%I', t);
    execute format('create policy rw_delete on public.%I for delete to authenticated using (true)', t);
  end loop;
end;
$$;

-- Audit log: staff can read history; only triggers (security definer) write it.
drop policy if exists audit_select on public.audit_logs;
create policy audit_select on public.audit_logs for select to authenticated using (true);

-- Raw import rows: readable by staff; written only by the import script (service role).
drop policy if exists raw_select on public.raw_import_rows;
create policy raw_select on public.raw_import_rows for select to authenticated using (true);

-- ============================================================
-- 5. STORAGE — private photos bucket
-- ============================================================

insert into storage.buckets (id, name, public)
values ('photos', 'photos', false)
on conflict (id) do nothing;

drop policy if exists photos_select on storage.objects;
create policy photos_select on storage.objects for select to authenticated
  using (bucket_id = 'photos');
drop policy if exists photos_insert on storage.objects;
create policy photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'photos');
drop policy if exists photos_update on storage.objects;
create policy photos_update on storage.objects for update to authenticated
  using (bucket_id = 'photos');
drop policy if exists photos_delete on storage.objects;
create policy photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'photos');

-- ============================================================
-- 6. BACKFILL — profiles for any staff created before this ran
-- ============================================================
-- The on_auth_user_created trigger only fires for NEW signups. If you created
-- staff accounts before running this file, this gives them a profile row so
-- their created_by / updated_by references resolve. Safe to re-run.
insert into public.staff_users (id, email, full_name)
select id, coalesce(email, ''), coalesce(raw_user_meta_data ->> 'full_name', '')
from auth.users
on conflict (id) do nothing;

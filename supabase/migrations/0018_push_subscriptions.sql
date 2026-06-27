-- 0018_push_subscriptions.sql
-- Web Push subscriptions, one row per device/endpoint per user.

create table push_subscriptions (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users (id) on delete cascade,
  subscription jsonb       not null,
  created_at   timestamptz not null default now(),
  unique (user_id, subscription)
);

create index push_subscriptions_user_id_idx on push_subscriptions (user_id);

-- ── RLS: a user may only read/insert/delete their own subscriptions ───────────
alter table push_subscriptions enable row level security;

grant select, insert, delete on push_subscriptions to authenticated;

create policy "push_subscriptions select own"
  on push_subscriptions for select to authenticated
  using (auth.uid() = user_id);

create policy "push_subscriptions insert own"
  on push_subscriptions for insert to authenticated
  with check (auth.uid() = user_id);

create policy "push_subscriptions delete own"
  on push_subscriptions for delete to authenticated
  using (auth.uid() = user_id);

-- ── Server-side push delivery uses the service-role client (no user session in
--    cron / on the public share page). RLS doesn't apply to service_role, but
--    this project lacks Supabase's default grants, so grant them explicitly.
grant select, delete on push_subscriptions to service_role;

-- 1. Enable RLS on all three tables.
--    Without this, Supabase's Data API blocks all access regardless of grants.
alter table artists       enable row level security;
alter table shows         enable row level security;
alter table notifications enable row level security;

-- 2. Grant schema usage and table privileges to the API roles.
--    The Data API runs as "anon" (unauthenticated requests) or "authenticated"
--    (requests with a valid JWT). Both need USAGE on the schema to see it at
--    all, and explicit DML grants to read/write rows.
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on artists       to anon, authenticated;
grant select, insert, update, delete on shows         to anon, authenticated;
grant select, insert, update, delete on notifications to anon, authenticated;

-- 3. Permissive RLS policies — full access for single-user personal app.
--    RLS evaluates policies even when a role has table-level grants, so we
--    need at least one permissive policy per operation or every row is hidden.
--    "using (true)" means "all rows pass the check"; "with check (true)"
--    means "all writes are allowed".

create policy "allow all for anon"          on artists       for all to anon, authenticated using (true) with check (true);
create policy "allow all for anon"          on shows         for all to anon, authenticated using (true) with check (true);
create policy "allow all for anon"          on notifications for all to anon, authenticated using (true) with check (true);

-- 0017_festivals_service_role_grants.sql
-- The public /festivals/share/[userId] page reads with the service-role client
-- (RLS bypassed) because the visitor is anonymous. Earlier migrations granted
-- DML only to anon/authenticated (see 0004_festivals.sql, 0007_festival_joins.sql),
-- and this project doesn't have Supabase's default service_role privileges, so
-- the service-role client hit "permission denied for table festivals" /
-- "festival_joins" despite using a valid service_role JWT.
--
-- Grant service_role the same DML it needs: SELECT on festivals, and
-- SELECT/INSERT/DELETE on festival_joins (the share + join flow). RLS does not
-- apply to service_role, so no policies are needed here.

grant select on festivals to service_role;

grant select, insert, update, delete on festival_joins to service_role;

-- 0019_user_artists_service_role_grant.sql
-- Push notifications: when the scraper inserts a new show it must notify every
-- user who follows that artist. The scraper/cron has no user session, so it
-- reads `user_artists` (artist → followers) with the service-role client. RLS
-- doesn't apply to service_role, but 0015 only granted user_artists to
-- `authenticated`, so grant read access explicitly (mirrors 0017's fix).

grant select on user_artists to service_role;

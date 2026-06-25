-- 0012_vriendenboekje_seksstandje.sql
-- Re-activate the `seksstandje` question in the form. The column already exists
-- (added NOT NULL in 0008, made nullable in 0009, kept dormant in 0011), so this
-- ADD COLUMN IF NOT EXISTS is idempotent and effectively a no-op — included only
-- to keep a complete, self-describing migration trail.
alter table vriendenboekjes
  add column if not exists seksstandje text;

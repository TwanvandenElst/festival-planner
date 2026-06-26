-- 0013_vriendenboekje_reactions_delete.sql
-- Allow toggling a 😂 reaction off: grant anon DELETE on the reactions table so a
-- visitor can remove a reaction they added (the client stores the row id and
-- deletes that exact row).
--
-- NOTE (access control): with `using (true)` ANY visitor can delete ANY reaction
-- row, not just their own — there is no per-user identity on these rows. Reactions
-- are low-value and easily re-added, so this is an acceptable trade-off for the
-- toggle UX. If that's not acceptable, scope this down later (e.g. add a
-- client-generated device/token column and restrict the policy to matching rows).

grant delete on vriendenboekje_reactions to anon, authenticated;

create policy "anon delete vriendenboekje_reactions"
  on vriendenboekje_reactions for delete
  to anon, authenticated
  using (true);

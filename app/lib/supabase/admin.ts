import { createClient } from '@supabase/supabase-js'

/**
 * Service-role Supabase client. BYPASSES Row Level Security — use ONLY in
 * server code (Server Components, Server Actions, Route Handlers) and never
 * import it into a Client Component.
 *
 * The current use is the PUBLIC /festivals/share/[userId] page: an anonymous
 * visitor has no session, so RLS would hide the owner's festivals. This client
 * reads them directly, scoped explicitly by `user_id` in the query.
 *
 * Keep reads read-only and always filter by the target user_id — there is no
 * RLS safety net here.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error(
      'Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.',
    )
  }

  return createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

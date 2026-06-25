// Client-side helpers for 😂 reactions: insert a tap and subscribe to live
// inserts. Uses the anon Supabase client (same key the browser already ships),
// matching the "anon read + insert only" RLS from migration 0010.

import { supabase } from './supabase'

export type ReactionRow = {
  id: string
  entry_id: string
  field_name: string
}

/**
 * Records one 😂 on an answer. Returns the new row id (so the caller can ignore
 * the realtime echo of its own insert), or null if the insert failed.
 */
export async function insertReaction(
  entryId: string,
  fieldName: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('vriendenboekje_reactions')
    .insert({ entry_id: entryId, field_name: fieldName })
    .select('id')
    .single()

  if (error || !data) return null
  return data.id as string
}

/**
 * Subscribes to new reactions across all entries and calls `onInsert` for each.
 * Returns an unsubscribe function. No-ops gracefully if realtime isn't enabled.
 */
export function subscribeToReactions(onInsert: (row: ReactionRow) => void): () => void {
  const channel = supabase
    .channel('vb-reactions')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'vriendenboekje_reactions' },
      payload => onInsert(payload.new as ReactionRow),
    )
    .subscribe()

  return () => {
    void supabase.removeChannel(channel)
  }
}

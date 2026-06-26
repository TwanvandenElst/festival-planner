'use server'

import { revalidatePath } from 'next/cache'

import { createClient } from './supabase/server'

export type Artist = { id: string; name: string; created_at: string }

/** Resolve the server client + the logged-in user in one go. */
async function authed() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return { supabase, user }
}

/**
 * Artists the logged-in user follows (newest follow first). Reads the
 * `user_artists` junction joined to the shared `artists` rows; RLS already
 * scopes the junction to this user.
 */
export async function getFollowedArtists(): Promise<Artist[]> {
  const { supabase, user } = await authed()
  if (!user) return []

  const { data, error } = await supabase
    .from('user_artists')
    .select('created_at, artists(id, name, created_at)')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[artists] getFollowedArtists failed:', error.message)
    return []
  }

  // The artist→junction relation is to-one; normalize whatever shape comes back.
  return (data ?? [])
    .map(row => {
      const a = (row as { artists: Artist | Artist[] | null }).artists
      return Array.isArray(a) ? a[0] : a
    })
    .filter((a): a is Artist => a != null)
}

/**
 * Follow an artist by name. Artists are SHARED data, so we find an existing
 * row (case-insensitive) and reuse it, only creating a new one if none exists,
 * then link it to the user via `user_artists`. Idempotent: re-following is a
 * no-op rather than an error.
 */
export async function followArtist(
  rawName: string,
): Promise<{ ok: true; artist: Artist } | { ok: false; error: string }> {
  const name = rawName.trim()
  if (!name) return { ok: false, error: 'Please enter an artist name.' }

  const { supabase, user } = await authed()
  if (!user) return { ok: false, error: 'Not signed in.' }

  // Find-or-create the shared artist.
  const { data: existing } = await supabase
    .from('artists')
    .select('id, name, created_at')
    .ilike('name', name)
    .limit(1)
    .maybeSingle()

  let artist = existing as Artist | null
  if (!artist) {
    const { data: created, error: insErr } = await supabase
      .from('artists')
      .insert({ name })
      .select('id, name, created_at')
      .single()
    if (insErr || !created) {
      return { ok: false, error: insErr?.message ?? 'Could not create artist.' }
    }
    artist = created as Artist
  }

  // Link to the user. A duplicate (already following) is fine.
  const { error: linkErr } = await supabase
    .from('user_artists')
    .insert({ user_id: user.id, artist_id: artist.id })
  if (linkErr && linkErr.code !== '23505') {
    return { ok: false, error: linkErr.message }
  }

  revalidatePath('/')
  revalidatePath('/shows')
  return { ok: true, artist }
}

/**
 * Unfollow an artist: remove only the user's link. The shared `artists` row and
 * its scraped shows stay (other users may follow it).
 */
export async function unfollowArtist(
  artistId: string,
): Promise<{ ok: boolean; error?: string }> {
  const { supabase, user } = await authed()
  if (!user) return { ok: false, error: 'Not signed in.' }

  const { error } = await supabase
    .from('user_artists')
    .delete()
    .eq('user_id', user.id)
    .eq('artist_id', artistId)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/')
  revalidatePath('/shows')
  return { ok: true }
}

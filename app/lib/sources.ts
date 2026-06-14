// Deterministic colour classes for source badges, so each source site reads as
// a distinct chip. Known sources get a fixed colour; anything else is hashed
// into the palette. Full class strings are written out literally so Tailwind's
// content scanner picks them up.

const PALETTE = [
  'bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  'bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
  'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300',
  'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300',
  'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300',
  'bg-cyan-100 text-cyan-700 dark:bg-cyan-950 dark:text-cyan-300',
] as const

const KNOWN: Record<string, string> = {
  'ra.co': PALETTE[0],
  festileaks: PALETTE[1],
  festivalinfo: PALETTE[2],
}

export function sourceBadgeClass(source: string): string {
  const key = source.toLowerCase().trim()
  if (KNOWN[key]) return KNOWN[key]
  let hash = 0
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

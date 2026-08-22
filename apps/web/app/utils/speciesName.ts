import names from '../lib/dex/species-names.json'

/** Widened from the literal type the JSON import gives it. */
const NAMES: Record<string, string> = names

/**
 * The official English name for a Showdown species id. Species names are
 * identifiers, not copy, and never pass through i18n (design document §3).
 *
 * `toID()` is lossy and no rule reverses it — nothing about `hooh` says where
 * the hyphen in `Ho-Oh` goes — so this is a table lookup. An unknown id comes
 * back unchanged: a raw id on screen says exactly what to regenerate with
 * `pnpm --filter web gen:species-names`, where a guess would be silently
 * wrong.
 */
export function speciesName(id: string): string {
  return NAMES[id] ?? id
}

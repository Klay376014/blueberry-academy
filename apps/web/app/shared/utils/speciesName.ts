import names from '../lib/dex/species-names.json'
import zhHant from '../lib/dex/species-names-zh-hant.json'

/** Widened from the literal type the JSON import gives it. */
const NAMES: Record<string, string> = names

/**
 * The locales a generated name table exists for. A locale that is not in here
 * — one added to `nuxt.config.ts` before its table is generated — reads
 * English rather than nothing.
 */
const LOCALISED: Record<string, Record<string, string>> = { 'zh-TW': zhHant }

/**
 * The official English name for a Showdown species id. This is the name the
 * ids themselves are made of and the one Showdown shows, so it is what every
 * other locale falls back to and what identifies a Pokémon across the two
 * screens — see `speciesDisplayName` for what a reader is shown.
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

/**
 * The name to show a reader of `locale`: the official name in their language
 * where there is one, the English name where there is not, and the raw id
 * where neither table knows the species.
 *
 * Species names do pass through the display layer as of
 * docs/adr/0014-localised-species-names.md — they go through generated tables
 * rather than the locale files, which are for copy.
 */
export function speciesDisplayName(id: string, locale: string): string {
  return LOCALISED[locale]?.[id] ?? speciesName(id)
}

/**
 * How a species icon names itself: the reader's name for it, with the English
 * one kept beside it wherever the two differ.
 *
 * The English name is what Showdown shows, and comparing this timeline against
 * a replay is the thing it is read alongside, so the icon is where it stays
 * reachable rather than being dropped (issue #101).
 */
export function speciesLabel(id: string, locale: string): string {
  const display = speciesDisplayName(id, locale)
  const english = speciesName(id)

  return display === english ? english : `${display} (${english})`
}

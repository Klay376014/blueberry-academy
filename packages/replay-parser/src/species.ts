/**
 * Species and identity normalisation.
 *
 * Signatures are built from base species ids, so a species change mid-battle
 * has to be undone first — otherwise one Pokémon is counted twice. The formes
 * that only exist mid-battle come from Showdown's own data as a generated
 * table; |-mega| carries a base species too, but only Mega sends that line, so
 * it can be a cross-check and never the source. Regional formes are *not*
 * undone: Ninetales-Alola is a different Pokémon from Ninetales, not a state
 * of it — and `Darmanitan-Galar-Zen` reverts to `Darmanitan-Galar`, keeping
 * the region it was registered with.
 */

import { BATTLE_ONLY_FORMES } from './battle-only-formes'

/**
 * Showdown's identifier normalisation: lowercase, non-alphanumerics removed.
 * All identity comparison — usernames included — goes through this.
 */
export function toID(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

/** Reads the species out of a details string such as `Scrafty, L50, F`. */
export function speciesOfDetails(details: string): string {
  return details.split(',')[0]?.trim() ?? ''
}

/**
 * The id a species counts as in a signature, with any in-battle forme change
 * read back to the forme it started as.
 *
 * `registered` is the team the side declared. A few formes have more than one
 * possible origin — Zygarde-Complete is either Zygarde or Zygarde-10%
 * transformed — and the registered team is the only thing that says which.
 * Passing it is optional so that the registered team can itself be normalised
 * before there is one to compare against.
 */
export function baseSpeciesId(species: string, registered: readonly string[] = []): string {
  const id = toID(species)
  const origins = BATTLE_ONLY_FORMES[id]

  // The table is generated, so a forme newer than it falls through to the
  // suffix, which is right for the Megas that make up most of the table.
  if (origins === undefined) return toID(species.replace(/-(?:Mega(?:-[XY])?|Primal)$/, ''))

  return origins.find((origin) => registered.includes(origin)) ?? origins[0] ?? id
}

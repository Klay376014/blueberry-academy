/**
 * Species and identity normalisation.
 *
 * Signatures are built from base species ids, so a species change mid-battle
 * has to be undone first — otherwise one Pokémon is counted twice. Mega
 * evolution and Primal reversion are undone here, from the species name alone:
 * |-mega| carries the base species too, but Primal and the other forme changes
 * send no such line, so it can only ever be a cross-check. Regional formes are
 * *not* undone: Ninetales-Alola is a different Pokémon from Ninetales, not a
 * state of it.
 */

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
 * The id a species counts as in a signature, with the in-battle forme changes
 * undone. Mega and Primal are states of one Pokémon; a regional forme is not.
 */
export function baseSpeciesId(species: string): string {
  return toID(species.replace(/-(?:Mega(?:-[XY])?|Primal)$/, ''))
}

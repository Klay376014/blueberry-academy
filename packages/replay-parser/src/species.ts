/**
 * Species and identity normalisation.
 *
 * Signatures are built from base species ids, so a species change mid-battle
 * has to be undone first — otherwise one Pokémon is counted twice. Mega
 * evolution is undone here; Primal reversion and the other forme changes land
 * with the rest of the forme work in #5. Regional formes are *not* undone:
 * Ninetales-Alola is a different Pokémon from Ninetales, not a state of it.
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

/** The id a species counts as in a signature, with Mega evolution undone. */
export function baseSpeciesId(species: string): string {
  return toID(species.replace(/-Mega(-[XY])?$/, ''))
}

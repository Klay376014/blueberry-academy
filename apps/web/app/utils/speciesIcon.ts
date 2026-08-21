import icons from '../lib/dex/species-icons.json'

/**
 * The generated table. Typed as plain arrays rather than tuples because that
 * is what a JSON import gives back; `speciesIcon` is where the pair becomes a
 * shape with names.
 */
const ICONS: Record<string, number[]> = icons

/** Showdown's sprite sheet, linked rather than stored (battle timeline design document §4). */
export const ICON_SHEET_URL = 'https://play.pokemonshowdown.com/sprites/pokemonicons-sheet.png'

/** One icon on the sheet, in CSS pixels. */
export const ICON_WIDTH = 40
export const ICON_HEIGHT = 30

/** Where one species sits on the sheet, as CSS `background-position` values. */
export interface SpeciesIcon {
  left: number
  top: number
}

/**
 * The icon sheet slot for a Showdown species id, ready to hand to
 * `background-position` -- both values are zero or negative.
 *
 * The slot is not derivable from a dex number: Ninetales-Alola shares number
 * 38 with Ninetales, and Showdown gives every Mega, Gmax, regional and
 * cosmetic forme its own place in a separate range of the sheet. The table is
 * generated from Showdown's own index data.
 *
 * An id the table does not know lands on slot 0, which is Showdown's
 * unknown-Pokémon icon -- a placeholder rather than a broken image, matching
 * how `speciesName` degrades.
 */
export function speciesIcon(id: string): SpeciesIcon {
  const [left = 0, top = 0] = ICONS[id] ?? []
  return { left, top }
}

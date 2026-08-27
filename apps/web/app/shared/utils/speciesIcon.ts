import icons from '../lib/dex/species-icons.json'

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
 * The icon sheet slot for a species id, ready for `background-position` —
 * both values are zero or negative.
 *
 * Not derivable from a dex number: Ninetales-Alola shares number 38 with
 * Ninetales, and every Mega, Gmax, regional and cosmetic forme has its own
 * place in a separate range of the sheet. An unknown id lands on slot 0,
 * Showdown's unknown-Pokémon icon.
 */
export function speciesIcon(id: string): SpeciesIcon {
  const [left = 0, top = 0] = ICONS[id] ?? []
  return { left, top }
}

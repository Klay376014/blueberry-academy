/**
 * The join every PokéAPI `*_names.csv` needs, in one place.
 *
 * PokéAPI's `identifier` column is not `toID()` of its own English name --
 * move 11 is `vice-grip` where the name is `Vise Grip`, item 612 is
 * `pretty-wing` where the name is `Pretty Feather` -- and it is the name that
 * Showdown's id is made of. So the join goes through the English name column
 * instead, which costs nothing and recovers what the identifier drops
 * (research note §2.3).
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader.
 *
 * Upstream copyright, retained as the licence requires:
 * - PokéAPI, BSD-3-Clause. Copyright (c) 2013-2023 Paul Hallett and PokéAPI
 *   contributors. https://github.com/PokeAPI/pokeapi/blob/master/LICENSE.md
 * Pokémon and Pokémon character names are trademarks of Nintendo.
 */

/** PokéAPI's own language ids, from `languages.csv`. */
export const ZH_HANT = '4'
export const ENGLISH = '9'

/** The id form Showdown uses, with accents folded so `Poké Ball` reaches it. */
export const toId = (text) =>
  text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/gu, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, '')

/**
 * `toID(English name) -> zh-Hant name` out of one of PokéAPI's `*_names.csv`
 * rows, joined on the row's own English name.
 *
 * `key` is the file's own id column, e.g. `ability_id` in
 * `ability_names.csv`. A zh-Hant row whose English sibling is missing is
 * dropped: without the English name there is no id to file it under.
 */
export function zhHantByEnglishName(rows, key) {
  const english = new Map()
  const zhHant = new Map()

  for (const row of rows) {
    if (row.local_language_id === ENGLISH) english.set(row[key], row.name)
    if (row.local_language_id === ZH_HANT) zhHant.set(row[key], row.name)
  }

  const byId = new Map()
  for (const [id, name] of zhHant) {
    const englishName = english.get(id)
    if (englishName !== undefined) byId.set(toId(englishName), name)
  }

  return byId
}

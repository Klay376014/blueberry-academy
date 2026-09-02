/**
 * Generates `id -> official Traditional Chinese name` for item ids, which is
 * what the lost-item row and an `[from] item:` source are drawn from.
 *
 * Sources, precedence and what they are worth:
 * docs/adr/0016-localised-battle-vocabulary.md. PokéAPI's zh-Hant strings are
 * the bulk; Showdown's `data/text/zh-tw/items.ts` fills ids PokéAPI has no row
 * for. Showdown's names are copied out of PokéAPI, so the two agreeing is one
 * dataset counted twice and not corroboration.
 *
 * **There is no authority to verify this table against.** The official Taiwan
 * Pokédex list page carries species, abilities and types, and no items
 * (measured: `pokemon_item_id` occurs 0 times in the page). So this table has
 * the same asymmetry ADR-0015's move table has, and the same substitute for an
 * oracle: the coverage guard over the committed replay fixtures, which checks
 * that names reach the screen and not that they are right.
 *
 * The domain is the dex's items plus whatever ids Showdown's own file adds,
 * and **not** every id PokéAPI names. That differs from the ability table on
 * purpose: PokéAPI's `item_names.csv` covers the whole item catalogue -- TMs,
 * mail, key items, event tickets -- so the sources' union is 2055 entries
 * against the 580 items that can ever reach a battle log, and measured, all 76
 * distinct items 1803 public replays put on screen are ids the dex has. The
 * ability table needs the wider domain because there the log measurably sends
 * an id the dex lacks (`As One`); here nothing does, and 1500 entries of TM
 * names would be bundle spent on nothing.
 *
 * Upstream copyright, retained as both licences require:
 * - PokéAPI, BSD-3-Clause. Copyright (c) 2013-2023 Paul Hallett and PokéAPI
 *   contributors. https://github.com/PokeAPI/pokeapi/blob/master/LICENSE.md
 * - Pokémon Showdown, MIT. Copyright (c) 2011-2026 Guangcong Luo and other
 *   contributors. https://github.com/smogon/pokemon-showdown/blob/master/LICENSE
 * Pokémon and Pokémon character names are trademarks of Nintendo.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader.
 *
 *   node scripts/gen-item-names-zh-hant.mjs
 *   (or: pnpm --filter web gen:item-names-zh-hant)
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Dex } from '@pkmn/dex'
import { fetchCsv } from './pokeapi-csv.mjs'
import { fetchShowdownText, scanShowdownNames, serialise } from './showdown-text.mjs'
import { zhHantByEnglishName } from './pokeapi-names.mjs'

const OUT = fileURLToPath(new URL('../app/shared/lib/dex/item-names-zh-hant.json', import.meta.url))

/** PokéAPI @ 2026-09-02, the ref ADR-0015's move table pins. */
const POKEAPI_REF = 'c8dbd727fffc44783653e899ef2700c72e5449cf'
const POKEAPI_CSV = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_REF}/data/v2/csv/`

/**
 * Measured at this ref: 583 entries, 475 of them named -- the 108 without a
 * name are almost all Mega stones, which is exactly the batch PokéAPI does
 * have. The name floor is well under 475 because that gap is upstream's
 * normal state here, not a parse failure.
 */
const SHOWDOWN_ENTRIES_FLOOR = 550
const SHOWDOWN_NAMES_FLOOR = 440

const [itemNames, showdownSource] = await Promise.all([
  fetchCsv(POKEAPI_CSV, 'item_names.csv'),
  fetchShowdownText('items.ts'),
])

const showdown = scanShowdownNames(showdownSource, {
  file: 'items.ts',
  entryFloor: SHOWDOWN_ENTRIES_FLOOR,
  nameFloor: SHOWDOWN_NAMES_FLOOR,
})

const fromPokeapi = zhHantByEnglishName(itemNames, 'item_id')

const dexItems = [
  ...new Map(
    Dex.items
      .all()
      .filter((item) => item.exists && item.num > 0)
      .map((item) => [item.id, item]),
  ).values(),
]

/** @type {Record<string, string>} */
const names = {}
let filled = 0

const domain = [...new Set([...dexItems.map((item) => item.id), ...Object.keys(showdown)])].sort()

for (const id of domain) {
  const name = fromPokeapi.get(id) ?? showdown[id]
  if (name === undefined) continue

  if (!fromPokeapi.has(id)) filled += 1
  names[id] = name
}

writeFileSync(OUT, serialise(names))

const total = Object.keys(names).length
console.log(
  `wrote ${total} zh-Hant names to item-names-zh-hant.json ` +
    `(${total - filled} from PokéAPI, ${filled} filled in from Showdown)`,
)

const missing = dexItems.filter((item) => names[item.id] === undefined)

console.log(`covers ${dexItems.length - missing.length} of the dex's ${dexItems.length} items`)
if (missing.length > 0) {
  console.log(`left to the English fallback: ${missing.map((item) => item.name).join(', ')}`)
}

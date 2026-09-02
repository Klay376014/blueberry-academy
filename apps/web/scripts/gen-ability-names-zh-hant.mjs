/**
 * Generates `id -> official Traditional Chinese name` for ability ids, the
 * ability link of the display layer's fallback chain.
 *
 * Sources, precedence and what they are worth:
 * docs/adr/0016-localised-battle-vocabulary.md, which inherits the order
 * ADR-0014 and ADR-0015 set. In one line: PokéAPI's zh-Hant strings
 * (`local_language_id = 4`) are the bulk, Showdown's own
 * `data/text/zh-tw/abilities.ts` fills ids PokéAPI has no row for -- and
 * because Showdown's names are themselves copied out of PokéAPI, the two
 * agreeing is one dataset counted twice and not corroboration.
 *
 * Unlike moves, abilities do have an authority to be verified against: the
 * official Taiwan Pokédex's list page carries its ability names keyed by
 * lowercase English name. `verify-ability-names-zh-hant.mjs` diffs this table
 * against it. That verifier is a separate, manual, networked step, the same
 * way ADR-0014's species one is.
 *
 * The domain is every id either source names, not the dex's ability list.
 * Measured on 1803 public replays, the log sends `|-ability|…|As One` 245
 * times, and `asone` is not an id `@pkmn/dex` has -- Showdown splits that one
 * official ability into `asoneglastrier` and `asonespectrier`. Keying off the
 * dex would drop the name the screen actually needs, so the sources' own ids
 * are the domain and the dex is only what coverage is reported against.
 *
 * Both refs are pinned rather than read off `master`. Re-running has to
 * produce the committed bytes, and `master` moves -- measured, PokéAPI's
 * Traditional column carried Simplified glyphs until 2026-08-25 (research
 * note §2.5).
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
 *   node scripts/gen-ability-names-zh-hant.mjs
 *   (or: pnpm --filter web gen:ability-names-zh-hant)
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Dex } from '@pkmn/dex'
import { fetchCsv } from './pokeapi-csv.mjs'
import { fetchShowdownText, scanShowdownNames, serialise } from './showdown-text.mjs'
import { zhHantByEnglishName } from './pokeapi-names.mjs'

const OUT = fileURLToPath(
  new URL('../app/shared/lib/dex/ability-names-zh-hant.json', import.meta.url),
)

/** PokéAPI @ 2026-09-02, the ref ADR-0015's move table pins. */
const POKEAPI_REF = 'c8dbd727fffc44783653e899ef2700c72e5449cf'
const POKEAPI_CSV = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_REF}/data/v2/csv/`

/** Measured at this ref: 322 entries, 317 of them named. */
const SHOWDOWN_ENTRIES_FLOOR = 300
const SHOWDOWN_NAMES_FLOOR = 295

const [abilityNames, showdownSource] = await Promise.all([
  fetchCsv(POKEAPI_CSV, 'ability_names.csv'),
  fetchShowdownText('abilities.ts'),
])

const showdown = scanShowdownNames(showdownSource, {
  file: 'abilities.ts',
  entryFloor: SHOWDOWN_ENTRIES_FLOOR,
  nameFloor: SHOWDOWN_NAMES_FLOOR,
})

const fromPokeapi = zhHantByEnglishName(abilityNames, 'ability_id')

/** @type {Record<string, string>} */
const names = {}
let filled = 0

for (const id of [...new Set([...fromPokeapi.keys(), ...Object.keys(showdown)])].sort()) {
  const name = fromPokeapi.get(id) ?? showdown[id]
  if (name === undefined) continue

  if (!fromPokeapi.has(id)) filled += 1
  names[id] = name
}

writeFileSync(OUT, serialise(names))

const total = Object.keys(names).length
console.log(
  `wrote ${total} zh-Hant names to ability-names-zh-hant.json ` +
    `(${total - filled} from PokéAPI, ${filled} filled in from Showdown)`,
)

/**
 * Coverage against the abilities the log can actually name, which is the
 * number that matters -- the table's own size says nothing about whether the
 * screen is covered.
 */
const dexAbilities = [
  ...new Map(
    Dex.abilities
      .all()
      .filter((ability) => ability.exists && ability.num > 0)
      .map((ability) => [ability.id, ability]),
  ).values(),
]
const missing = dexAbilities.filter((ability) => names[ability.id] === undefined)

console.log(
  `covers ${dexAbilities.length - missing.length} of the dex's ${dexAbilities.length} abilities`,
)
if (missing.length > 0) {
  console.log(`left to the English fallback: ${missing.map((a) => a.name).join(', ')}`)
}

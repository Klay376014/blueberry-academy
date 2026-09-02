/**
 * Generates the three small official tables the timeline needs beyond names of
 * moves, abilities and items: the weather's own state names, the stat names a
 * boost line says, and the type names a Tera line says.
 *
 * **These are generated rather than hand-written into the locale files, and
 * that is a departure from what issue #103 planned.** The ticket said tables
 * this small are not worth a generator. Measured, they are all three carried
 * verbatim by Showdown's own zh-tw text -- `default.ts`'s `weatherName`,
 * `names.ts`'s `StatNames` and `TypeNames` -- so hand-writing them would mean
 * transcribing 34 official strings by eye, with no way for a test to tell a
 * typo from a decision. Reasoning: docs/adr/0016-localised-battle-vocabulary.md.
 *
 * The one table that stayed a hand-written thing is the one with no source at
 * all: `brn` / `par` / `slp` / `frz` / `psn` / `tox` / `confusion` have no
 * official noun in any language, and Showdown's own `StatusNames` are eight
 * `null`s (verified first-hand at this ref). So they are not here, and they
 * stay Showdown's identifiers on screen rather than becoming something this
 * project made up.
 *
 * Why the weather needs a table of its own when every weather id is also a
 * move id: the row says what the *state* is, and the state's official name is
 * not the move's. `snowscape` is the state 下雪 and the move 雪景;
 * `raindance` is the state 下雨 and the move 求雨. Sending a weather row
 * through the move table puts the wrong official string on screen, which is
 * indistinguishable from the right one to a reader.
 *
 * Source: Showdown `data/text/zh-tw/`, pinned. It is a projection of PokéAPI
 * for names it shares with it, but the weather state names exist nowhere else
 * -- PokéAPI's `move_meta_ailment_names.csv` has zero zh-Hant rows.
 *
 * Upstream copyright, retained as the licence requires:
 * - Pokémon Showdown, MIT. Copyright (c) 2011-2026 Guangcong Luo and other
 *   contributors. https://github.com/smogon/pokemon-showdown/blob/master/LICENSE
 * Pokémon and Pokémon character names are trademarks of Nintendo.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader.
 *
 *   node scripts/gen-battle-terms-zh-hant.mjs
 *   (or: pnpm --filter web gen:battle-terms-zh-hant)
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  fetchShowdownText,
  scanShowdownNames,
  scanShowdownRecord,
  serialise,
} from './showdown-text.mjs'

const out = (name) => fileURLToPath(new URL(`../app/shared/lib/dex/${name}`, import.meta.url))

/**
 * The stats a `-boost` / `-unboost` line can name. `names.ts`'s `StatNames`
 * also carries `stats: "能力"`, which upstream comments as the word for
 * "stats" in a sentence rather than a stat's name -- filing it under an id
 * would put it on a chip that no line can produce.
 */
const BOOSTABLE = ['hp', 'atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']

const [defaultSource, namesSource] = await Promise.all([
  fetchShowdownText('default.ts'),
  fetchShowdownText('names.ts'),
])

/**
 * Measured at this ref: `default.ts` has 39 top-level entries and 8 of them
 * carry a `weatherName`. The name floor is 8 rather than lower because unlike
 * the big name files there is no `NEEDS QC` churn here -- every weather in the
 * game has a state name, and losing one is a parse failure, not upstream
 * thinning.
 */
const weather = scanShowdownNames(defaultSource, {
  file: 'default.ts',
  field: 'weatherName',
  entryFloor: 35,
  nameFloor: 8,
})

const stats = scanShowdownRecord(namesSource, {
  file: 'names.ts',
  record: 'StatNames',
  floor: 9,
})

const types = scanShowdownRecord(namesSource, {
  file: 'names.ts',
  record: 'TypeNames',
  floor: 19,
})

const boostable = Object.fromEntries(
  BOOSTABLE.filter((id) => stats[id] !== undefined).map((id) => [id, stats[id]]),
)
if (Object.keys(boostable).length !== BOOSTABLE.length) {
  throw new Error(`names.ts: StatNames is missing one of ${BOOSTABLE.join(', ')}`)
}

const sorted = (names) =>
  Object.fromEntries(Object.entries(names).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))

writeFileSync(out('weather-names-zh-hant.json'), serialise(sorted(weather)))
writeFileSync(out('stat-names-zh-hant.json'), serialise(sorted(boostable)))
writeFileSync(out('type-names-zh-hant.json'), serialise(sorted(types)))

console.log(
  `wrote ${Object.keys(weather).length} weather state names, ` +
    `${Object.keys(boostable).length} stat names and ${Object.keys(types).length} type names ` +
    `from Showdown's zh-tw text`,
)
console.log(
  `weather: ${Object.entries(weather)
    .map(([id, n]) => `${id}=${n}`)
    .join(' ')}`,
)

/**
 * Generates `id -> official Traditional Chinese name` for Showdown move ids,
 * the move half of the display-layer name tables.
 *
 * Sources, precedence and what they are worth:
 * docs/adr/0015-localised-move-names.md. In one line: PokéAPI's zh-Hant
 * strings (`local_language_id = 4`) are the bulk, Showdown's own
 * `data/text/zh-tw/moves.ts` fills ids PokéAPI has no row for -- and because
 * Showdown's names are themselves copied out of PokéAPI, the two agreeing is
 * one dataset counted twice and not corroboration.
 *
 * Unlike the species table there is no authority to verify against: the
 * official Taiwan Pokédex carries species and abilities and no moves, so
 * nothing here plays the part `verify-species-names-zh-hant.mjs` plays there.
 * What stands in for it is a coverage guard over the committed replay
 * fixtures (`app/features/timeline/test/name-coverage.spec.ts`), which is a
 * check that names reach the screen and not a check that they are right.
 *
 * Both refs are pinned rather than read off `master`. Re-running has to
 * produce the committed bytes, and `master` moves -- measured, PokéAPI's
 * `move_names.csv` carried Simplified glyphs in its Traditional column until
 * 2026-08-25 (research note §2.5).
 *
 * The output is committed because the SPA is served from Workers' free plan,
 * where a runtime lookup would spend one of the 50 subrequests on data that
 * does not change between deploys. An id with no entry is not guessed at: it
 * falls back to the English name the log itself carries (`moveDisplayName`).
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
 *   node scripts/gen-move-names-zh-hant.mjs   (or: pnpm --filter web gen:move-names-zh-hant)
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Dex } from '@pkmn/dex'

const OUT = fileURLToPath(new URL('../app/shared/lib/dex/move-names-zh-hant.json', import.meta.url))

/** PokéAPI @ 2026-09-02. */
const POKEAPI_REF = 'c8dbd727fffc44783653e899ef2700c72e5449cf'
const POKEAPI_CSV = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_REF}/data/v2/csv/`

/** Showdown @ 2026-09-02, the same ref the research note measured. */
const SHOWDOWN_REF = '2f5b273925862ac242b419086c1e7a8868b51da1'
const SHOWDOWN_TEXT = `https://raw.githubusercontent.com/smogon/pokemon-showdown/${SHOWDOWN_REF}/data/text/zh-tw/`

/** PokéAPI's own ids in `languages.csv`. */
const ZH_HANT = '4'
const ENGLISH = '9'

/**
 * How little a scan of somebody else's TypeScript is allowed to find before it
 * counts as broken rather than as thin. Measured at this ref: 953 entries,
 * 934 of them named.
 *
 * Two floors rather than one, because the two failures are independent: an
 * entry pattern that stops matching takes the whole table with it, and a
 * `name:` line reformatted upstream leaves every entry still found and every
 * name gone. Only the second floor sees that one.
 *
 * Both sit under the measured counts on purpose. An exact pin would turn the
 * `NEEDS QC` rule below -- which is meant to cost a few names, not to stop the
 * build -- into a throw the first time upstream lands one.
 */
const SHOWDOWN_MOVES_FLOOR = 900
const SHOWDOWN_MOVE_NAMES_FLOOR = 900

/**
 * Enough CSV for PokéAPI's tables: comma separated, `"`-quoted where a value
 * contains a comma, `""` for a literal quote inside one, no embedded newlines.
 *
 * The quoting is not hypothetical -- `move_names.csv` line 7907 at the pinned
 * ref is `719,9,"10,000,000 Volt Thunderbolt"`, and reading it on `split(',')`
 * truncates the English name to `"10`, which drops that move's PokéAPI row out
 * of the join entirely. A row that ends inside a quote throws rather than
 * being handed on truncated.
 */
function splitRow(row, where) {
  const cells = []
  let cell = ''
  let quoted = false

  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]

    if (quoted) {
      if (char !== '"') {
        cell += char
      } else if (row[index + 1] === '"') {
        cell += '"'
        index += 1
      } else {
        quoted = false
      }
      continue
    }

    if (char === '"' && cell === '') {
      quoted = true
    } else if (char === ',') {
      cells.push(cell)
      cell = ''
    } else {
      cell += char
    }
  }

  if (quoted) throw new Error(`${where}: row ends inside a quoted field: ${row}`)

  return [...cells, cell]
}

async function fetchCsv(name) {
  const response = await fetch(`${POKEAPI_CSV}${name}`)
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`)

  const [header = '', ...lines] = (await response.text()).trim().split('\n')
  const columns = splitRow(header, name)

  return lines.map((line, index) => {
    const cells = splitRow(line, `${name} line ${index + 2}`)
    return Object.fromEntries(columns.map((column, at) => [column, cells[at] ?? '']))
  })
}

/** The id form Showdown uses, with accents folded so `Poké Ball` reaches it. */
const toId = (text) =>
  text
    .normalize('NFD')
    .replaceAll(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, '')

/**
 * `id -> name` out of one of Showdown's `data/text/zh-tw/*.ts` files.
 *
 * Scanned line by line rather than by matching an entry's whole body: a
 * non-greedy body match over-counts, because a body occasionally swallows the
 * entry after it (research note §4.1). An entry whose name is annotated
 * `NEEDS QC` is dropped -- upstream marks its machine-translated strings that
 * way (§4.5), and this project's whole position is that a guessed name is
 * worse than an English one.
 */
async function fetchShowdownNames(file, entryFloor, nameFloor) {
  const response = await fetch(`${SHOWDOWN_TEXT}${file}`)
  if (!response.ok) throw new Error(`${file}: HTTP ${response.status}`)

  const names = {}
  let entries = 0
  let id = null

  for (const line of (await response.text()).split('\n')) {
    // A key that does not start with a letter is quoted upstream
    // (`"10000000voltthunderbolt"`), which is exactly the entry a
    // letters-only pattern would drop.
    const opening = /^\t"?([a-z0-9]+)"?: \{/.exec(line)
    if (opening) {
      id = opening[1]
      entries += 1
      continue
    }
    if (id === null) continue

    const named = /^\t\tname: "([^"]+)",(.*)$/.exec(line)
    if (named && !named[2].includes('NEEDS QC')) names[id] = named[1]
  }

  if (entries < entryFloor) {
    throw new Error(`${file}: scanned ${entries} entries, expected at least ${entryFloor}`)
  }

  const named = Object.keys(names).length
  if (named < nameFloor) {
    throw new Error(
      `${file}: scanned ${entries} entries but captured only ${named} names, ` +
        `expected at least ${nameFloor}`,
    )
  }

  return names
}

const [moveNames, showdown] = await Promise.all([
  fetchCsv('move_names.csv'),
  fetchShowdownNames('moves.ts', SHOWDOWN_MOVES_FLOOR, SHOWDOWN_MOVE_NAMES_FLOOR),
])

/**
 * PokéAPI's `identifier` column is not `toID()` of its own English name --
 * move 11 is `vice-grip` where the name is `Vise Grip` -- and it is the name
 * that Showdown's id is made of. So the join goes through the English name
 * column, which costs nothing and recovers what the identifier drops
 * (research note §2.3).
 */
const english = new Map()
const zhHant = new Map()
for (const row of moveNames) {
  if (row.local_language_id === ENGLISH) english.set(row.move_id, row.name)
  if (row.local_language_id === ZH_HANT) zhHant.set(row.move_id, row.name)
}

const fromPokeapi = new Map()
for (const [moveId, name] of zhHant) {
  const englishName = english.get(moveId)
  if (englishName !== undefined) fromPokeapi.set(toId(englishName), name)
}

// `Dex.moves.all()` hands back 951 entries for 935 ids -- measured, it repeats
// an entry per alias -- so the list is deduplicated before anything counts it.
// Counting the entries instead reports a coverage the table does not have.
const moves = [
  ...new Map(
    Dex.moves
      .all()
      .filter((move) => move.exists && move.num > 0)
      .map((move) => [move.id, move]),
  ).values(),
].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** @type {Record<string, string>} */
const names = {}
let filled = 0
const missing = []

for (const move of moves) {
  const name = fromPokeapi.get(move.id) ?? showdown[move.id]
  if (name === undefined) {
    missing.push(move.name)
    continue
  }

  if (!fromPokeapi.has(move.id)) filled += 1
  names[move.id] = name
}

/** One entry per line, matching the species tables so all three diff alike. */
const lines = Object.entries(names).map(
  ([id, name]) => `  ${JSON.stringify(id)}: ${JSON.stringify(name)}`,
)
writeFileSync(OUT, `{\n${lines.join(',\n')}\n}\n`)

const total = Object.keys(names).length
console.log(
  `wrote ${total} zh-Hant names to move-names-zh-hant.json ` +
    `(${total - filled} from PokéAPI, ${filled} filled in from Showdown; ` +
    `${missing.length} of Showdown's ${moves.length} moves left to the English fallback)`,
)

if (missing.length > 0) {
  console.log(`left to the English fallback: ${missing.join(', ')}`)
}

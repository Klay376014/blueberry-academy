/**
 * Generates `id -> official Traditional Chinese name` for Showdown species
 * ids, the zh-TW half of the display-layer name tables.
 *
 * Sources, in precedence order, and why only these are wired up:
 * docs/adr/0014-localised-species-names.md. In one line: The Pokémon Company's
 * own zh-Hant strings, as PokéAPI publishes them (`local_language_id = 4`),
 * with the official Taiwan Pokédex winning wherever the two disagree --
 * `species-names-zh-hant-official.mjs` carries those, one evidence URL each,
 * and they are substituted in before any name is composed.
 *
 * `verify-species-names-zh-hant.mjs` is what finds them: it diffs all 1025
 * base species against the official Pokédex. It is a separate, deliberate,
 * network-bound command and not part of the test suite -- CI stays hermetic.
 *
 * The output is committed for the same reason `gen-species-names.mjs`'s is:
 * the SPA is served from Workers' free plan, where a runtime lookup would
 * spend one of the 50 subrequests on data that never changes between deploys.
 * An id this table has no entry for is not guessed at -- it falls back to the
 * English name, and then to the raw id (`speciesDisplayName`).
 *
 * The CSVs are fetched rather than vendored: they are ~1.5MB of source for a
 * ~50KB committed answer, and regenerating is a deliberate act (a dex bump, a
 * new generation) rather than part of install or build.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader.
 *
 *   node scripts/gen-species-names-zh-hant.mjs   (or: pnpm --filter web gen:species-names-zh-hant)
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Dex } from '@pkmn/dex'
import { fillFormeNames, indexCalcNames } from './calc-forme-names.mjs'
import { fetchCsv } from './pokeapi-csv.mjs'
import { OFFICIAL_ZH_HANT_NAMES } from './species-names-zh-hant-official.mjs'

const OUT = fileURLToPath(
  new URL('../app/shared/lib/dex/species-names-zh-hant.json', import.meta.url),
)

/**
 * The sibling project whose zh-Hant table fills the formes PokéAPI has no row
 * for -- see `calc-forme-names.mjs` for what it is and why it comes last.
 * Overridable because it is a path on one machine and not a fact about this
 * repo; absent, the run still finishes and those formes stay English.
 */
const CALC_ZH_HANT =
  process.env.CALC_ZH_HANT ??
  fileURLToPath(
    new URL('../../../../PokemonTool-DamageCalculator/app/locales/zhHant.json', import.meta.url),
  )

/**
 * PokéAPI @ 2026-09-02, the same ref `gen-move-names-zh-hant.mjs` pins -- both
 * name tables grow out of one upstream snapshot. Pinned, not `master`: the
 * committed bytes are only reproducible if a re-run reads the same input, and
 * `master` moves under the table's content. Measured, it has: PokéAPI's
 * Traditional column carried Simplified glyphs until 2026-08-25 (ADR-0014).
 * Bumping it is a deliberate act with a diff to read, so do not "tidy" this
 * back to a branch name.
 */
const POKEAPI_REF = 'c8dbd727fffc44783653e899ef2700c72e5449cf'
const POKEAPI_CSV = `https://raw.githubusercontent.com/PokeAPI/pokeapi/${POKEAPI_REF}/data/v2/csv/`

/**
 * The regional forme segments Showdown spells out in a forme name. A forme
 * that is one of these and nothing else is what PokéAPI's descriptor column
 * covers; one that is a region plus a mode is what it does not -- see the
 * composition rule below.
 */
const REGIONS = new Set(['Alola', 'Galar', 'Hisui', 'Paldea'])

/** PokéAPI's own id for zh-Hant in `languages.csv`. */
const ZH_HANT = '4'

/** The id form Showdown uses, so a PokéAPI identifier can be matched to it. */
const toId = (text) => text.toLowerCase().replaceAll(/[^a-z0-9]+/g, '')

/**
 * The calculator's locale file, or null when this machine has no checkout of
 * it. Null rather than a throw: it is another project's file, so a run without
 * it is a smaller answer and not a broken one.
 */
function readCalcTable() {
  try {
    return JSON.parse(readFileSync(CALC_ZH_HANT, 'utf8'))
  } catch (error) {
    if (error.code === 'ENOENT') return null
    throw error
  }
}

const [speciesNames, formNames, forms] = await Promise.all([
  fetchCsv(POKEAPI_CSV, 'pokemon_species_names.csv'),
  fetchCsv(POKEAPI_CSV, 'pokemon_form_names.csv'),
  fetchCsv(POKEAPI_CSV, 'pokemon_forms.csv'),
])

/** Dex number -> zh-Hant name. The 1025 base species, all of them named. */
const byNumber = new Map(
  speciesNames
    .filter((row) => row.local_language_id === ZH_HANT)
    .map((row) => [Number(row.pokemon_species_id), row.name]),
)

// The official Pokédex wins character for character, and it wins *here* --
// before composition -- so a forme built out of a corrected base carries the
// corrected base too.
let corrections = 0
for (const [id, official] of Object.entries(OFFICIAL_ZH_HANT_NAMES)) {
  const number = Number(official.zukanId)
  const species = Dex.species.get(id)

  // An evidence URL that names a different Pokémon than the id it is filed
  // under would rename the wrong species, silently. It stops the run instead.
  if (!species.exists || species.num !== number) {
    throw new Error(`${id}: ${official.source} is #${number}, but the dex says #${species.num}`)
  }
  if (!byNumber.has(number)) throw new Error(`${id}: no PokéAPI zh-Hant row for #${number}`)

  if (byNumber.get(number) !== official.name) corrections += 1
  byNumber.set(number, official.name)
}

const formIdentifier = new Map(forms.map((row) => [row.id, row.identifier]))

/** Showdown id -> the zh-Hant forme row PokéAPI has for it. */
const byFormId = new Map(
  formNames
    .filter((row) => row.local_language_id === ZH_HANT)
    .flatMap((row) => {
      const identifier = formIdentifier.get(row.pokemon_form_id)
      return identifier === undefined ? [] : [[toId(identifier), row]]
    }),
)

const species = Dex.species
  .all()
  .filter((s) => s.exists && s.num > 0)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** @type {Record<string, string>} */
const names = {}
let formesNamed = 0
/** Formes the composition rule cannot spell whole, reported rather than guessed. */
const formesSkipped = []

for (const s of species) {
  const base = byNumber.get(s.num)
  if (base === undefined) continue

  if (!s.forme) {
    names[s.id] = base
    continue
  }

  const forme = byFormId.get(s.id)
  if (forme === undefined) continue

  // Two shapes live in this one column. A Mega's row is a complete name
  // (`超級妙蛙花`), which the base name being a substring of it is what marks;
  // a regional forme's is a descriptor of the forme alone (`阿羅拉的樣子`),
  // which the games themselves show parenthesised after the species. Both
  // halves are official strings either way -- the bracket is the only thing
  // this script contributes, and it contributes it to nothing else.
  const full = forme.pokemon_name || forme.form_name

  if (full.includes(base)) {
    names[s.id] = full
    formesNamed += 1
    continue
  }

  // The bracket holds one descriptor, so it cannot carry a forme that is a
  // region *and* something else. `Darmanitan-Galar-Zen` is both, and PokéAPI's
  // row for it describes the mode alone (`達摩模式`): composing it produced
  // `達摩狒狒（達摩模式）`, byte-identical to Unovan `Darmanitan-Zen` and not
  // the Galarian one's name at all. Silently wrong is the outcome ADR-0014
  // exists to refuse, so this one goes to the English fallback.
  //
  // A forme that is several words but one thing (`Urshifu-Rapid-Strike` ->
  // `武道熊師（連擊流）`) is not this case: the descriptor is the whole of it.
  const parts = s.forme.split('-')
  if (parts.length > 1 && parts.some((part) => REGIONS.has(part))) {
    formesSkipped.push(s.name)
    continue
  }

  names[s.id] = `${base}（${full}）`
  formesNamed += 1
}

// Last, and only into holes: everything above is either the official Pokédex
// or PokéAPI publishing official strings, and this is neither.
const calcTable = readCalcTable()
const gapFilled = fillFormeNames({
  names,
  species,
  calcNames: calcTable === null ? {} : indexCalcNames(calcTable.pokemon ?? {}),
})
Object.assign(names, gapFilled.names)

/**
 * One entry per line, matching `gen-species-names.mjs` so both diff alike.
 * Sorted here rather than relying on insertion order: the gap-filled formes
 * are merged in after the main pass, and an id-sorted file is what makes a dex
 * bump read as a few added lines instead of a reordering.
 */
const lines = Object.entries(names)
  .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([id, name]) => `  ${JSON.stringify(id)}: ${JSON.stringify(name)}`)
writeFileSync(OUT, `{\n${lines.join(',\n')}\n}\n`)

const total = Object.keys(names).length
const gapCount = Object.keys(gapFilled.names).length
console.log(
  `wrote ${total} zh-Hant names to species-names-zh-hant.json ` +
    `(${total - formesNamed - gapCount} base species, ${formesNamed} formes, ` +
    `${gapCount} formes gap-filled; ` +
    `${species.length - total} of Showdown's ${species.length} species left to the English fallback)`,
)

const overridden = Object.keys(OFFICIAL_ZH_HANT_NAMES).length
console.log(
  `official Pokédex overrides: ${overridden} entries, ${corrections} of which PokéAPI still disagrees with`,
)

// Without the table there is nothing to report but where it was looked for:
// every unnamed forme lands in `unresolved` then, so a count would claim the
// calculator could have named all 220 of them, and the list would print them.
if (calcTable === null) {
  console.log(`no calculator table at ${CALC_ZH_HANT}: no formes gap-filled`)
} else {
  console.log(`gap-filled from the calculator's table: ${gapCount} formes`)

  // Both lists are printed rather than counted: what is still English is the
  // only thing that says what a next pass would have to find, and a collision
  // is a name this script refused to put on two Pokémon at once.
  for (const { name, clash } of gapFilled.collided) {
    console.log(`  skipped ${name}: ${clash} already names another Pokémon`)
  }
  if (gapFilled.unresolved.length > 0) {
    console.log(
      `  still English (${gapFilled.unresolved.length}): ${gapFilled.unresolved.join(', ')}`,
    )
  }
}

// Filtered against the fill, which runs after this list is built:
// `Darmanitan-Galar-Zen` is skipped by the composition rule and then named by
// the calculator's table, and a line saying it fell back to English while it
// sits in the file is worse than no line at all.
const stillSkipped = formesSkipped.filter((name) => names[toId(name)] === undefined)
if (stillSkipped.length > 0) {
  console.log(
    `left to the English fallback for having a forme the bracket cannot hold: ${stillSkipped.join(', ')}`,
  )
}

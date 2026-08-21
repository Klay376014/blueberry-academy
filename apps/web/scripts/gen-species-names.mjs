/**
 * Generates the display-layer tables that turn a Showdown species id into
 * something a person can read: `id -> official English name`, and
 * `id -> icon sheet slot`.
 *
 * Both come out of one walk of `Dex.species.all()`, so the two tables can
 * never disagree about which ids exist. The output is committed: the SPA is
 * served from Workers' free plan, where a runtime lookup would spend one of
 * the 50 subrequests and some of the 10ms CPU on data that never changes
 * between deploys.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader, which is the whole of what a codegen script
 * needs.
 *
 *   node scripts/gen-species-names.mjs        (or: pnpm --filter web gen:species-names)
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Dex } from '@pkmn/dex'
import { Icons } from '@pkmn/img'

const OUT_DIR = fileURLToPath(new URL('../app/lib/dex/', import.meta.url))

/**
 * `@pkmn/dex` is the same data that produced the ids in the first place, so
 * the names are guaranteed to line up with what the parser writes. Sorted by
 * id so a dex bump shows up as a readable diff rather than a reordering.
 */
const species = Dex.species
  .all()
  .filter((s) => s.exists)
  .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))

/** @type {Record<string, string>} */
const names = {}
/** @type {Record<string, [number, number]>} */
const icons = {}

for (const s of species) {
  // Showdown's data spells Flabébé decomposed (e + combining acute). Both
  // forms render identically, but only the composed one matches what a
  // keyboard or a browser search box produces, and pinning the form here
  // keeps the committed file stable if the dex ever switches.
  names[s.id] = s.name.normalize('NFC')

  // `left` and `top` come back as CSS background-position values, already
  // negative. They are NOT derivable from `species.num`: Ninetales-Alola and
  // Ninetales share dex number 38, and Showdown keeps every Mega, Gmax,
  // regional and cosmetic forme -- 524 of the 1517 species -- in a separate
  // range of the sheet. `@pkmn/img` carries Showdown's own index table, which
  // is the only place that mapping exists.
  const { left, top } = Icons.getPokemon(s.id)

  // `-0` survives arithmetic but not JSON, and an icon at the origin is a
  // real slot. Normalise so the file and the values agree.
  icons[s.id] = [left === 0 ? 0 : left, top === 0 ? 0 : top]
}

/**
 * One entry per line, whatever the value's shape. `JSON.stringify(_, 2)` would
 * break every `[left, top]` pair across four lines and make the icon table
 * unreadable as a diff. The space after the comma inside a pair is what oxfmt
 * wants: without it `vp check` reports the file the generator has just written
 * as needing formatting.
 *
 * @param {Record<string, unknown>} table
 */
function serialise(table) {
  const lines = Object.entries(table).map(
    ([id, value]) =>
      `  ${JSON.stringify(id)}: ${Array.isArray(value) ? `[${value.join(', ')}]` : JSON.stringify(value)}`,
  )
  return `{\n${lines.join(',\n')}\n}\n`
}

writeFileSync(`${OUT_DIR}species-names.json`, serialise(names))
writeFileSync(`${OUT_DIR}species-icons.json`, serialise(icons))

console.log(`wrote ${species.length} species to species-names.json and species-icons.json`)

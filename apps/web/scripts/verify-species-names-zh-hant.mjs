/**
 * Diffs the committed zh-Hant species table against the official Taiwan
 * Pokédex -- the only authority that can catch a *wrong word*, as opposed to a
 * missing one.
 *
 *   node scripts/verify-species-names-zh-hant.mjs
 *   (or: pnpm --filter web verify:species-names-zh-hant)
 *
 * Exits 0 when all 1025 base species match byte for byte, 1 when any deviates,
 * printing every deviation. A deviation is not fixed by editing the JSON: put
 * the official string in `species-names-zh-hant-official.mjs` with the Pokédex
 * URL it came from and re-run the generator.
 *
 * **Deliberately not a unit test.** It makes one request to a third-party site,
 * and `vp run -r test:unit` has to stay hermetic and offline -- a red build
 * because tw.portal-pokemon.com was slow tells nobody anything. It is run by
 * hand next to the generator: after a re-run, a dex bump, or a new generation.
 * See docs/adr/0014-localised-species-names.md.
 *
 * Why the Pokédex is a verifier and not a source: its terms of use forbid
 * copying and redistributing its content, so its 1025 strings are never
 * committed here. What is committed is the handful of ids where it disagrees
 * with PokéAPI, which is a bug report, not a copy of the dataset.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader, like the generators beside it.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Dex } from '@pkmn/dex'
import { fetchTwPokedex } from './tw-pokedex.mjs'

const TABLE = fileURLToPath(
  new URL('../app/shared/lib/dex/species-names-zh-hant.json', import.meta.url),
)

/** The count the page has held since gen 9; a parse that drifts fails loudly. */
const BASE_SPECIES = 1025

const { url, bytes, species: official } = await fetchTwPokedex()

if (official.size !== BASE_SPECIES) {
  throw new Error(
    `parsed ${official.size} base species from ${url} (${bytes} bytes), expected ${BASE_SPECIES} -- ` +
      `the page shape changed, or the 308 to /pokedex/ was not followed`,
  )
}

/** @type {Record<string, string>} */
const table = JSON.parse(readFileSync(TABLE, 'utf8'))

const deviations = []
const missing = []

for (const species of Dex.species.all()) {
  if (!species.exists || species.num <= 0 || species.forme) continue

  const name = official.get(species.num)
  if (name === undefined) continue

  const ours = table[species.id]
  if (ours === undefined) missing.push(`#${species.num} ${species.id}: official=${name}`)
  else if (ours !== name) {
    deviations.push(`#${species.num} ${species.id}: table=${ours} official=${name}`)
  }
}

console.log(
  `compared ${official.size - missing.length} base species against ${url}: ` +
    `${deviations.length} deviate, ${missing.length} absent from the table`,
)

for (const line of missing) console.log(`  absent  ${line}`)
for (const line of deviations) console.log(`  deviate ${line}`)

if (deviations.length > 0 || missing.length > 0) {
  console.log(
    'fix a deviation in scripts/species-names-zh-hant-official.mjs (official string + its Pokédex URL), then re-run the generator -- never by editing the JSON.',
  )
  process.exitCode = 1
}

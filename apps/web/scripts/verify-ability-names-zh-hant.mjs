/**
 * Diffs the committed zh-Hant ability table against the official Taiwan
 * Pokédex -- the only authority that can catch a *wrong word* rather than a
 * missing one.
 *
 *   node scripts/verify-ability-names-zh-hant.mjs
 *   (or: pnpm --filter web verify:ability-names-zh-hant)
 *
 * Exits 0 when every ability the page carries matches the table byte for byte,
 * 1 when any deviates, printing every deviation. Measured today: 280 compared,
 * 0 deviate -- which is why there is no override table beside this file. If
 * one ever deviates it is fixed the way ADR-0014 fixed the two species that
 * did: an override module holding the official string and the URL it was read
 * from, applied by the generator before it composes anything. Never by editing
 * the JSON, and never by translating.
 *
 * **A partial oracle, and honest about it.** The page carries 280 ability
 * names (measured 2026-09-02; the research note counted 281 the same day, so
 * the page's own list moves) against the table's 318 -- everything it does not
 * carry is unverified, which includes the eight Showdown filled in. The move
 * and item tables have no oracle at all: the page has no move or item records.
 *
 * **Deliberately not a unit test.** It makes one request to a third-party
 * site, and `vp run -r test:unit` has to stay hermetic and offline -- a red
 * build because tw.portal-pokemon.com was slow tells nobody anything. It is
 * run by hand next to the generator, the same way ADR-0014's species verifier
 * is. See docs/adr/0016-localised-battle-vocabulary.md.
 *
 * Why the Pokédex is a verifier and not a source: its terms of use forbid
 * copying and redistributing its content, so its strings are never committed
 * here. What is committed is the handful of ids where a source disagrees with
 * it, which is a bug report, not a copy of the dataset.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader, like the generators beside it.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { fetchTwPokedex } from './tw-pokedex.mjs'
import { toId } from './pokeapi-names.mjs'

const TABLE = fileURLToPath(
  new URL('../app/shared/lib/dex/ability-names-zh-hant.json', import.meta.url),
)

/**
 * How few ability records the page is allowed to yield before a parse counts
 * as broken rather than as thin. Measured 2026-09-02: 280. Not pinned exactly,
 * because the page's list has moved by one record since the research note
 * counted it, and a floor that tracks the page exactly turns "TPC published a
 * new ability" into a failure.
 */
const ABILITIES_FLOOR = 250

const { url, bytes, abilities } = await fetchTwPokedex()

if (abilities.size < ABILITIES_FLOOR) {
  throw new Error(
    `parsed ${abilities.size} abilities from ${url} (${bytes} bytes), expected at least ${ABILITIES_FLOOR} -- ` +
      `the page shape changed, or the 308 to /pokedex/ was not followed`,
  )
}

/** @type {Record<string, string>} */
const table = JSON.parse(readFileSync(TABLE, 'utf8'))

const deviations = []
const missing = []

for (const [officialId, name] of abilities) {
  const id = toId(officialId)
  const ours = table[id]

  if (ours === undefined) missing.push(`${id}: official=${name}`)
  else if (ours !== name) deviations.push(`${id}: table=${ours} official=${name}`)
}

console.log(
  `compared ${abilities.size - missing.length} of the table's ${Object.keys(table).length} abilities against ${url}: ` +
    `${deviations.length} deviate, ${missing.length} absent from the table`,
)

for (const line of missing) console.log(`  absent  ${line}`)
for (const line of deviations) console.log(`  deviate ${line}`)

if (deviations.length > 0 || missing.length > 0) {
  console.log(
    'a deviation is a bug report, not a licence to edit the JSON: add an override the generator applies, holding the official string and the Pokédex URL it was read from, then re-run the generator.',
  )
  process.exitCode = 1
}

/**
 * Generates the move ids that `toID()` shares with something in the dex that
 * is not a move -- a condition, an ability or an item.
 *
 * This is the guard `effectDisplayName` needs. A log line like
 * `|-activate|p2b: Garchomp|confusion` carries the effect's name with no
 * namespace on it, and `toID('confusion')` is both the condition 混亂 and the
 * move Confusion 念力. Sending it through the move table puts the wrong one of
 * the two on screen, so an id in this list is declined rather than guessed at.
 * See docs/adr/0015-localised-move-names.md.
 *
 * Committed rather than computed at runtime for the same reason the name
 * tables are: `@pkmn/dex` is a devDependency, it is not in the bundle, and the
 * answer does not change between deploys. `test/nuxt/move-locale.spec.ts`
 * derives the same set from `@pkmn/dex` a second time and asserts this file
 * equals it, so a dex bump that widens the collision set fails the suite
 * instead of reaching the screen.
 *
 * Plain ESM rather than TypeScript on purpose -- it runs under bare `node`
 * with no build step or loader. It reads no network.
 *
 *   node scripts/gen-ambiguous-move-ids.mjs   (or: pnpm --filter web gen:ambiguous-move-ids)
 */

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { Dex } from '@pkmn/dex'

const OUT = fileURLToPath(new URL('../app/shared/lib/dex/ambiguous-move-ids.json', import.meta.url))

const moves = new Set(
  Dex.moves
    .all()
    .filter((move) => move.exists && move.num > 0)
    .map((move) => move.id),
)

/**
 * Every id the dex spells the same way for something that is not a move.
 *
 * `Dex.data.Conditions` and not `Dex.conditions.get()`: the getter answers for
 * a move's own volatile too -- measured, `Dex.conditions.get('stealthrock')`
 * exists -- and a volatile a move brought with it is that move's name, which
 * is the one case here that is not ambiguous at all.
 */
const others = [
  ...Object.keys(Dex.data.Conditions),
  ...Dex.abilities
    .all()
    .filter((ability) => ability.exists)
    .map((ability) => ability.id),
  ...Dex.items
    .all()
    .filter((item) => item.exists)
    .map((item) => item.id),
]

const ids = [...new Set(others.filter((id) => moves.has(id)))].sort()

/**
 * The shape oxfmt already agrees with, so re-running the generator leaves the
 * committed file byte-identical. Measured against `vp check --fix`: it packs an
 * array onto one line while the line stays within 100 columns -- which the
 * seven ids currently do -- and breaks it to one entry per line the moment it
 * does not. Writing one id per line unconditionally is what made this file
 * dirty after every run; see #113 and `gen-species-names.mjs`'s `serialise`.
 *
 * @param {string[]} values
 */
function serialise(values) {
  const oneLine = `[${values.map((id) => JSON.stringify(id)).join(', ')}]`
  if (oneLine.length <= 100) return `${oneLine}\n`
  return `[\n${values.map((id) => `  ${JSON.stringify(id)}`).join(',\n')}\n]\n`
}

writeFileSync(OUT, serialise(ids))

console.log(`wrote ${ids.length} ambiguous move ids to ambiguous-move-ids.json: ${ids.join(', ')}`)

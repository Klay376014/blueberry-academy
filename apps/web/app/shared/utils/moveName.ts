import { toID } from 'replay-parser'
import zhHant from '../lib/dex/move-names-zh-hant.json'
import ambiguousMoveIds from '../lib/dex/ambiguous-move-ids.json'

/**
 * The locales a generated move-name table exists for. A locale that is not in
 * here — one added to `nuxt.config.ts` before its table is generated — reads
 * English rather than nothing.
 */
const LOCALISED: Record<string, Record<string, string>> = { 'zh-TW': zhHant }

/**
 * The name to show a reader of `locale` for a move the log named.
 *
 * Unlike a species, what arrives here is already the English name — the log
 * carries `Wide Guard`, not `wideguard` — so the English fallback is the
 * argument itself, and an unknown string comes back untouched rather than
 * blank or guessed at.
 *
 * The table is keyed by `toID()` because that is the one spelling of a move
 * that both sources and the log agree on. See
 * docs/adr/0015-localised-move-names.md.
 */
export function moveDisplayName(name: string, locale: string): string {
  return LOCALISED[locale]?.[toID(name)] ?? name
}

/**
 * The ids a bare effect string could mean something other than a move by,
 * derived from `@pkmn/dex` by `scripts/gen-ambiguous-move-ids.mjs` and
 * re-derived under test.
 */
const AMBIGUOUS = new Set<string>(ambiguousMoveIds)

/**
 * The name to show for an effect string the log named — a single-turn effect,
 * a side condition, whatever a `blocked by` line points at.
 *
 * The parser has already stripped the `move:` / `ability:` / `item:` prefix
 * (`effectNameOf`), so what arrives here is a bare name with no namespace on
 * it, and most of them are moves: `Stealth Rock`, `Toxic Spikes`, `Tailwind`,
 * `Protect`. Two kinds are not, and they are handled differently because the
 * dex tells them apart:
 *
 * - A name only the dex's non-move half has — an ability reaching a `blocked
 *   by` row — misses the table and passes through. #103 gives those a table.
 * - A name both halves spell the same way is declined outright. Measured,
 *   `|-activate|p2b: Garchomp|confusion` is the condition 混亂 and never the
 *   move Confusion 念力, and nothing in the line says which namespace it came
 *   from, so the reader gets the English string rather than a coin flip.
 *
 * See docs/adr/0015-localised-move-names.md.
 */
export function effectDisplayName(effect: string, locale: string): string {
  return AMBIGUOUS.has(toID(effect)) ? effect : moveDisplayName(effect, locale)
}

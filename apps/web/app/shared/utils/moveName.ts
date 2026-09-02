import { toID } from 'replay-parser'
import zhHant from '../lib/dex/move-names-zh-hant.json'

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
 * The name to show for an effect string the log named — a single-turn effect,
 * a side condition, whatever a `blocked by` line points at.
 *
 * The parser has already stripped the `move:` / `ability:` / `item:` prefix
 * (`effectNameOf`), so these are bare names, and most of them are moves:
 * `Stealth Rock`, `Toxic Spikes`, `Tailwind`, `Protect`. The ones that are
 * not — an ability's name reaching a `blocked by` row — pass through
 * unchanged, and #103 is what gives them a table of their own. This function
 * is where that chain goes.
 */
export function effectDisplayName(effect: string, locale: string): string {
  return moveDisplayName(effect, locale)
}

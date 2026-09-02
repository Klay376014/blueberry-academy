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
 * `effectDisplayName` used to live here. It is `app/shared/utils/battleTerms.ts`
 * now: ADR-0015 expected the fallback chain to grow inside this file, and once
 * it reached the ability and weather tables it was no longer about moves.
 * See docs/adr/0016-localised-battle-vocabulary.md.
 */

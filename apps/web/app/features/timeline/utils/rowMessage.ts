import { effectDisplayName } from '~/shared/utils/moveName'

/**
 * The messages whose `effect` parameter is a move name.
 *
 * Every one of these carries the same shape — a bare effect name the parser
 * stripped the `move:` prefix off — so the set, and not the shape, is what
 * says which ones are localised. `weather`, `fieldEffectStarted` and
 * `fieldEffectEnded` look identical from here and are deliberately not in it:
 * #103 owns them, and the weather row says a state's name rather than a
 * move's (`下雪` against the move's `雪景`).
 */
const MOVE_NAMED = new Set(['effectStarted', 'effectHeld', 'sideEffectStarted', 'sideEffectEnded'])

/**
 * A row's or a note's `t()` parameters, with the ones that are move names put
 * into the reader's language. See docs/adr/0015-localised-move-names.md.
 */
export function localisedParams(
  key: string,
  params: Record<string, string> | undefined,
  locale: string,
): Record<string, string> {
  if (params === undefined) return {}
  if (!MOVE_NAMED.has(key) || params.effect === undefined) return params

  return { ...params, effect: effectDisplayName(params.effect, locale) }
}

import {
  abilityDisplayName,
  effectDisplayName,
  fieldConditionDisplayName,
  itemDisplayName,
  sourceDisplayName,
  statDisplayName,
  teraTypeDisplayName,
} from '~/shared/utils/battleTerms'

/**
 * Which of a message's parameters is an identifier from the log, and which
 * table names it.
 *
 * The table is keyed by message key rather than by parameter shape because
 * the key is the only thing that says what kind of identifier it is: `weather`
 * and `fieldEffectStarted` and `effectHeld` all carry one string and want
 * three different lookups. The log's own `move:` / `ability:` prefix cannot
 * play this part — measured, it is absent on most lines and present on the
 * same effect elsewhere — but the key is derived from the protocol line's
 * type, which never lies about what kind of line it was.
 *
 * See docs/adr/0016-localised-battle-vocabulary.md.
 */
const LOCALISERS: Record<string, Record<string, (value: string, locale: string) => string>> = {
  // A bare effect string: the move -> ability chain.
  effectStarted: { effect: effectDisplayName },
  effectHeld: { effect: effectDisplayName },
  volatileStarted: { effect: effectDisplayName },
  volatileEnded: { effect: effectDisplayName },
  // A side condition or something on the whole field. Its name is a move's,
  // except for the weather, which has a state name of its own.
  sideEffectStarted: { effect: fieldConditionDisplayName },
  sideEffectEnded: { effect: fieldConditionDisplayName },
  fieldEffectStarted: { effect: fieldConditionDisplayName },
  fieldEffectEnded: { effect: fieldConditionDisplayName },
  weather: { weather: fieldConditionDisplayName },
  // Named outright by the line that carried them.
  ability: { ability: abilityDisplayName },
  abilityEnded: { ability: abilityDisplayName },
  lostItem: { item: itemDisplayName },
  statRose: { stat: statDisplayName },
  statFell: { stat: statDisplayName },
  terastallized: { type: teraTypeDisplayName },
  // Whatever the log said was to blame, namespace and all.
  couldNotMove: { reason: sourceDisplayName },
}

/**
 * A row's or a note's `t()` parameters, with the identifiers among them put
 * into the reader's language.
 *
 * `statusCured`'s `status` is deliberately absent: `brn` has no official noun
 * in any source, so it stays Showdown's identifier
 * (docs/adr/0016-localised-battle-vocabulary.md).
 */
export function localisedParams(
  key: string,
  params: Record<string, string> | undefined,
  locale: string,
): Record<string, string> {
  if (params === undefined) return {}

  const localisers = LOCALISERS[key]
  if (localisers === undefined) return params

  const localised: Record<string, string> = { ...params }
  for (const [name, localise] of Object.entries(localisers)) {
    const value = params[name]
    if (value !== undefined) localised[name] = localise(value, locale)
  }

  return localised
}

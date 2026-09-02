import { toID } from 'replay-parser'
import { moveDisplayName } from './moveName'
import { speciesDisplayName } from './speciesName'
import ambiguousMoveIds from '../lib/dex/ambiguous-move-ids.json'
import abilityZhHant from '../lib/dex/ability-names-zh-hant.json'
import itemZhHant from '../lib/dex/item-names-zh-hant.json'
import weatherZhHant from '../lib/dex/weather-names-zh-hant.json'
import statZhHant from '../lib/dex/stat-names-zh-hant.json'
import typeZhHant from '../lib/dex/type-names-zh-hant.json'

/**
 * The rest of the battle vocabulary, said in the reader's language: abilities,
 * items, the weather and the field, stat names, Tera types, and whatever a
 * `[from]` named as the source of a change.
 *
 * Everything here takes the English string the log itself carried and hands
 * back either an official Traditional Chinese name or that same string. A name
 * nothing can source falls back to English and then to the raw id -- never to
 * a blank, a transliteration or a guess (docs/adr/0014-localised-species-names.md).
 *
 * ADR-0015 expected this chain to grow inside `moveName.ts`. It lives here
 * instead because it stopped being about moves; that file keeps the one
 * function that is. See docs/adr/0016-localised-battle-vocabulary.md.
 */

type Table = Record<string, Record<string, string>>

/**
 * The locales a generated table exists for. A locale that is not in here --
 * one added to `nuxt.config.ts` before its tables are generated -- reads
 * English rather than nothing.
 */
const ABILITIES: Table = { 'zh-TW': abilityZhHant }
const ITEMS: Table = { 'zh-TW': itemZhHant }
const WEATHER: Table = { 'zh-TW': weatherZhHant }
const STATS: Table = { 'zh-TW': statZhHant }
const TYPES: Table = { 'zh-TW': typeZhHant }

/** The ids a bare effect string could mean something other than a move by. */
const AMBIGUOUS = new Set<string>(ambiguousMoveIds)

const lookup = (table: Table, name: string, locale: string): string =>
  table[locale]?.[toID(name)] ?? name

/** The name to show a reader of `locale` for an ability the log named. */
export function abilityDisplayName(name: string, locale: string): string {
  return lookup(ABILITIES, name, locale)
}

/** The name to show a reader of `locale` for an item the log named. */
export function itemDisplayName(name: string, locale: string): string {
  return lookup(ITEMS, name, locale)
}

/**
 * The name to show for a stat a boost line named, e.g. `atk`.
 *
 * A status code (`brn`, `par`) passed here comes back unchanged, and that is
 * the whole answer for statuses: no source has a noun for one. Showdown's own
 * `StatusNames` are eight `null`s and PokéAPI's `move_meta_ailment_names.csv`
 * has no Traditional Chinese row at all, because the games say
 * `{POKEMON}被灼傷了！` rather than naming the state. So the chips keep
 * Showdown's identifiers.
 */
export function statDisplayName(stat: string, locale: string): string {
  return lookup(STATS, stat, locale)
}

/** The name to show for the type a Tera line named, `Stellar` included. */
export function teraTypeDisplayName(type: string, locale: string): string {
  return lookup(TYPES, type, locale)
}

/**
 * The name to show for an effect string the log named with no namespace on it
 * -- a single-turn effect, whatever a `blocked by` line points at.
 *
 * The chain is the move table, then the ability table, then the item table --
 * one link per namespace `effectNameOf` strips, and an item really does arrive
 * here: `|-activate|p2b: Slowbro|item: Quick Claw` in
 * `gen9championsvgc2026regmb-2674448634`, and Custap Berry announces itself
 * the same way.
 *
 * `effectNameOf` has already stripped that prefix, and measured over 1803
 * public replays it could not be trusted anyway: 15 of the 118 distinct effect
 * strings arrive both prefixed and bare (`Protect` 3770 times bare against 116
 * prefixed; `Protosynthesis` 108 bare against 71 `ability:`), so keying the
 * lookup on it would say the same effect's name in Chinese on one line and
 * English on the next. The dex is the better judge, and over the same corpus
 * it never disagreed with a prefix the log did carry.
 *
 * What the dex cannot judge is an id it spells for two namespaces at once, and
 * there is measurably one: `confusion` is the condition 混亂 and the move
 * Confusion 念力. Those ids are declined outright rather than guessed at --
 * `AMBIGUOUS` is derived from `@pkmn/dex` by
 * `scripts/gen-ambiguous-move-ids.mjs` and re-derived under test. Neither of
 * the later links widened that: measured against `@pkmn/dex`, no ability id is
 * also a move id or an item id, and the one id that is both an item and a move
 * is `metronome`, which `AMBIGUOUS` already declines.
 *
 * See docs/adr/0016-localised-battle-vocabulary.md.
 */
export function effectDisplayName(effect: string, locale: string): string {
  if (AMBIGUOUS.has(toID(effect))) return effect

  const move = moveDisplayName(effect, locale)
  if (move !== effect) return move

  const ability = abilityDisplayName(effect, locale)

  return ability === effect ? itemDisplayName(effect, locale) : ability
}

/**
 * The name to show for something standing on the field: the weather, a screen,
 * a terrain, a room.
 *
 * The same chain as `effectDisplayName` with the weather's own state names in
 * front of it, and that head is the only place they can be reached from. A
 * weather row says what the *state* is, and the state's official name is not
 * the move's -- `snowscape` is the state 下雪 and the move 雪景, `raindance`
 * the state 下雨 and the move 求雨. Both are official; only one is what the
 * row means. Every weather id is also a move id, so `effectDisplayName`
 * declines all of them and this is what answers instead.
 *
 * Terrains, rooms and screens have no name of their own anywhere upstream --
 * Showdown's `default.ts` gives them sentences and no name field -- so they
 * fall through to the move table, where the move name is the only official
 * string there is and the right one.
 */
export function fieldConditionDisplayName(name: string, locale: string): string {
  return WEATHER[locale]?.[toID(name)] ?? effectDisplayName(name, locale)
}

/** The namespaces a `[from]` or a `cant` reason can carry, and what names each. */
const NAMESPACED = /^(move|ability|item|pokemon):\s*/

/**
 * The reader's name for a species a `[from] pokemon:` named.
 *
 * The trap the other three tables do not have: ADR-0014's table is keyed by id
 * and its own miss is the *id*, not the string handed in, so an unknown
 * species would leave `fluffyboi` on screen in both locales rather than
 * falling back the way everything else here does.
 */
function speciesSourceName(name: string, locale: string): string {
  const id = toID(name)
  const display = speciesDisplayName(id, locale)

  return display === id ? name : display
}

/**
 * The name to show for what the log said caused a change: `[from] item: Life
 * Orb` on a damage row, or the reason a Pokémon could not move.
 *
 * Unlike an effect string, this one still has its namespace: the parser's
 * `sourceOf` hands the whole field over, prefix included. So this is the one
 * seam that reads the log's own word for which table to use -- and measured
 * over 1803 replays it is worth reading, because the dex disagreed with it
 * zero times across 108 distinct namespaced values.
 *
 * A bare source goes through the field-condition chain rather than the plain
 * effect one. Measured, of the 28 distinct bare values the two the dex finds
 * ambiguous are `Sandstorm` (weather damage, 869 times) and `confusion`;
 * neither is ever a move being used, so reading a bare source as a condition
 * first is what the corpus says. That chain ends at the item table, so a
 * source that arrives without its `item:` prefix is still named.
 *
 * When nothing names the source the *whole original string* comes back, prefix
 * and all. That is what keeps en byte-identical to what it was, and it is also
 * the honest answer in zh-TW: half-stripping `item: Staraptite` to
 * `Staraptite` would drop the only information the line had left.
 */
export function sourceDisplayName(from: string, locale: string): string {
  const prefix = NAMESPACED.exec(from)
  if (prefix === null) return fieldConditionDisplayName(from, locale)

  const name = from.slice(prefix[0].length)
  const named =
    prefix[1] === 'move'
      ? moveDisplayName(name, locale)
      : prefix[1] === 'ability'
        ? abilityDisplayName(name, locale)
        : prefix[1] === 'item'
          ? itemDisplayName(name, locale)
          : speciesSourceName(name, locale)

  return named === name ? from : named
}

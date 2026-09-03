import { toID } from 'replay-parser'
import type { BattleTimeline, SideId, TimelineEvent } from 'replay-parser'

/**
 * What was standing on the field at the end of each turn.
 *
 * The timeline says what happened; this says what the state was afterwards —
 * the burn a Pokémon is still carrying, the Intimidate drop that has not worn
 * off, the Tailwind still up. Without it the drawer shows a log and leaves the
 * reader to accumulate it in their head (battle timeline design document §4).
 *
 * Not only the field: everyone who has been on it is here, because "how much
 * has that one got left" and "how many have they got left" are the same
 * question a turn late (#90).
 *
 * Everything here comes off events the log actually sent. Nothing is inferred:
 * a state this cannot derive is left `null` rather than guessed.
 */

/** One Pokémon as it stood at the end of a turn, wherever it was standing. */
export interface PokemonState {
  side: SideId
  /** The forme it was in at the time, as the log showed it. */
  species: string
  /** Percent of its HP left, or null when nothing has said. */
  hp: number | null
  status: string | null
  /** Only the stats that are not at zero, so nothing renders `atk 0`. */
  boosts: Record<string, number>
  /**
   * The lasting effects it is carrying — a Substitute, Leech Seed, Taunt,
   * confusion — in the order the log put them on. Lost on the way out, like
   * the stat changes, so this is always empty off the field.
   */
  volatiles: string[]
  teraType: string | null
  fainted: boolean
}

/** One Pokémon on the field, and the square it is on. */
export interface FieldSlot extends PokemonState {
  /** The field position it was standing on, e.g. `p1a`. */
  position: string
}

export interface FieldSnapshot {
  /** The turn this is the end of. 0 is the lead. */
  turn: number
  /** Everyone on the field, in position order. */
  slots: FieldSlot[]
  /**
   * Everyone who has been on the field and is not on it now, in the order they
   * first appeared — the ones that were switched out, and the ones that
   * fainted and have since been replaced.
   *
   * Their HP and their status are the ones they left on: nothing off the field
   * takes damage, so the last thing the log said about them still holds. Their
   * stat changes are gone, which is the rule rather than an omission. What a
   * side registered and never sent out is not here at all — that is `battles`'
   * team signature, not the log's.
   */
  offField: PokemonState[]
  screens: Record<SideId, string[]>
  /**
   * The effects on the whole field, both sides of it — Trick Room, a terrain —
   * in the order they went up, and gone from the turn the log lifted them.
   * Neither side's, so they are not under `screens`.
   */
  fieldEffects: string[]
  /**
   * The weather standing right now, as the log spelled it, or null when there
   * is none. One value rather than a list: there is only ever one weather, and
   * a new one replaces the old one rather than joining it.
   */
  weather: string | null
  /**
   * The abilities in effect across the whole field — an aura, a Ruin, a
   * Neutralizing Gas — in the order their holders first appeared.
   *
   * Whole-field like `fieldEffects`, but held up by one Pokémon rather than by
   * the field itself: gone the moment its holder leaves or falls. Said once
   * however many holders there are, because what the reader needs is whether
   * it is up.
   */
  fieldAbilities: string[]
}

/**
 * The abilities that stand on the whole field for as long as their holder is
 * out, as opposed to the ones that fire once and are over — Intimidate, Trace,
 * Speed Boost — which `|-ability|` announces in exactly the same shape.
 *
 * Hand-written, because no upstream carries the distinction: `@pkmn/dex` has
 * no whole-field flag on an ability, so unlike `battle-only-formes` or
 * `ambiguous-move-ids` there is nothing here to re-derive a table from. Ten
 * names and a reason beat a generated guess.
 *
 * Air Lock and Cloud Nine earn their place from the weather chip beside them:
 * snow with an Air Lock out is snow that does nothing, and the row would
 * otherwise show only the half of that which misleads.
 *
 * One taken off a holder that stays out — Gastro Acid, Skill Swap, Mummy —
 * goes when `-endability` says it does (#120).
 */
const FIELD_ABILITIES = new Set(
  [
    'Fairy Aura',
    'Dark Aura',
    'Aura Break',
    'Beads of Ruin',
    'Sword of Ruin',
    'Tablets of Ruin',
    'Vessel of Ruin',
    'Neutralizing Gas',
    'Air Lock',
    'Cloud Nine',
  ].map(toID),
)

/** The one that turns the others off while it is out. */
const NEUTRALIZING_GAS = toID('Neutralizing Gas')

/**
 * State is kept per Pokémon rather than per position, because that is what the
 * game does: a stat drop belongs to the Pokémon that took it and is lost when
 * it leaves the field, while a terastallization is for the rest of the game.
 * An Ally Switch then needs no special case — the Pokémon carries its state to
 * the square it moved to.
 *
 * A Pokémon is identified by its side and the name its trainer gave it, which
 * is all most protocol lines carry. An Illusion is therefore tracked as
 * whoever it was pretending to be, which is also what was on screen; `replace`
 * hands that state over to the Pokémon it turned out to be.
 *
 * The limit of that key, now that the count of who is left rests on it: two
 * Pokémon of one side wearing the same name at once are one body here. An
 * Illusion that never breaks — it wore an ally's name while that ally was out
 * too, or it fainted to poison, which does not break it — is the only way to
 * get there, and reading it right needs an identity per appearance rather than
 * per name. Not reachable in any measured replay, and not fixed here.
 */
interface Body {
  side: SideId
  species: string
  hp: number | null
  status: string | null
  boosts: Map<string, number>
  /** A set, because the log can start one that is already on (measured). */
  volatiles: Set<string>
  teraType: string | null
  fainted: boolean
  /** The whole-field ability this one announced, or null. */
  fieldAbility: string | null
}

/** Gives a body a new key in the place it already holds, order and all. */
function rename(bodies: Map<string, Body>, from: string, to: string, body: Body): void {
  const renamed = [...bodies].map(([key, value]) => (key === from ? [to, body] : [key, value]))

  bodies.clear()
  for (const [key, value] of renamed as [string, Body][]) bodies.set(key, value)
}

type Combatant = Extract<TimelineEvent, { kind: 'faint' }>['pokemon']

function keyOf(pokemon: Combatant): string {
  return `${pokemon.side}:${pokemon.nickname}`
}

function positionOf(event: TimelineEvent): Combatant | null {
  if ('pokemon' in event) return event.pokemon
  if ('actor' in event) return event.actor

  return null
}

export function fieldSnapshots(timeline: BattleTimeline): FieldSnapshot[] {
  /** Every Pokémon that has been on the field, by side and nickname. */
  const bodies = new Map<string, Body>()
  /** Who is standing where. A fainted Pokémon stays until it is replaced. */
  const standing = new Map<string, string>()
  const screens: Record<SideId, Set<string>> = { p1: new Set(), p2: new Set() }
  /** What is on the whole field: Trick Room, a terrain. */
  const fieldEffects = new Set<string>()
  /** The weather, of which there is at most one. */
  let weather: string | null = null

  function bodyAt(event: TimelineEvent): Body | null {
    const pokemon = positionOf(event)
    if (!pokemon) return null

    const key = standing.get(pokemon.position)

    return key ? (bodies.get(key) ?? null) : null
  }

  function enter(event: Extract<TimelineEvent, { kind: 'switch' }>): void {
    const { pokemon, how } = event
    const key = keyOf(pokemon)
    const leaving = standing.get(pokemon.position)
    const before = leaving ? bodies.get(leaving) : undefined

    if (how === 'replace' && before && leaving) {
      // The Illusion is up: the same body is still there, under its real name.
      // Renamed where it stands rather than deleted and re-added, so that the
      // order everyone first appeared in — which is the order they are drawn
      // in once they are off the field — survives the reveal.
      rename(bodies, leaving, key, { ...before, species: pokemon.species })
      standing.set(pokemon.position, key)
      return
    }

    // Whoever was there is gone, and its stat changes and volatiles with it.
    if (before) {
      before.boosts.clear()
      before.volatiles.clear()
    }

    const returning = bodies.get(key)
    bodies.set(key, {
      side: pokemon.side,
      species: pokemon.species,
      hp: event.hp,
      status: event.status,
      boosts: new Map(),
      volatiles: new Set(),
      // Terastallizing is announced once and lasts the game, so it survives a
      // trip to the bench.
      teraType: returning?.teraType ?? null,
      // Not carried back from the bench the way the Tera type is: an arrival
      // can only ever set this, so a stale one would never be cleared — and a
      // Porygon2 that traced Fairy Aura can come back having traced Intimidate.
      // Everything in `FIELD_ABILITIES` announces itself on arrival.
      fieldAbility: null,
      fainted: false,
    })
    standing.set(pokemon.position, key)
  }

  function apply(event: TimelineEvent): void {
    if (event.kind === 'switch') {
      enter(event)
      return
    }

    if (event.kind === 'sideEffect') {
      const side = screens[event.side]
      if (event.phase === 'start') side.add(event.effect)
      else side.delete(event.effect)
      return
    }

    if (event.kind === 'weather') {
      // `|-weather|none` is the log saying there is none, not a weather by
      // that name. The `[upkeep]` line every turn re-sends the one standing,
      // which lands on the same value.
      // A line with nothing on it is not a weather either: the parser hands
      // over `''` for a truncated `|-weather|`, and an empty chip under the
      // field's label is worse than no row.
      weather = event.weather === 'none' || event.weather === '' ? null : event.weather
      return
    }

    if (event.kind === 'fieldEffect') {
      if (event.phase === 'start') fieldEffects.add(event.effect)
      else fieldEffects.delete(event.effect)
      return
    }

    const body = bodyAt(event)
    if (!body) return

    switch (event.kind) {
      case 'damage':
      case 'heal':
        body.hp = event.hpAfter
        break
      case 'status':
        body.status = event.status
        break
      case 'cureStatus':
        body.status = null
        break
      case 'boost':
        body.boosts.set(event.stat, (body.boosts.get(event.stat) ?? 0) + event.stages)
        break
      case 'ability':
        if (FIELD_ABILITIES.has(toID(event.ability))) body.fieldAbility = event.ability
        break
      case 'endAbility':
        // Whatever the line named, this Pokémon has lost the ability it had.
        // The name is not checked against what is held: a body can only ever
        // be holding up the one, and the log leaves the name out sometimes.
        body.fieldAbility = null
        break
      case 'volatile':
        if (event.phase === 'start') body.volatiles.add(event.effect)
        else body.volatiles.delete(event.effect)
        break
      case 'terastallize':
        body.teraType = event.teraType
        break
      case 'formeChange':
        body.species = event.species
        break
      case 'faint':
        body.fainted = true
        body.hp = 0
        body.boosts.clear()
        body.volatiles.clear()
        break
      case 'swap': {
        // The log reports the move of one Pokémon, so the ally that was traded
        // with is moved here rather than waiting for an event of its own.
        const moved = keyOf(event.pokemon)
        if (standing.get(event.from) !== moved) break

        const ally = standing.get(event.pokemon.position)
        standing.set(event.pokemon.position, moved)

        if (ally === undefined || ally === moved) standing.delete(event.from)
        else standing.set(event.from, ally)
        break
      }
    }
  }

  function stateOf(body: Body): PokemonState {
    return {
      side: body.side,
      species: body.species,
      hp: body.hp,
      status: body.status,
      boosts: Object.fromEntries([...body.boosts].filter(([, stages]) => stages !== 0)),
      volatiles: [...body.volatiles],
      teraType: body.teraType,
      fainted: body.fainted,
    }
  }

  function snapshot(turn: number): FieldSnapshot {
    const slots = [...standing]
      .toSorted(([a], [b]) => (a < b ? -1 : 1))
      .flatMap<FieldSlot>(([position, key]) => {
        const body = bodies.get(key)

        return body ? [{ position, ...stateOf(body) }] : []
      })

    // Whoever is standing somewhere is on the field and nowhere else. An
    // Illusion is one body under two names, and `enter` has already dropped
    // the name it was wearing, so it cannot be in both.
    const onField = new Set(standing.values())
    const offField = [...bodies]
      .filter(([key]) => !onField.has(key))
      .map(([, body]) => stateOf(body))

    // Only what a standing, living holder is holding up: an aura leaves with
    // its Pokémon, and a fainted one keeps its square until the switch without
    // keeping anything else.
    const standingAbilities = new Set(
      [...bodies]
        .filter(([key, body]) => onField.has(key) && !body.fainted)
        .flatMap(([, body]) => (body.fieldAbility === null ? [] : [body.fieldAbility])),
    )

    // A Neutralizing Gas switches every other ability off while it is out, so
    // a Ruin chip beside it would be two contradictory claims on one row.
    const gas = [...standingAbilities].find((name) => toID(name) === NEUTRALIZING_GAS)
    const fieldAbilities = gas === undefined ? standingAbilities : new Set([gas])

    return {
      turn,
      slots,
      offField,
      screens: { p1: [...screens.p1], p2: [...screens.p2] },
      fieldEffects: [...fieldEffects],
      weather,
      fieldAbilities: [...fieldAbilities],
    }
  }

  return timeline.turns.map((turn) => {
    for (const event of turn.events) apply(event)

    return snapshot(turn.number)
  })
}

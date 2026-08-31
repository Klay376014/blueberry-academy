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
}

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
  teraType: string | null
  fainted: boolean
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

    // Whoever was there is gone, and its stat changes with it.
    if (before) before.boosts.clear()

    const returning = bodies.get(key)
    bodies.set(key, {
      side: pokemon.side,
      species: pokemon.species,
      hp: event.hp,
      status: event.status,
      boosts: new Map(),
      // Terastallizing is announced once and lasts the game, so it survives a
      // trip to the bench.
      teraType: returning?.teraType ?? null,
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

    return { turn, slots, offField, screens: { p1: [...screens.p1], p2: [...screens.p2] } }
  }

  return timeline.turns.map((turn) => {
    for (const event of turn.events) apply(event)

    return snapshot(turn.number)
  })
}

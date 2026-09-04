import type { ProtocolLine } from './protocol.ts'
import type { SideId } from './replay.ts'
import { speciesOfDetails, toID } from './species.ts'

/**
 * A Pokémon as it appeared on the field at the moment of an event.
 *
 * `species` is what the log showed at the time, in the forme it was in — a Mega
 * stays a Mega here, because the timeline describes what happened rather than
 * who the Pokémon is. Identity is `ParsedBattle`'s job.
 */
export interface Combatant {
  /** The field position, e.g. `p1a`. */
  position: string
  side: SideId
  /** As the trainer named it, which is all most protocol lines carry. */
  nickname: string
  /** Taken from the latest appearance at this position. */
  species: string
  /**
   * Who this really was, filled in once `|replace|` revealed an Illusion. The
   * displayed `species` is left as the lie it was at the time.
   */
  revealedSpecies: string | null
}

/** How a Pokémon came to be on the field. */
export type Appearance = 'switch' | 'drag' | 'replace'

export type HitResult = 'crit' | 'supereffective' | 'resisted' | 'immune'

const HIT_RESULTS = new Map<string, HitResult>([
  ['-crit', 'crit'],
  ['-supereffective', 'supereffective'],
  ['-resisted', 'resisted'],
  ['-immune', 'immune'],
])

/**
 * The `-start` subtypes that are not a lasting state on one Pokémon, and so
 * are not volatiles however much they share a protocol line with them.
 *
 * `-start` is a grab-bag. Two of its shapes never get an `-end` while their
 * Pokémon is out: Protean and Libero re-announce `typechange` on every move
 * they make, and Perish Song counts down with a fresh `-start` per turn
 * (`perish3`, `perish2`, …), as Stockpile and Supreme Overlord do with their
 * own counters. Read as volatiles they pile up state that nothing ever takes
 * off, under ids no dex has a name for.
 *
 * Kept as `unknown` rather than dropped: the type a Protean turned into and
 * the turns left on a Perish count are both real, and a counter needs a state
 * that replaces rather than one that accumulates. Neither is this ticket's
 * (#120).
 */
const NOT_VOLATILE = /^(typechange|typeadd|perish\d|stockpile\d|fallen\d)$/

export type TimelineEvent =
  /**
   * `hp` and `status` are what the arriving Pokémon brought with it, which is
   * the only place the log says so: a Pokémon that went out poisoned comes
   * back with `97/100 tox` in the HP field and no `|-status|` line of its own.
   *
   * `replaced` is whoever was standing there — the log names only the arrival,
   * and who left is the position's previous occupant. Null for the lead, and
   * for anyone else who is the first at their position.
   */
  | {
      kind: 'switch'
      how: Appearance
      pokemon: Combatant
      hp: number | null
      status: string | null
      replaced: Combatant | null
    }
  | { kind: 'move'; actor: Combatant; move: string; targets: Combatant[] }
  /** A Pokémon that lost its action to paralysis, flinching, a full belly. */
  | { kind: 'cant'; pokemon: Combatant; reason: string }
  | HealthChange
  | { kind: 'faint'; pokemon: Combatant }
  /** A forme change on the field: Mega, Primal, Palafin, Zen Mode. */
  | { kind: 'formeChange'; pokemon: Combatant; species: string }
  | { kind: 'mega'; pokemon: Combatant; stone: string }
  | { kind: 'terastallize'; pokemon: Combatant; teraType: string }
  | { kind: 'status'; pokemon: Combatant; status: string }
  /** A status cured or worn off — the inverse of `status`, for anything holding the current one. */
  | { kind: 'cureStatus'; pokemon: Combatant; status: string }
  /** A stat change, in stages. Negative for a drop. */
  | { kind: 'boost'; pokemon: Combatant; stat: string; stages: number }
  /**
   * Every stat change on the field gone at once: Haze. Nobody's, so it carries
   * no Pokémon — the line itself carries none either (#123).
   */
  | { kind: 'clearAllBoosts' }
  /**
   * One Pokémon's stat changes gone: Clear Smog, or — with `only: 'positive'`
   * — the raised ones only, which is Spectral Thief taking them.
   */
  | { kind: 'clearBoosts'; pokemon: Combatant; only: 'positive' | null }
  /** A stat change written outright rather than added to: Belly Drum's +6. */
  | { kind: 'setBoost'; pokemon: Combatant; stat: string; stages: number }
  /** Every stat change turned the other way round: Topsy-Turvy. */
  | { kind: 'invertBoosts'; pokemon: Combatant }
  /**
   * Two Pokémon trading stat changes: Heart Swap, Guard Swap, Power Swap.
   * `stats` is the ones the line named, and empty for all of them — Heart Swap
   * leaves the column out (#123).
   */
  | { kind: 'swapBoosts'; pokemon: Combatant; target: Combatant; stats: string[] }
  /** Psych Up: `pokemon` takes on the stat changes `target` is holding. */
  | { kind: 'copyBoosts'; pokemon: Combatant; target: Combatant }
  | { kind: 'weather'; weather: string; from: string | null }
  /** How a hit landed, as Showdown announced it. */
  | { kind: 'hitResult'; pokemon: Combatant; result: HitResult }
  | { kind: 'miss'; actor: Combatant; target: Combatant | null }
  | { kind: 'fail'; pokemon: Combatant }
  /** Ally Switch: the pokemon now stands where `from` used to be occupied. */
  | { kind: 'swap'; pokemon: Combatant; from: string }
  /** An effect on one Pokémon: Protect going up, then Protect stopping a move. */
  | { kind: 'effect'; pokemon: Combatant; effect: string; phase: 'start' | 'activate' }
  /**
   * A lasting effect on one Pokémon, on and then off: Leech Seed, a Substitute,
   * Taunt, confusion, a partial trap.
   *
   * A kind of its own rather than another phase of `effect`, because the pair
   * of protocol lines is a different pair: `-singleturn` is over by the end of
   * the turn and `-activate` the moment it fires, while this one holds until
   * the log says otherwise. Whatever draws state has to be able to tell them
   * apart — a Protect that lasted would be a lie about the field (#120).
   */
  | { kind: 'volatile'; pokemon: Combatant; effect: string; phase: 'start' | 'end' }
  /** An effect on one side of the field: Reflect, Light Screen, Tailwind. */
  | { kind: 'sideEffect'; side: SideId; effect: string; phase: 'start' | 'end' }
  /**
   * An effect on the whole field, both sides of it: Trick Room, a terrain,
   * Gravity. `from` and `source` are only ever what the log itself named —
   * measured, a Trick Room carries `[of]` and no `[from]`, a terrain from a
   * move carries neither, and one from an ability carries both. Nothing here
   * looks back at the last move to fill a gap.
   */
  | {
      kind: 'fieldEffect'
      effect: string
      phase: 'start' | 'end'
      from: string | null
      source: Combatant | null
    }
  | { kind: 'endItem'; pokemon: Combatant; item: string }
  | { kind: 'ability'; pokemon: Combatant; ability: string }
  /**
   * An ability taken off a Pokémon that is still out: Gastro Acid, Skill Swap,
   * Mummy. `ability` is what the line named, which is usually the ability and
   * is sometimes nothing at all — the event says what the log said.
   */
  | { kind: 'endAbility'; pokemon: Combatant; ability: string }
  /** A turn spent recharging after Hyper Beam and its like. */
  | { kind: 'mustRecharge'; pokemon: Combatant }
  /** A line this parser does not read, kept verbatim rather than dropped. */
  | { kind: 'unknown'; raw: string }

/**
 * A change in HP. The log reports what is left, so the drop is worked out from
 * the running total. `from` is only ever what the log itself named: burn, an
 * item, an ability. Move damage carries no source, and inventing one from the
 * nearest `|move|` is exactly the attribution this parser does not do.
 */
export interface HealthChange {
  kind: 'damage' | 'heal'
  pokemon: Combatant
  hpBefore: number | null
  hpAfter: number
  hpDelta: number | null
  from: string | null
  /**
   * Showdown marked this one `[silent]` and drew nothing for it: a Regenerator
   * heal on the way out, a Rest. The number is still true — and for a Pokémon
   * on its way off the field it is the last true one anybody gets — so it is
   * kept and flagged rather than dropped. Nothing that draws the log may draw
   * it, or the timeline stops matching what was played (#90).
   */
  silent: boolean
}

export interface TimelineTurn {
  /** 0 is the opening, before Showdown sent `|turn|1`. */
  number: number
  /** ISO-8601 instant from the turn's `|t:|` line, or null when it had none. */
  startedAt: string | null
  events: TimelineEvent[]
}

/** A replay as a flat sequence of events per turn. Never stored; parsed on demand. */
export interface BattleTimeline {
  turns: TimelineTurn[]
}

/**
 * Walks a tokenized log into turns of events.
 *
 * Damaged, healed and fainted Pokémon are described by what the log said, never
 * by what caused it: `|-damage|` carries no attribution for move damage, and
 * guessing it from the nearest `|move|` is the KO attribution this project has
 * declined twice. A broken or truncated log yields the turns that did parse.
 */
export function buildTimeline(lines: ProtocolLine[]): BattleTimeline {
  const turns: TimelineTurn[] = [emptyTurn(0)]
  /** Who is standing where, so that later lines carrying only a nickname resolve. */
  const field = new Map<string, Combatant>()
  /** The running HP percentage of each position, which damage is measured against. */
  const health = new Map<string, number>()
  /**
   * Every combatant object used at a position since whoever is there arrived.
   * `|replace|` reveals that all of them were an Illusion, and each is told who
   * it really was — the displayed species is never rewritten.
   */
  const sinceArrival = new Map<string, Combatant[]>()

  const currentTurn = (): TimelineTurn => turns[turns.length - 1] as TimelineTurn
  /**
   * Everything before |start| is the preamble — players, rules, team preview —
   * which `ParsedBattle` already owns. The timeline begins where the battle does.
   */
  let started = false
  const push = (event: TimelineEvent): void => {
    currentTurn().events.push(event)
  }

  for (const { type, args } of lines) {
    if (!started) {
      if (type === 'start') started = true
      continue
    }
    // Showdown sends these for the client's own bookkeeping and shows none of
    // them; a timeline that rendered them would not match what was played. The
    // HP they carry is still real, though — a silent Rest that went unrecorded
    // would turn the next hit into a gain — so the health lines go through as
    // events that say they are silent, and everything else is dropped here.
    const silent = args.includes('[silent]')
    if (silent && type !== '-damage' && type !== '-heal') continue
    // A bare `|` spaces the log out and says nothing. `||<text>` is a message
    // and is kept, as unknown, like any other line this parser does not read.
    if (type === '' && args.length === 0) continue

    switch (type) {
      case 'turn': {
        const number = Number(args[0])
        if (Number.isFinite(number)) turns.push(emptyTurn(number))
        break
      }

      case 't:': {
        // The first |t:| after a |turn| is when that turn began; a later one is
        // a timestamp on something within it.
        if (currentTurn().startedAt === null) {
          currentTurn().startedAt = instantOf(args[0] ?? '')
        }
        break
      }

      case 'move': {
        const actor = occupant(field, args[0] ?? '')
        if (!actor) break
        push({
          kind: 'move',
          actor,
          move: args[1] ?? '',
          // A spread move names its targets in a kwarg; a single-target move
          // names one in the third column. Both end up as a list, because a
          // single target is just a spread of one.
          targets: targetsOf(field, args),
        })
        break
      }

      case 'cant': {
        const pokemon = occupant(field, args[0] ?? '')
        if (!pokemon) break
        push({ kind: 'cant', pokemon, reason: args[1] ?? '' })
        break
      }

      case 'switch':
      case 'drag':
      case 'replace': {
        const position = positionOf(args[0] ?? '')
        const leaving = field.get(position) ?? null
        if (type === 'replace') {
          const truth = speciesOfDetails(args[1] ?? '')
          for (const worn of sinceArrival.get(position) ?? []) worn.revealedSpecies = truth
        }
        const pokemon = enter(field, args[0] ?? '', args[1] ?? '')
        if (!pokemon) break
        // The arriving Pokémon brings its own HP, so a position left hurt by
        // the last occupant does not make this one look healed.
        const hp = healthOf(args[2] ?? '')
        if (hp !== null) health.set(pokemon.position, hp)
        sinceArrival.set(pokemon.position, [pokemon])
        push({
          kind: 'switch',
          how: type,
          pokemon,
          hp,
          status: statusOf(args[2] ?? ''),
          replaced: leaving,
        })
        break
      }

      case '-damage':
      case '-heal': {
        const pokemon = occupant(field, args[0] ?? '')
        const hpAfter = healthOf(args[1] ?? '')
        if (!pokemon || hpAfter === null) break
        const hpBefore = health.get(pokemon.position) ?? null
        health.set(pokemon.position, hpAfter)
        push({
          kind: type === '-damage' ? 'damage' : 'heal',
          pokemon,
          hpBefore,
          hpAfter,
          hpDelta: hpBefore === null ? null : hpAfter - hpBefore,
          from: sourceOf(args),
          silent,
        })
        break
      }

      case 'detailschange':
      case '-formechange': {
        const previous = occupant(field, args[0] ?? '')
        if (!previous) break
        // A new object, so the events before the change keep showing the forme
        // that was on the field when they happened.
        const pokemon: Combatant = { ...previous, species: speciesOfDetails(args[1] ?? '') }
        field.set(pokemon.position, pokemon)
        sinceArrival.get(pokemon.position)?.push(pokemon)
        push({ kind: 'formeChange', pokemon, species: pokemon.species })
        break
      }

      case '-mega': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'mega', pokemon, stone: args[2] ?? '' })
        break
      }

      case '-terastallize': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'terastallize', pokemon, teraType: args[1] ?? '' })
        break
      }

      case '-status':
      case '-curestatus': {
        const pokemon = occupant(field, args[0] ?? '')
        if (!pokemon) break
        push({
          kind: type === '-status' ? 'status' : 'cureStatus',
          pokemon,
          status: args[1] ?? '',
        })
        break
      }

      case '-boost':
      case '-unboost': {
        const pokemon = occupant(field, args[0] ?? '')
        const stages = Number(args[2])
        if (!pokemon || !Number.isFinite(stages)) break
        push({
          kind: 'boost',
          pokemon,
          stat: args[1] ?? '',
          stages: type === '-boost' ? stages : -stages,
        })
        break
      }

      // The lines that rewrite stat changes rather than add to them. Without
      // them a Haze leaves its +2 on the bar for the rest of the game, which
      // is the one thing the turn summary said wrongly rather than not at all
      // (#123).
      //
      // `-clearnegativeboost` (White Herb) is deliberately not among them: its
      // line always carries `[silent]`, so the rule above has already dropped
      // it and Showdown draws nothing for it either. That is the rule working,
      // not a line going unread.
      //
      // The one shape that would not be silent is a gen 7 Z-move's `[zeffect]`,
      // and #123 left it out of scope rather than reading it unverified. Only a
      // gen 7 replay can reach it, and this project imports gen 9.
      case '-clearallboost':
        push({ kind: 'clearAllBoosts' })
        break

      case '-clearboost':
      case '-clearpositiveboost': {
        // Both name the Pokémon that loses them first. `-clearpositiveboost`
        // goes on to name who took them and what did it; the row's subject is
        // the one that lost them either way, so neither is read.
        const pokemon = occupant(field, args[0] ?? '')
        if (!pokemon) break
        push({
          kind: 'clearBoosts',
          pokemon,
          only: type === '-clearpositiveboost' ? 'positive' : null,
        })
        break
      }

      case '-setboost': {
        const pokemon = occupant(field, args[0] ?? '')
        const stages = Number(args[2])
        if (!pokemon || !Number.isFinite(stages)) break
        // Held to the six stages the game has. The line can name more than
        // that — Anger Point announces its maximum as 12, which Showdown's own
        // client reads as "maximised" rather than as a number — and a stat
        // standing at +12 is a state no battle can be in, so what would reach
        // the bar and the row is a lie rather than a bigger truth.
        push({ kind: 'setBoost', pokemon, stat: args[1] ?? '', stages: heldToStages(stages) })
        break
      }

      case '-invertboost': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'invertBoosts', pokemon })
        break
      }

      case '-swapboost':
      case '-copyboost': {
        // Two Pokémon on one line, and the one named first is the one the row
        // is about: the Psych Up user copies, the swapper trades.
        const pokemon = occupant(field, args[0] ?? '')
        const target = occupant(field, args[1] ?? '')
        if (!pokemon || !target) break
        push(
          type === '-copyboost'
            ? { kind: 'copyBoosts', pokemon, target }
            : { kind: 'swapBoosts', pokemon, target, stats: statsOf(args[2] ?? '') },
        )
        break
      }

      case '-weather':
        push({ kind: 'weather', weather: args[0] ?? '', from: sourceOf(args) })
        break

      case '-crit':
      case '-supereffective':
      case '-resisted':
      case '-immune': {
        const pokemon = occupant(field, args[0] ?? '')
        const result = HIT_RESULTS.get(type)
        if (pokemon && result) push({ kind: 'hitResult', pokemon, result })
        break
      }

      case '-miss': {
        const actor = occupant(field, args[0] ?? '')
        if (actor) push({ kind: 'miss', actor, target: occupant(field, args[1] ?? '') })
        break
      }

      case '-fail': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'fail', pokemon })
        break
      }

      case 'swap': {
        // Ally Switch. The two positions trade occupants, and every later line
        // is addressed to the new layout.
        const from = positionOf(args[0] ?? '')
        const to = slotOf(from, args[1] ?? '')
        const moved = swap({ field, health, sinceArrival }, from, to)
        if (moved[0]) push({ kind: 'swap', pokemon: moved[0], from })
        break
      }

      case '-singleturn':
      case '-activate': {
        const pokemon = occupant(field, args[0] ?? '')
        if (!pokemon) break
        push({
          kind: 'effect',
          pokemon,
          effect: effectNameOf(args[1] ?? ''),
          phase: type === '-singleturn' ? 'start' : 'activate',
        })
        break
      }

      case '-start':
      case '-end': {
        if (NOT_VOLATILE.test(toID(args[1] ?? ''))) {
          push({ kind: 'unknown', raw: rawOf(type, args) })
          break
        }

        // The `move:` prefix comes and goes on the same pair — measured over
        // the fixtures, `|-start|p1a: Big Boy|move: Taunt` against
        // `|-start|p1a: Gliscor|Substitute` — so it is stripped like every
        // other effect name. The silent ones are already gone by here: those
        // are Showdown's own bookkeeping and it draws none of them.
        const pokemon = occupant(field, args[0] ?? '')
        if (!pokemon) break
        push({
          kind: 'volatile',
          pokemon,
          effect: effectNameOf(args[1] ?? ''),
          phase: type === '-start' ? 'start' : 'end',
        })
        break
      }

      case '-endability': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'endAbility', pokemon, ability: args[1] ?? '' })
        break
      }

      case '-sidestart':
      case '-sideend': {
        const side = sideOf(args[0] ?? '')
        if (side === null) break
        push({
          kind: 'sideEffect',
          side,
          effect: effectNameOf(args[1] ?? ''),
          phase: type === '-sidestart' ? 'start' : 'end',
        })
        break
      }

      case '-fieldstart':
      case '-fieldend': {
        // Trick Room and the terrains. The `move:` prefix is on some of these
        // lines and not others — measured, `|-fieldend|move: Trick Room` and
        // `|-fieldend|Misty Terrain` in two ladder games — so the name is
        // stripped the way every other effect name is.
        push({
          kind: 'fieldEffect',
          effect: effectNameOf(args[0] ?? ''),
          phase: type === '-fieldstart' ? 'start' : 'end',
          from: sourceOf(args),
          source: originOf(field, args),
        })
        break
      }

      case '-enditem': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'endItem', pokemon, item: args[1] ?? '' })
        break
      }

      case '-ability': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'ability', pokemon, ability: args[1] ?? '' })
        break
      }

      case '-mustrecharge': {
        const pokemon = occupant(field, args[0] ?? '')
        if (pokemon) push({ kind: 'mustRecharge', pokemon })
        break
      }

      case 'faint': {
        const pokemon = occupant(field, args[0] ?? '')
        // |faint| never names a culprit: the cause may be recoil, an item, an
        // ability, weather or status. The event says who fell, nothing more.
        if (pokemon) push({ kind: 'faint', pokemon })
        break
      }

      default:
        push({ kind: 'unknown', raw: rawOf(type, args) })
    }
  }

  return { turns }
}

function emptyTurn(number: number): TimelineTurn {
  return { number, startedAt: null, events: [] }
}

/**
 * Who a protocol argument refers to. Most lines carry only `p1a: <nickname>`,
 * so the species has to come from the latest appearance at that position.
 */
function occupant(field: Map<string, Combatant>, arg: string): Combatant | null {
  return field.get(positionOf(arg)) ?? null
}

/** The `[spread]` list when there is one, otherwise the single named target. */
function targetsOf(field: Map<string, Combatant>, args: string[]): Combatant[] {
  const spread = args.find((arg) => arg.startsWith('[spread]'))
  if (spread !== undefined) {
    return spread
      .slice('[spread]'.length)
      .split(',')
      .map((position) => field.get(position.trim()) ?? null)
      .filter((pokemon): pokemon is Combatant => pokemon !== null)
  }

  const target = occupant(field, args[2] ?? '')
  return target ? [target] : []
}

/** Records who now stands at a position, and returns them. */
function enter(
  field: Map<string, Combatant>,
  positionArg: string,
  details: string,
): Combatant | null {
  const position = positionOf(positionArg)
  const side = sideOf(position)
  if (side === null) return null

  const pokemon: Combatant = {
    position,
    side,
    nickname: nicknameOf(positionArg),
    species: speciesOfDetails(details),
    revealedSpecies: null,
  }
  field.set(position, pokemon)
  return pokemon
}

/**
 * The instant a `|t:|` names, or null when it is not one a date can hold. A
 * timeline is rendered at page load; nothing in it may throw.
 */
function instantOf(seconds: string): string | null {
  const at = new Date(Number(seconds) * 1000)
  return Number.isNaN(at.getTime()) ? null : at.toISOString()
}

/** The position a `|swap|` slot index names, e.g. `1` at `p1a` is `p1b`. */
function slotOf(from: string, slot: string): string {
  const index = Number(slot)
  if (!Number.isInteger(index) || index < 0) return from
  return from.slice(0, 2) + String.fromCharCode('a'.charCodeAt(0) + index)
}

/** Trades two keys of a map, leaving a key absent if it was absent before. */
function swapEntries<T>(map: Map<string, T>, from: string, to: string): void {
  const at = [map.get(from), map.get(to)]
  map.delete(from)
  map.delete(to)
  if (at[0] !== undefined) map.set(to, at[0])
  if (at[1] !== undefined) map.set(from, at[1])
}

/** Everything keyed by field position, which an Ally Switch moves as a set. */
interface FieldState {
  field: Map<string, Combatant>
  health: Map<string, number>
  sinceArrival: Map<string, Combatant[]>
}

/**
 * Trades the occupants of two positions, and everything tracked against them:
 * the running HP, and the combatants an Illusion reveal has to reach. New
 * combatant objects are made rather than the existing ones edited, so the
 * events from before the swap keep saying where each Pokémon stood at the time.
 */
function swap(state: FieldState, from: string, to: string): Combatant[] {
  if (from === to) return []

  const moved = (
    [
      [from, to],
      [to, from],
    ] as const
  ).flatMap(([origin, destination]) => {
    const pokemon = state.field.get(origin)
    return pokemon ? [{ ...pokemon, position: destination }] : []
  })

  swapEntries(state.field, from, to)
  swapEntries(state.health, from, to)
  swapEntries(state.sinceArrival, from, to)

  for (const pokemon of moved) {
    state.field.set(pokemon.position, pokemon)
    state.sinceArrival.get(pokemon.position)?.push(pokemon)
  }

  return moved
}

/**
 * The percentage out of an HP field. Measured forms: `93/100`, `93/100 brn`,
 * `0 fnt`, and one `50/100g` whose suffix nothing documents — so only the
 * digits before the slash are read, and anything else is ignored.
 */
function healthOf(field: string): number | null {
  const digits = /^\d+/.exec(field.trim())
  return digits ? Number(digits[0]) : null
}

/**
 * The conditions an HP field can carry. A whitelist rather than "whatever
 * follows the digits": `0 fnt` is the field reporting a faint, and one
 * measured field read `50/100g` with a suffix nothing documents.
 */
const STATUSES = new Set(['brn', 'par', 'slp', 'frz', 'psn', 'tox'])

/** The condition an HP field names, e.g. `tox` out of `97/100 tox`. */
function statusOf(field: string): string | null {
  const condition = field.trim().split(/\s+/)[1] ?? ''
  return STATUSES.has(condition) ? condition : null
}

/**
 * The name of an effect, without the kind that sometimes prefixes it. Showdown
 * sends `Reflect` in one line and `move: Light Screen` in the next, and the
 * prefix says nothing a reader needs.
 */
function effectNameOf(effect: string): string {
  return effect.replace(/^(move|ability|item):\s*/, '')
}

/** The stages a stat can stand at, either way. */
const MAX_STAGES = 6

/** A stage count held inside the range the game has for it. */
function heldToStages(stages: number): number {
  return Math.max(-MAX_STAGES, Math.min(MAX_STAGES, Math.trunc(stages)))
}

/**
 * The stats a `-swapboost` named, and an empty list for every stat: Heart Swap
 * trades the lot and leaves the column out, so what stands in its place is the
 * next kwarg rather than a list (#123).
 */
function statsOf(field: string): string[] {
  if (field.startsWith('[')) return []

  return field
    .split(',')
    .map((stat) => stat.trim())
    .filter((stat) => stat !== '')
}

/** What the log said caused a change, e.g. `[from] item: Life Orb`. */
function sourceOf(args: string[]): string | null {
  const from = args.find((arg) => arg.startsWith('[from]'))
  return from === undefined ? null : from.slice('[from]'.length).trim()
}

/**
 * The Pokémon a line named as where an effect came from, e.g.
 * `[of] p2a: Sinistcha`. Measured on `|-fieldstart|move: Trick Room`, which
 * carries this and no `[from]` at all: the only thing the log ever says about
 * who set a Trick Room.
 */
function originOf(field: Map<string, Combatant>, args: string[]): Combatant | null {
  const of = args.find((arg) => arg.startsWith('[of]'))
  return of === undefined ? null : occupant(field, of.slice('[of]'.length).trim())
}

/** `p1a` out of `p1a: Scrafty`. */
function positionOf(arg: string): string {
  return arg.split(':')[0]?.trim() ?? ''
}

/** `Scrafty` out of `p1a: Scrafty`, which is the trainer's name for it. */
function nicknameOf(arg: string): string {
  return arg.split(':').slice(1).join(':').trim()
}

function sideOf(position: string): SideId | null {
  const side = position.slice(0, 2)
  return side === 'p1' || side === 'p2' ? side : null
}

/** The line as Showdown sent it, for the types this parser does not read. */
function rawOf(type: string, args: string[]): string {
  return [`|${type}`, ...args].join('|')
}

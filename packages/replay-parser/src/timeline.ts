import type { ProtocolLine } from './protocol.ts'
import type { SideId } from './replay.ts'
import { speciesOfDetails } from './species.ts'

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
  | { kind: 'weather'; weather: string; from: string | null }
  /** How a hit landed, as Showdown announced it. */
  | { kind: 'hitResult'; pokemon: Combatant; result: HitResult }
  | { kind: 'miss'; actor: Combatant; target: Combatant | null }
  | { kind: 'fail'; pokemon: Combatant }
  /** Ally Switch: the pokemon now stands where `from` used to be occupied. */
  | { kind: 'swap'; pokemon: Combatant; from: string }
  /** An effect on one Pokémon: Protect going up, then Protect stopping a move. */
  | { kind: 'effect'; pokemon: Combatant; effect: string; phase: 'start' | 'activate' }
  /** An effect on one side of the field: Reflect, Light Screen, Tailwind. */
  | { kind: 'sideEffect'; side: SideId; effect: string; phase: 'start' | 'end' }
  | { kind: 'endItem'; pokemon: Combatant; item: string }
  | { kind: 'ability'; pokemon: Combatant; ability: string }
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
    // would turn the next hit into a gain.
    if (args.includes('[silent]')) {
      if (type === '-damage' || type === '-heal') recordHealth(field, health, args)
      continue
    }
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

/** Keeps the running HP current for a line that is not itself shown. */
function recordHealth(
  field: Map<string, Combatant>,
  health: Map<string, number>,
  args: string[],
): void {
  const pokemon = occupant(field, args[0] ?? '')
  const hp = healthOf(args[1] ?? '')
  if (pokemon && hp !== null) health.set(pokemon.position, hp)
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

/** What the log said caused a change, e.g. `[from] item: Life Orb`. */
function sourceOf(args: string[]): string | null {
  const from = args.find((arg) => arg.startsWith('[from]'))
  return from === undefined ? null : from.slice('[from]'.length).trim()
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

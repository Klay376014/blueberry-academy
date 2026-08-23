import type { HealthChange, SideId, TimelineEvent, TimelineTurn } from 'replay-parser'

/**
 * One turn of a battle as the rows the drawer draws.
 *
 * Two rules from the design document (§1, §3) live here rather than in the
 * template. Pokémon are icons and moves are their English names, so nothing a
 * row carries about them is translatable — what is translatable is a `message`
 * key with parameters, which the component hands to `t()`. And a row never
 * claims causality: a move and the damage that followed it are two rows in
 * time order, because the log's `|-damage|` carries no attribution and
 * inventing one is not this project's job.
 */

/** Which glyph a row wears. Semantic, so the icon set can change without this. */
export type RowMark = 'move' | 'switch' | 'health' | 'faint' | 'tera' | 'forme' | 'status' | 'none'

export interface TimelineRow {
  mark: RowMark
  /** Whose Pokémon this is about, or null for something happening to the field. */
  side: SideId | null
  /** The species whose icon leads the row, in the forme it was in at the time. */
  species: string | null
  /** A move's English name. Never translated: it is an identifier. */
  move: string | null
  /** Species of whatever the move was aimed at, for their icons. */
  targets: string[]
  /** A key under `battle.event` in the locale files, with its parameters. */
  message: { key: string; params?: Record<string, string> } | null
  /**
   * Whether the message only repeats what the icon already shows, and so is
   * for a screen reader rather than for the screen. A forme change is the
   * icon changing; the words would read the same every time.
   */
  quiet: boolean
  health: HealthChange | null
  /** A condition to show as a chip, e.g. `brn`. */
  status: string | null
  tone: 'bad' | 'accent' | null
}

/**
 * The events that carry the turn on their own. Everything else is real and
 * subordinate: an ability announcement, a Protect that held, a stat stage.
 */
const MAIN_LINE = new Set<TimelineEvent['kind']>([
  'move',
  'switch',
  'damage',
  'heal',
  'faint',
  'terastallize',
  'formeChange',
  'mega',
  'cant',
  'miss',
  'status',
])

function blank(): TimelineRow {
  return {
    mark: 'none',
    side: null,
    species: null,
    move: null,
    targets: [],
    message: null,
    quiet: false,
    health: null,
    status: null,
    tone: null,
  }
}

/** The row an event becomes, or null for a line nothing should draw. */
export function rowOf(event: TimelineEvent): TimelineRow | null {
  switch (event.kind) {
    case 'move':
      return {
        ...blank(),
        mark: 'move',
        side: event.actor.side,
        species: event.actor.species,
        move: event.move,
        // A move aimed at its own user says nothing an icon would add.
        targets: event.targets
          .filter((target) => target.position !== event.actor.position)
          .map((target) => target.species),
      }

    case 'switch':
      return {
        ...blank(),
        mark: 'switch',
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: event.how === 'replace' ? 'wasAnIllusion' : 'cameIn' },
        status: event.status,
      }

    case 'damage':
    case 'heal':
      return {
        ...blank(),
        mark: 'health',
        side: event.pokemon.side,
        species: event.pokemon.species,
        health: event,
      }

    case 'faint':
      return {
        ...blank(),
        mark: 'faint',
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'fainted' },
        tone: 'bad',
      }

    case 'terastallize':
      return {
        ...blank(),
        mark: 'tera',
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'terastallized', params: { type: event.teraType } },
        tone: 'accent',
      }

    case 'formeChange':
      return {
        ...blank(),
        mark: 'forme',
        side: event.pokemon.side,
        // The forme it became, which is the icon that changes — and that change
        // is the whole event, so the words stay for the screen reader only.
        species: event.species,
        message: { key: 'changedForme' },
        quiet: true,
      }

    case 'mega':
      return {
        ...blank(),
        mark: 'forme',
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'megaEvolved' },
      }

    case 'cant':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'couldNotMove', params: { reason: event.reason } },
      }

    case 'miss':
      return {
        ...blank(),
        side: event.actor.side,
        species: event.actor.species,
        message: { key: 'missed' },
      }

    case 'status':
      return {
        ...blank(),
        mark: 'status',
        side: event.pokemon.side,
        species: event.pokemon.species,
        status: event.status,
      }

    case 'cureStatus':
      return {
        ...blank(),
        mark: 'status',
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'statusCured', params: { status: event.status } },
      }

    case 'boost':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: {
          key: event.stages > 0 ? 'statRose' : 'statFell',
          params: { stat: event.stat, stages: String(Math.abs(event.stages)) },
        },
      }

    case 'effect':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: {
          key: event.phase === 'start' ? 'effectStarted' : 'effectHeld',
          params: { effect: event.effect },
        },
      }

    case 'sideEffect':
      return {
        ...blank(),
        side: event.side,
        message: {
          key: event.phase === 'start' ? 'sideEffectStarted' : 'sideEffectEnded',
          params: { effect: event.effect },
        },
      }

    case 'ability':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'ability', params: { ability: event.ability } },
      }

    case 'endItem':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'lostItem', params: { item: event.item } },
      }

    case 'hitResult':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: `hit.${event.result}` },
      }

    case 'weather':
      return { ...blank(), message: { key: 'weather', params: { weather: event.weather } } }

    case 'fail':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'failed' },
      }

    case 'swap':
      return {
        ...blank(),
        mark: 'switch',
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'swapped' },
      }

    case 'mustRecharge':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: { key: 'mustRecharge' },
      }

    // A line the parser kept but cannot describe. Showing it raw would put
    // `|upkeep` on screen; the parser keeps it so that a raw-log view can be
    // added without touching the parser.
    case 'unknown':
      return null
  }
}

export interface RowOptions {
  /** Whether the supporting events are in, as well as the main line. */
  detailed: boolean
}

/**
 * Whether this event is only how the next one was carried out.
 *
 * A Mega Evolution arrives as `detailschange` and then `-mega`, which is one
 * thing happening: megaing is the event, changing forme is how it is done, and
 * the mega row already carries the new forme's icon. Two rows would make the
 * reader discount one of them.
 */
function isPlumbingFor(events: TimelineEvent[], index: number): boolean {
  const event = events[index]
  const next = events[index + 1]

  return (
    event?.kind === 'formeChange' &&
    next?.kind === 'mega' &&
    next.pokemon.position === event.pokemon.position
  )
}

export function rowsOf(turn: TimelineTurn, { detailed }: RowOptions): TimelineRow[] {
  return turn.events
    .filter(
      (event, index) =>
        (detailed || MAIN_LINE.has(event.kind)) && !isPlumbingFor(turn.events, index),
    )
    .map(rowOf)
    .filter((row): row is TimelineRow => row !== null)
}

/** How many rows the "show the rest of this turn" switch would add. */
export function sidelinedCount(turn: TimelineTurn): number {
  return turn.events.filter((event) => !MAIN_LINE.has(event.kind) && rowOf(event) !== null).length
}

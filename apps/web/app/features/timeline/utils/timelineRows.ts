import { toID } from 'replay-parser'
import type { Combatant, HealthChange, SideId, TimelineEvent, TimelineTurn } from 'replay-parser'

/**
 * One turn of a battle as the rows the drawer draws.
 *
 * Two rules from the design document (§1, §3) live here rather than in the
 * template. A row carries the identifiers the log gave it — a species id, a
 * move's English name — and the components are what put those into the
 * reader's language (ADR-0014, ADR-0015); what a row says in words is a
 * `message` key with parameters, which the component hands to `t()`. And a row never
 * claims causality: a move and the damage that followed it are two rows in
 * time order, because the log's `|-damage|` carries no attribution and
 * inventing one is not this project's job.
 */

/** Which glyph a row wears. Semantic, so the icon set can change without this. */
export type RowMark = 'move' | 'switch' | 'health' | 'faint' | 'tera' | 'forme' | 'status' | 'none'

/**
 * How an action turned out for one Pokémon, in a few words beside its icon: a
 * hit that was resisted, a Protect that held, a move that missed.
 *
 * The words are the whole of it — a colour alone would leave a reader who
 * cannot see it with nothing (issue #96).
 */
export interface RowNote {
  /** A key under `battle.event`, as a row's `message` uses. */
  key: string
  params?: Record<string, string>
  /**
   * Whether the note only repeats what the row already says, and so is for a
   * screen reader rather than for the screen: `-singleturn Protect` on the
   * Pokémon that just used Protect is the move's own name back again.
   */
  quiet: boolean
}

/** A Pokémon an action reached, and what the log said happened to it. */
export interface RowPokemon {
  species: string
  notes: RowNote[]
  /**
   * The HP this action cost it, or gave it back — one entry per change, so a
   * multi-hit move shows both of its hits rather than the last one only.
   *
   * Only ever the changes the two conditions in `foldsHealth` let through: this
   * is a display decision the UI makes on fields the log itself filled in, not
   * an attribution the parser performed (design decision T26).
   */
  health: HealthChange[]
}

export interface TimelineRow {
  mark: RowMark
  /** Whose Pokémon this is about, or null for something happening to the field. */
  side: SideId | null
  /** The species whose icon leads the row, in the forme it was in at the time. */
  species: string | null
  /**
   * A move's English name, as the log spelled it. It is what the localised
   * name is looked up by and what a reader of `en` sees — the translation
   * happens where it is drawn, not here (ADR-0015).
   */
  move: string | null
  /**
   * Species of whatever this row points at, as icons after an arrow: a move's
   * targets, or the Pokémon that came in for the one that left.
   */
  targets: RowPokemon[]
  /**
   * Whoever else the action reached: the Pokémon that stopped a spread move it
   * was never listed as a target of. Kept apart from `targets` because the log
   * did not call it one, and the arrow the targets sit behind would.
   */
  bystanders: RowPokemon[]
  /** What the log said the action did to the row's own subject. */
  notes: RowNote[]
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
 * subordinate: a Protect that held, a stat stage, a hit that was resisted.
 *
 * An ability is on this list because an ability decides turns — Intimidate on
 * the switch in, Snow Warning setting the weather, Protosynthesis on a Booster
 * Energy — and the log announces it once, so holding it back means it is not on
 * screen at the moment it mattered.
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
  'ability',
  // An ability going away decides the turns after it as much as the line that
  // announced it does — and unlike a volatile, nothing on the bar can be read
  // as "and it is still gone" (#120).
  'endAbility',
  // Trick Room and the terrains decide every turn they are up, and the line
  // that lifts one has no move of its own to be read from.
  'fieldEffect',
])

/**
 * Whether an event carries the turn on its own.
 *
 * Weather is on the main line when the log said what set it — an ability, or a
 * move's own weather. It is not when nothing set it: measured, Showdown repeats
 * `|-weather|Snowscape|[upkeep]` once per turn for as long as it lasts, and
 * eight rows of the same weather is a turn nobody can scan.
 */
function isMainLine(event: TimelineEvent): boolean {
  if (event.kind === 'weather') return event.from !== null

  return MAIN_LINE.has(event.kind)
}

function blank(): TimelineRow {
  return {
    mark: 'none',
    side: null,
    species: null,
    move: null,
    targets: [],
    bystanders: [],
    notes: [],
    message: null,
    quiet: false,
    health: null,
    status: null,
    tone: null,
  }
}

/**
 * The row an event becomes, or null for a line nothing should draw.
 *
 * A move's row comes back with no results on it: gathering those is `rowsOf`'s
 * work, because it takes the events that follow to know what they were.
 */
export function rowOf(event: TimelineEvent): TimelineRow | null {
  switch (event.kind) {
    case 'move':
      return actionOf(event).row

    case 'switch': {
      // A trade reads as one: whoever left, then whoever came in for them. An
      // Illusion reveal is not a trade — the same body is standing there under
      // its own name — so it keeps the arrival as its subject.
      const trade = event.how !== 'replace' && event.replaced !== null

      return {
        ...blank(),
        mark: 'switch',
        side: event.pokemon.side,
        species: trade ? event.replaced!.species : event.pokemon.species,
        targets: trade ? [{ species: event.pokemon.species, notes: [], health: [] }] : [],
        message: {
          key: event.how === 'replace' ? 'wasAnIllusion' : trade ? 'cameInFor' : 'cameIn',
        },
        // The two icons and the arrow between them are the sentence.
        quiet: trade,
        status: event.status,
      }
    }

    case 'damage':
    case 'heal':
      // Showdown showed nothing for it and neither does this. The state under
      // the field bar still takes it: see `HealthChange.silent`.
      if (event.silent) return null

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

    case 'volatile':
      return {
        ...blank(),
        side: event.pokemon.side,
        species: event.pokemon.species,
        message: {
          key: event.phase === 'start' ? 'volatileStarted' : 'volatileEnded',
          params: { effect: event.effect },
        },
      }

    case 'endAbility':
      // A line that named nothing has nothing to say. The state behind the bar
      // still takes it — the ability is gone either way — but a row reading
      // "lost" with a blank where the name goes is worse than no row.
      return event.ability === ''
        ? null
        : {
            ...blank(),
            side: event.pokemon.side,
            species: event.pokemon.species,
            message: { key: 'abilityEnded', params: { ability: event.ability } },
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

    case 'fieldEffect':
      return {
        ...blank(),
        // Neither side's: Trick Room and a terrain are on the whole field, and
        // a rail down one side would say they belong to that side.
        side: null,
        // The Pokémon the log named as having set it, so the row has a face.
        // Null where the log named nobody, which is most terrains.
        species: event.source?.species ?? null,
        message: {
          key: event.phase === 'start' ? 'fieldEffectStarted' : 'fieldEffectEnded',
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
      // `none` is the weather running out, and it is the one value here that
      // is not a name: no source has an official noun for it, so it is copy
      // rather than a table lookup and takes a key of its own
      // (docs/adr/0016-localised-battle-vocabulary.md).
      return toID(event.weather) === 'none'
        ? { ...blank(), message: { key: 'weatherCleared' } }
        : { ...blank(), message: { key: 'weather', params: { weather: event.weather } } }

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
 * Whether this event is only how another one was carried out.
 *
 * A Mega Evolution arrives as `detailschange` and then `-mega`, which is one
 * thing happening: megaing is the event, changing forme is how it is done, and
 * the mega row already carries the new forme's icon. Two rows would make the
 * reader discount one of them.
 */
function isPlumbingFor(events: TimelineEvent[], index: number): boolean {
  const event = events[index]
  const next = events[index + 1]
  const before = events[index - 1]

  if (
    event?.kind === 'formeChange' &&
    next?.kind === 'mega' &&
    next.pokemon.position === event.pokemon.position
  ) {
    return true
  }

  // An Illusion breaking is `|replace|` and then `|-end|…|Illusion`, measured
  // adjacent in `gen9championsvgc2026regmb-2667169457` turn 2. The reveal row
  // already says it, and a second row saying it again is one more thing behind
  // "show the rest of this turn" that nobody needed.
  return (
    event?.kind === 'volatile' &&
    event.phase === 'end' &&
    toID(event.effect) === 'illusion' &&
    before?.kind === 'switch' &&
    before.how === 'replace' &&
    before.pokemon.position === event.pokemon.position
  )
}

type MoveEvent = Extract<TimelineEvent, { kind: 'move' }>

/**
 * A move's row, open for the results that follow it.
 *
 * `slots` is by field position rather than by species, because a position is
 * the only thing on the field that is unique — nicknames repeat and an Illusion
 * lies about the species.
 */
interface OpenAction {
  row: TimelineRow
  actor: string
  slots: Map<string, RowSlot>
}

/**
 * A place on the row and whether the log called it a target of the move.
 *
 * Damage folds onto targets only, so the difference has to survive: a
 * bystander is on the row because a result mentioned it, which is not the log
 * saying the move was aimed at it.
 */
interface RowSlot {
  pokemon: RowPokemon
  target: boolean
}

function actionOf(event: MoveEvent): OpenAction {
  // A move aimed at its own user says nothing an icon would add.
  const aimedAt = event.targets.filter((target) => target.position !== event.actor.position)
  const row: TimelineRow = {
    ...blank(),
    mark: 'move',
    side: event.actor.side,
    species: event.actor.species,
    move: event.move,
    targets: aimedAt.map((target) => ({ species: target.species, notes: [], health: [] })),
  }

  return {
    row,
    actor: event.actor.position,
    slots: new Map(
      aimedAt.map((target, index) => [
        target.position,
        { pokemon: row.targets[index]!, target: true },
      ]),
    ),
  }
}

/**
 * What the log said an action did to one Pokémon, or null for an event that is
 * not a result at all.
 */
function resultOf(
  event: TimelineEvent,
  move: string | null,
): { pokemon: Combatant; note: RowNote } | null {
  switch (event.kind) {
    case 'hitResult':
      return { pokemon: event.pokemon, note: { key: `hit.${event.result}`, quiet: false } }

    case 'fail':
      return { pokemon: event.pokemon, note: { key: 'failed', quiet: false } }

    // On the Pokémon that used the move rather than on the one it flew past:
    // the row's subject is the user, and a spread move that misses one of two
    // targets is the one shape this cannot tell apart. Measured: never seen.
    case 'miss':
      return { pokemon: event.actor, note: { key: 'missed', quiet: false } }

    case 'effect':
      return {
        pokemon: event.pokemon,
        note: {
          key: event.phase === 'start' ? 'effectStarted' : 'effectHeld',
          params: { effect: event.effect },
          quiet: event.phase === 'start' && event.effect === move,
        },
      }

    // A volatile a move put on is that move's result: Leech Seed's own row
    // says Leech Seed, so the note is quiet there and speaks up for a
    // Confuse Ray, whose `confusion` is not the move's name.
    case 'volatile':
      return {
        pokemon: event.pokemon,
        note: {
          key: event.phase === 'start' ? 'volatileStarted' : 'volatileEnded',
          params: { effect: event.effect },
          quiet: event.phase === 'start' && event.effect === move,
        },
      }

    default:
      return null
  }
}

/**
 * Whether a result may fold onto the open action at all.
 *
 * Only a volatile coming off is asked, and only because a `-end` arrives from
 * two different places: the move that took it off — a Substitute broken by
 * the hit — and the residual phase at the end of the turn, which nothing here
 * closes the action before. Measured in the fixtures, both of the real ones
 * are residual and both land on the wrong row: a Taunt that wore off after a
 * Surf (`gen9ou-2667296078` turn 10) and an Infestation that timed out under
 * its own user's Shadow Ball (`-2667169457` turn 14).
 *
 * So it folds only onto a Pokémon the move was aimed at, where the move is
 * the only thing that could have done it — the same gate the damage uses.
 * Everything else keeps a row of its own: unfolded says less than the wrong
 * subject says wrongly, and this file claims no causality the log did not
 * state.
 */
function foldsHere(action: OpenAction, event: TimelineEvent): boolean {
  if (event.kind !== 'volatile' || event.phase !== 'end') return true

  return action.slots.get(event.pokemon.position)?.target === true
}

/**
 * Puts a result on the row of the action it belongs to, and says whether it
 * went. The notes are pushed into objects the row already holds, so the row
 * that was pushed earlier gains them.
 */
function pin(action: OpenAction, event: TimelineEvent): boolean {
  const result = resultOf(event, action.row.move)
  if (!result) return false
  if (!foldsHere(action, event)) return false

  slotFor(action, result.pokemon).notes.push(result.note)
  return true
}

/** Where on the row a result about this Pokémon goes, made room for if new. */
function slotFor(action: OpenAction, pokemon: Combatant): { notes: RowNote[] } {
  if (pokemon.position === action.actor) return action.row

  const known = action.slots.get(pokemon.position)
  if (known) return known.pokemon

  const bystander: RowPokemon = { species: pokemon.species, notes: [], health: [] }
  action.row.bystanders.push(bystander)
  action.slots.set(pokemon.position, { pokemon: bystander, target: false })

  return bystander
}

/**
 * Whether this change in HP is the work of the action that is open, on the two
 * fields the log itself filled in:
 *
 * 1. `from === null` — a log that named a source named one, and it is not this
 *    move: Life Orb recoil, a burn's tick, Leftovers.
 * 2. the Pokémon is in this move's `targets` — the spread list, or the single
 *    target, both of which the log states outright (design hard point 5).
 *
 * Those two conditions are exactly what keeps the three cases decision T5
 * warned about off the move's row: recoil and residuals carry `[from]`, Iron
 * Barbs and Rocky Helmet hurt the Pokémon that attacked rather than a target,
 * and an end-of-turn status tick belongs to no move's targets at all. Nothing
 * here looks back for "the nearest `|move|`" — see the decision record, T26.
 *
 * A `silent` change is drawn nowhere at all (T24). Folding decides where a
 * change is drawn rather than whether, so the flag is asked here too — without
 * it, what Showdown hid would reappear on the move's row.
 */
function foldedHealth(
  action: OpenAction,
  event: TimelineEvent,
): { into: HealthChange[]; change: HealthChange } | null {
  if (event.kind !== 'damage' && event.kind !== 'heal') return null
  if (event.silent || event.from !== null) return null

  const slot = action.slots.get(event.pokemon.position)

  return slot?.target ? { into: slot.pokemon.health, change: event } : null
}

/** What closes an action, so that its results cannot reach past it. */
const CLOSES_ACTION = new Set<TimelineEvent['kind']>(['move', 'switch'])

/**
 * The rows a turn becomes, with each action's results gathered onto its own row.
 *
 * A result — how the hit landed, a Protect that held, a miss — is a fact about
 * the move that just went out, and Showdown shows it on that move's line. It is
 * folded rather than dropped: a row of its own for `resisted` says nothing the
 * move's row cannot say better, and thirty-seven of them per game were behind
 * the "show the rest of this turn" switch (issue #96).
 *
 * This is not the damage attribution decision T5 declined. The events folded
 * here each name the Pokémon they are about, and the group they land in is
 * closed by the next move or switch — nothing is inferred from proximity alone.
 */
export function rowsOf(turn: TimelineTurn, { detailed }: RowOptions): TimelineRow[] {
  const rows: TimelineRow[] = []
  let action: OpenAction | null = null

  turn.events.forEach((event, index) => {
    if (isPlumbingFor(turn.events, index)) return
    if (action && pin(action, event)) return

    const health = action && foldedHealth(action, event)
    if (health) {
      health.into.push(health.change)
      return
    }

    if (CLOSES_ACTION.has(event.kind)) action = null
    if (!detailed && !isMainLine(event)) return

    if (event.kind === 'move') {
      action = actionOf(event)
      rows.push(action.row)
      return
    }

    // Whatever else happened stays a row of its own, and leaves the action open:
    // the damage of a spread move lands between its two targets' results.
    const row = rowOf(event)
    if (row) rows.push(row)
  })

  return rows
}

/**
 * How many rows the "show the rest of this turn" switch would add.
 *
 * The difference between the two levels rather than a count of its own, so that
 * an event folded into an action cannot be offered as a row that is not there.
 */
export function sidelinedCount(turn: TimelineTurn): number {
  return rowsOf(turn, { detailed: true }).length - rowsOf(turn, { detailed: false }).length
}

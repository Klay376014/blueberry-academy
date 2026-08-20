import type { ProtocolLine } from './protocol'
import { baseSpeciesId, speciesOfDetails, toID } from './species'

/** The two sides of a battle. Perspective-neutral: neither of them is "me". */
export type SideId = 'p1' | 'p2'

const SIDE_IDS: SideId[] = ['p1', 'p2']

export interface SideState {
  /** As displayed by Showdown, from the first `|player|` line for this side. */
  username: string
  /** This side's rating going into the game, from its own `|player|` line. */
  ratingBefore: number | null
  /** How many Pokémon this side picked, from `|teamsize|`. */
  teamSize: number | null
  /** Base species ids of the registered team, in `|poke|` order. */
  team: string[]
  /** The bring: base species ids that appeared, in first-appearance order. */
  bring: string[]
}

/** What Showdown said a rating became once the game was over. */
export interface RatingUpdate {
  after: number
  /** The change Showdown itself reported, rather than one derived from it. */
  delta: number | null
}

export interface BattleState {
  gameType: string
  sides: Record<SideId, SideState>
  turnCount: number
  /** The name Showdown declared the winner, still un-normalised. */
  winnerUsername: string | null
  tie: boolean
  /** Whether a side gave up rather than played the battle out. */
  forfeited: boolean
  /** The parent battle a Bo3 game belongs to, or null outside a series. */
  seriesId: string | null
  /** Post-battle ratings, keyed by the normalised name `|raw|` named them for. */
  ratingUpdates: Map<string, RatingUpdate>
}

/** Replays a tokenized log, accumulating the facts a `ParsedBattle` is built from. */
export function replayLog(lines: ProtocolLine[]): BattleState {
  const state: BattleState = {
    gameType: '',
    sides: { p1: emptySide(), p2: emptySide() },
    turnCount: 0,
    winnerUsername: null,
    tie: false,
    forfeited: false,
    seriesId: null,
    ratingUpdates: new Map(),
  }

  /**
   * What the latest appearance at each field position added to the bring.
   * |replace| means that appearance was an Illusion wearing another Pokémon's
   * name, so the borrowed name has to come back out — but only if that
   * appearance is what introduced it. A name the side had already shown for
   * real stands on its own.
   */
  const latestAppearance = new Map<string, { species: string; introduced: boolean }>()

  for (const { type, args } of lines) {
    switch (type) {
      case 'gametype':
        state.gameType = args[0] ?? ''
        break

      case 'player': {
        const side = sideOf(args[0])
        const username = args[1] ?? ''
        // Showdown re-sends |player|p1| with no name once the battle is over.
        // The first line is the one that carries the real name.
        if (side && username !== '' && state.sides[side].username === '') {
          state.sides[side].username = username
          // The rating a side carried in is the 5th column of that same line.
          // It is absent from tournament games, which are simply unrated.
          state.sides[side].ratingBefore = optionalNumber(args[3])
        }
        break
      }

      case 'teamsize': {
        const side = sideOf(args[0])
        const size = Number(args[1])
        if (side && Number.isFinite(size)) state.sides[side].teamSize = size
        break
      }

      case 'poke': {
        // Species Clause is per side, so both teams may hold the same Pokémon.
        const side = sideOf(args[0])
        if (side) state.sides[side].team.push(baseSpeciesId(speciesOfDetails(args[1] ?? '')))
        break
      }

      case 'switch':
      case 'drag':
      case 'replace': {
        const side = sideOf(args[0])
        if (!side) break
        // The registered team is what an ambiguous battle-only forme resolves
        // against, and |poke| has already been read by the time anyone appears.
        const species = baseSpeciesId(speciesOfDetails(args[1] ?? ''), state.sides[side].team)
        if (species === '') break
        const position = positionOf(args[0])
        const bring = state.sides[side].bring

        if (type === 'replace') {
          const borrowed = latestAppearance.get(position)
          if (borrowed?.introduced === true) {
            const at = bring.indexOf(borrowed.species)
            if (at !== -1) bring.splice(at, 1)
          }
        }

        // A Pokémon that reappears later is already in the bring, so nothing is
        // added — which is also how a retracted name gets counted again once it
        // really comes out.
        const introduced = !bring.includes(species)
        if (introduced) bring.push(species)
        latestAppearance.set(position, { species, introduced })
        break
      }

      case 'turn': {
        const turn = Number(args[0])
        if (Number.isFinite(turn)) state.turnCount = turn
        break
      }

      case 'win':
        state.winnerUsername = args[0] ?? null
        break

      case 'tie':
        state.tie = true
        break

      case 'uhtml': {
        // A Bo3 game is stored as its own replay; this is the only line that
        // names the parent battle its siblings share.
        if (args[0] === 'bestof' && state.seriesId === null) {
          state.seriesId = seriesIdOf(args[1] ?? '')
        }
        break
      }

      case 'raw': {
        // Showdown reports the post-battle rating as free text, one line per
        // side, and sends other prose through |raw| too.
        const update = ratingUpdateOf(args[0] ?? '')
        if (update) state.ratingUpdates.set(update.userId, update.rating)
        break
      }

      case '-message':
        // Forfeiting has no protocol line of its own: Showdown says so in this
        // English sentence and then sends a |win| like any other battle.
        if (args[0]?.endsWith(' forfeited.') === true) state.forfeited = true
        break
    }
  }

  return state
}

function emptySide(): SideState {
  return { username: '', ratingBefore: null, teamSize: null, team: [], bring: [] }
}

/** A protocol column read as a number, or null when it is absent or not one. */
function optionalNumber(arg: string | undefined): number | null {
  if (arg === undefined || arg === '') return null
  const value = Number(arg)
  return Number.isFinite(value) ? value : null
}

/** The parent battle room a `|uhtml|bestof|` header links to. */
const BEST_OF_LINK = /href="\/(game-bestof\d+-[^"]+)"/

function seriesIdOf(html: string): string | null {
  return BEST_OF_LINK.exec(html)?.[1] ?? null
}

/**
 * `Alice's rating: 1444 &rarr; <strong>1459</strong><br />(+15 for winning)`,
 * which is the only place a post-battle rating appears. The name is matched
 * greedily so that a player whose own name ends in `'s` still resolves.
 */
const RATING_LINE = /^(.*)'s rating: \d+ &rarr; <strong>(\d+)<\/strong>/
/**
 * The change Showdown reported for that rating, e.g. `(-15 for losing)`. It is
 * only ever read from the tail after the rating, since a player's own name may
 * contain something that looks like one.
 */
const RATING_DELTA = /\(([+-]?\d+) for /

function ratingUpdateOf(text: string): { userId: string; rating: RatingUpdate } | null {
  const match = RATING_LINE.exec(text)
  if (!match) return null

  const userId = toID(match[1] ?? '')
  if (userId === '') return null

  const delta = RATING_DELTA.exec(text.slice(match[0].length))
  return {
    userId,
    rating: { after: Number(match[2]), delta: delta ? Number(delta[1]) : null },
  }
}

/**
 * The field position a protocol argument names (`p1a` out of `p1a: Scrafty`).
 * A position is what an Illusion is worn at, so it is what the borrowed name
 * has to be remembered against.
 */
function positionOf(arg: string | undefined): string {
  return arg?.split(':')[0]?.trim() ?? ''
}

/**
 * The side a protocol argument belongs to. Accepts both a bare side (`p1`) and
 * a field position (`p1a: Scrafty`), so no assumption is made about how many
 * positions a game type has.
 */
function sideOf(arg: string | undefined): SideId | null {
  const side = arg?.slice(0, 2)
  return SIDE_IDS.find((id) => id === side) ?? null
}

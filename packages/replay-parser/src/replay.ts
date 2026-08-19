import type { ProtocolLine } from './protocol'
import { baseSpeciesId, speciesOfDetails } from './species'

/** The two sides of a battle. Perspective-neutral: neither of them is "me". */
export type SideId = 'p1' | 'p2'

const SIDE_IDS: SideId[] = ['p1', 'p2']

export interface SideState {
  /** As displayed by Showdown, from the first `|player|` line for this side. */
  username: string
  /** How many Pokémon this side picked, from `|teamsize|`. */
  teamSize: number | null
  /** Base species ids of the registered team, in `|poke|` order. */
  team: string[]
  /** Base species ids that appeared on the field, in first-appearance order. */
  appeared: string[]
}

export interface BattleState {
  gameType: string
  sides: Record<SideId, SideState>
  turnCount: number
  /** The name Showdown declared the winner, still un-normalised. */
  winnerUsername: string | null
  tie: boolean
}

/** Replays a tokenized log, accumulating the facts a `ParsedBattle` is built from. */
export function replayLog(lines: ProtocolLine[]): BattleState {
  const state: BattleState = {
    gameType: '',
    sides: { p1: emptySide(), p2: emptySide() },
    turnCount: 0,
    winnerUsername: null,
    tie: false,
  }

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
        // Any of the three is a Pokémon showing itself for the first time,
        // which is what makes it part of the bring.
        const side = sideOf(args[0])
        if (!side) break
        const species = baseSpeciesId(speciesOfDetails(args[1] ?? ''))
        if (species !== '' && !state.sides[side].appeared.includes(species)) {
          state.sides[side].appeared.push(species)
        }
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
    }
  }

  return state
}

function emptySide(): SideState {
  return { username: '', teamSize: null, team: [], appeared: [] }
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

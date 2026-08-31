import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import { fieldSnapshots } from '../utils/battleField'
import ladderReplay from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'

/**
 * A doubles log with one Pokémon a side already out, so each test adds only the
 * lines it is about. The same shape the parser's own tests use.
 */
function log(lines: string[]): string {
  return [
    '|gametype|doubles',
    '|player|p1|Alice|benga|1444',
    '|player|p2|Bob|gentleman|1534',
    '|start',
    '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
    '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
    '|turn|1',
    ...lines,
  ].join('\n')
}

/** The state of one field position at the end of the last turn. */
function slotAt(lines: string[], position: string) {
  const snapshots = fieldSnapshots(parseTimeline(log(lines)))
  const last = snapshots.at(-1)

  if (!last) throw new Error('No snapshot for a timeline that has turns.')

  return last.slots.find((slot) => slot.position === position)
}

/** Everyone a side has seen who is not standing on the field right now. */
function offFieldAt(lines: string[]) {
  const last = fieldSnapshots(parseTimeline(log(lines))).at(-1)

  if (!last) throw new Error('No snapshot for a timeline that has turns.')

  return last.offField
}

describe('the state of the field at the end of a turn', () => {
  it('reports one snapshot per turn, in the turns’ own order', () => {
    const snapshots = fieldSnapshots(parseTimeline(log(['|turn|2', '|turn|3'])))

    expect(snapshots.map((snapshot) => snapshot.turn)).toEqual([0, 1, 2, 3])
  })

  it('has whoever is standing there, with the HP the log last gave them', () => {
    expect(slotAt(['|-damage|p1a: Scrafty|64/100'], 'p1a')).toMatchObject({
      side: 'p1',
      species: 'Scrafty',
      hp: 64,
      fainted: false,
    })
  })

  it('keeps a status until the log says it is gone', () => {
    expect(slotAt(['|-status|p1a: Scrafty|brn'], 'p1a')).toMatchObject({ status: 'brn' })
    expect(
      slotAt(['|-status|p1a: Scrafty|brn', '|turn|2', '|-curestatus|p1a: Scrafty|brn'], 'p1a'),
    ).toMatchObject({ status: null })
  })

  it('adds up the stat changes on one Pokémon', () => {
    expect(
      slotAt(['|-unboost|p1a: Scrafty|atk|1', '|-boost|p1a: Scrafty|spe|2'], 'p1a')?.boosts,
    ).toEqual({ atk: -1, spe: 2 })
  })

  it('leaves out a stat that went up and came back down', () => {
    // A chip reading `atk 0` says nothing, and a row of them says less.
    expect(
      slotAt(['|-boost|p1a: Scrafty|atk|2', '|-unboost|p1a: Scrafty|atk|2'], 'p1a')?.boosts,
    ).toEqual({})
  })

  it('drops the stat changes of a Pokémon that left the field', () => {
    // Boosts are lost on a switch out, so they cannot come back with it.
    const lines = [
      '|-boost|p1a: Scrafty|atk|2',
      '|turn|2',
      '|switch|p1a: Toxapex|Toxapex, L50, M|100/100',
      '|turn|3',
      '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
    ]

    expect(slotAt(lines, 'p1a')).toMatchObject({ species: 'Scrafty', boosts: {} })
  })

  it('shows the status a Pokémon comes back in with', () => {
    // The `|switch|` HP field is the only line that says so — there is no
    // second `|-status|` when a burnt Pokémon returns.
    expect(slotAt(['|switch|p1a: Toxapex|Toxapex, L50, M|97/100 tox'], 'p1a')).toMatchObject({
      species: 'Toxapex',
      hp: 97,
      status: 'tox',
    })
  })

  it('keeps a Pokémon terastallized after it switches out and back', () => {
    // Terastallizing is for the rest of the game, and the log announces it
    // once. Tracked against the Pokémon rather than the position it stood in.
    const lines = [
      '|-terastallize|p1a: Scrafty|Dark',
      '|turn|2',
      '|switch|p1a: Toxapex|Toxapex, L50, M|100/100',
      '|turn|3',
      '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
    ]

    expect(slotAt(lines, 'p1a')).toMatchObject({ species: 'Scrafty', teraType: 'Dark' })
  })

  it('shows the forme a Pokémon changed into', () => {
    expect(slotAt(['|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F'], 'p1a')?.species).toBe(
      'Scrafty-Mega',
    )
  })

  it('marks a fainted Pokémon and leaves the position empty afterwards', () => {
    const fainted = slotAt(['|-damage|p2a: Whimsicott|0 fnt', '|faint|p2a: Whimsicott'], 'p2a')

    expect(fainted).toMatchObject({ species: 'Whimsicott', hp: 0, fainted: true })
  })

  it('follows a Pokémon through an Ally Switch', () => {
    const lines = [
      '|switch|p1b: Garchomp|Garchomp, L50, F|100/100',
      '|-boost|p1a: Scrafty|atk|2',
      '|turn|2',
      '|move|p1a: Scrafty|Ally Switch|p1a: Scrafty',
      '|swap|p1a: Scrafty|1',
    ]

    // The stat change belongs to Scrafty, not to the square it was standing on.
    expect(slotAt(lines, 'p1b')).toMatchObject({ species: 'Scrafty', boosts: { atk: 2 } })
    expect(slotAt(lines, 'p1a')).toMatchObject({ species: 'Garchomp', boosts: {} })
  })

  it('holds each side’s screens until they end', () => {
    const started = fieldSnapshots(parseTimeline(log(['|-sidestart|p2: Bob|move: Tailwind']))).at(
      -1,
    )
    expect(started?.screens.p2).toEqual(['Tailwind'])
    expect(started?.screens.p1).toEqual([])

    const ended = fieldSnapshots(
      parseTimeline(
        log(['|-sidestart|p2: Bob|move: Tailwind', '|turn|2', '|-sideend|p2: Bob|move: Tailwind']),
      ),
    ).at(-1)
    expect(ended?.screens.p2).toEqual([])
  })

  it('keeps the name an Illusion was wearing, then hands its state to the real one', () => {
    const lines = [
      '|-damage|p2a: Whimsicott|64/100',
      '|turn|2',
      '|replace|p2a: Zoroark|Zoroark-Hisui, L50, M',
    ]

    // What happened on screen: the same body at 64%, now known to be a Zoroark.
    expect(slotAt(lines, 'p2a')).toMatchObject({ species: 'Zoroark-Hisui', hp: 64 })
  })

  it('reads a real game the same way the drawer will', () => {
    const snapshots = fieldSnapshots(parseTimeline(ladderReplay.log))
    // Turn 5: Garchomp has been burning since turn 4, Scrafty megaed in turn 2
    // and was burnt in the same turn, and the opponent has Tailwind up.
    const turn7 = snapshots.find((snapshot) => snapshot.turn === 7)

    expect(turn7?.slots.find((slot) => slot.position === 'p1b')).toMatchObject({
      species: 'Garchomp',
      status: 'brn',
      hp: 76,
    })
    expect(turn7?.slots.find((slot) => slot.position === 'p1a')).toMatchObject({
      species: 'Scrafty-Mega',
      status: 'brn',
    })
    expect(turn7?.screens.p2).toEqual(['Tailwind'])
  })
})

describe('the Pokémon that are off the field', () => {
  it('keeps the HP and the status a Pokémon left the field on', () => {
    // Nothing damages a Pokémon on the bench, so the last thing the log said
    // about it is still true — and it is the only place the log says it.
    const lines = [
      '|-status|p1a: Scrafty|brn',
      '|-damage|p1a: Scrafty|64/100 brn',
      '|turn|2',
      '|switch|p1a: Toxapex|Toxapex, L50, M|100/100',
    ]

    expect(offFieldAt(lines)).toEqual([
      expect.objectContaining({ side: 'p1', species: 'Scrafty', hp: 64, status: 'brn' }),
    ])
  })

  it('leaves the stat changes behind with the square it was standing on', () => {
    const lines = [
      '|-boost|p1a: Scrafty|atk|2',
      '|turn|2',
      '|switch|p1a: Toxapex|Toxapex, L50, M|100/100',
    ]

    expect(offFieldAt(lines)[0]).toMatchObject({ species: 'Scrafty', boosts: {} })
  })

  it('keeps a fainted Pokémon after the next one comes in over it', () => {
    // The one thing the field alone cannot show: a Pokémon that is replaced
    // stops being on the field, and "how many are left" is the reason for this.
    const lines = [
      '|-damage|p2a: Whimsicott|0 fnt',
      '|faint|p2a: Whimsicott',
      '|switch|p2a: Gholdengo|Gholdengo, L50|100/100',
    ]

    expect(offFieldAt(lines)).toEqual([
      expect.objectContaining({ species: 'Whimsicott', hp: 0, fainted: true }),
    ])
  })

  it('is empty for a lead nobody has switched away from', () => {
    expect(offFieldAt([])).toEqual([])
  })

  it('never has the same Pokémon standing on the field and off it', () => {
    const lines = [
      '|switch|p1a: Toxapex|Toxapex, L50, M|100/100',
      '|turn|2',
      '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
    ]

    expect(offFieldAt(lines).map((pokemon) => pokemon.species)).toEqual(['Toxapex'])
  })

  it('leaves no ghost behind when an Illusion is revealed', () => {
    // `replace` is the same body under its real name, not two Pokémon.
    const lines = ['|replace|p2a: Zoroark|Zoroark-Hisui, L50, M']

    expect(offFieldAt(lines)).toEqual([])
  })

  it('reads a real game the same way the drawer will', () => {
    const snapshots = fieldSnapshots(parseTimeline(ladderReplay.log))
    const turn7 = snapshots.find((snapshot) => snapshot.turn === 7)
    const of = (side: string) => turn7?.offField.filter((pokemon) => pokemon.side === side)

    // Toxapex left on turn 5 and Ninetales at 27% on turn 7, and neither is on
    // the field to say so. Toxapex is at 83 rather than the 50 the screen last
    // showed: Regenerator healed it on the way out, silently.
    expect(of('p1')).toEqual([
      expect.objectContaining({ species: 'Toxapex', hp: 83 }),
      expect.objectContaining({ species: 'Ninetales-Alola', hp: 27 }),
    ])
    // The Zoroark that was pretending to be Glimmora fainted on turn 4 and was
    // replaced, so the field has not mentioned it for three turns.
    expect(of('p2')).toEqual([
      expect.objectContaining({ species: 'Gholdengo', hp: 90, fainted: false }),
      expect.objectContaining({ species: 'Zoroark-Hisui', hp: 0, fainted: true }),
    ])
  })
})

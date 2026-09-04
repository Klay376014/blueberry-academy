import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import { fieldSnapshots } from '../utils/battleField'
import ladderReplay from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'
import fieldReplay from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2674299387.json'
import volatileReplay from '../../../../../../packages/replay-parser/test/fixtures/gen9ou-2667299955.json'

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

  it('takes every stat change off the field when a Haze goes out', () => {
    // The bug this family was read for: `-clearallboost` names nobody, so the
    // chips it clears were left standing and the bar kept showing a +2 that
    // was gone. No fixture can show it — the seven Haze lines in the corpus
    // all land on a field holding nothing (#123).
    const lines = [
      '|-boost|p1a: Scrafty|atk|2',
      '|-boost|p2a: Whimsicott|spe|1',
      '|move|p2a: Whimsicott|Haze|p2a: Whimsicott',
      '|-clearallboost',
    ]

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({})
    expect(slotAt(lines, 'p2a')?.boosts).toEqual({})
  })

  it('takes them off the one a Clear Smog named, and leaves the other alone', () => {
    const lines = [
      '|-boost|p1a: Scrafty|atk|2',
      '|-boost|p2a: Whimsicott|spe|1',
      '|-clearboost|p1a: Scrafty',
    ]

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({})
    expect(slotAt(lines, 'p2a')?.boosts).toEqual({ spe: 1 })
  })

  it('sets a stat where a Belly Drum says to, rather than adding to it', () => {
    // +2 and then "set to 6" is 6, not 8.
    const lines = ['|-boost|p1a: Scrafty|atk|2', '|-setboost|p1a: Scrafty|atk|6']

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({ atk: 6 })
  })

  it('turns every stat change the other way round for a Topsy-Turvy', () => {
    const lines = [
      '|-boost|p1a: Scrafty|atk|2',
      '|-unboost|p1a: Scrafty|spe|1',
      '|-invertboost|p1a: Scrafty',
    ]

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({ atk: -2, spe: 1 })
  })

  it('trades only the stats a swap line named, on both Pokémon', () => {
    const lines = [
      '|-boost|p1a: Scrafty|atk|2',
      '|-boost|p1a: Scrafty|spe|1',
      '|-unboost|p2a: Whimsicott|atk|1',
      '|-swapboost|p1a: Scrafty|p2a: Whimsicott|atk|[from] move: Power Swap',
    ]

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({ atk: -1, spe: 1 })
    expect(slotAt(lines, 'p2a')?.boosts).toEqual({ atk: 2 })
  })

  it('trades the lot when a Heart Swap names no stats at all', () => {
    const lines = [
      '|-boost|p1a: Scrafty|atk|2',
      '|-unboost|p2a: Whimsicott|spe|1',
      '|-swapboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Heart Swap',
    ]

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({ spe: -1 })
    expect(slotAt(lines, 'p2a')?.boosts).toEqual({ atk: 2 })
  })

  it('gives a Psych Up user the other one’s stat changes, and leaves them there', () => {
    const lines = [
      '|-boost|p2a: Whimsicott|spa|2',
      '|-copyboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Psych Up',
    ]

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({ spa: 2 })
    expect(slotAt(lines, 'p2a')?.boosts).toEqual({ spa: 2 })
  })

  it('leaves a copied Pokémon’s later stat changes off the one that copied it', () => {
    // A copy, not a shared map: what Whimsicott gains afterwards is its own.
    const lines = [
      '|-boost|p2a: Whimsicott|spa|2',
      '|-copyboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Psych Up',
      '|-boost|p2a: Whimsicott|spa|1',
    ]

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({ spa: 2 })
    expect(slotAt(lines, 'p2a')?.boosts).toEqual({ spa: 3 })
  })

  it('takes only the raised stats for a Spectral Thief, and keeps the lowered ones', () => {
    const lines = [
      '|-boost|p2a: Whimsicott|atk|2',
      '|-unboost|p2a: Whimsicott|def|1',
      '|-clearpositiveboost|p2a: Whimsicott|p1a: Scrafty|move: Spectral Thief',
    ]

    expect(slotAt(lines, 'p2a')?.boosts).toEqual({ def: -1 })
  })

  it('leaves a White Herb’s drop standing, because Showdown draws nothing for it', () => {
    // `-clearnegativeboost` is always silent, and the silent rule drops it
    // before it reaches here. The bar can only say what was played (#123).
    const lines = ['|-unboost|p1a: Scrafty|atk|1', '|-clearnegativeboost|p1a: Scrafty|[silent]']

    expect(slotAt(lines, 'p1a')?.boosts).toEqual({ atk: -1 })
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

  it('holds the effects on the whole field until the log lifts them', () => {
    // "Is Trick Room still up on this turn?" is the question the bar exists to
    // answer without reading back up the log (#104).
    const both = fieldSnapshots(
      parseTimeline(
        log(['|-fieldstart|move: Trick Room|[of] p2a: Whimsicott', '|-fieldstart|Psychic Terrain']),
      ),
    ).at(-1)
    expect(both?.fieldEffects).toEqual(['Trick Room', 'Psychic Terrain'])

    const lifted = fieldSnapshots(
      parseTimeline(
        log([
          '|-fieldstart|move: Trick Room|[of] p2a: Whimsicott',
          '|-fieldstart|Psychic Terrain',
          '|turn|2',
          '|-fieldend|move: Trick Room',
        ]),
      ),
    ).at(-1)
    expect(lifted?.fieldEffects).toEqual(['Psychic Terrain'])
  })

  it('reads the field effects of a real game turn by turn', () => {
    // Trick Room from turn 1 to turn 5, Psychic Terrain from 2 to 6: they
    // overlapped, so one lifting must not take the other with it.
    const snapshots = fieldSnapshots(parseTimeline(fieldReplay.log))
    const at = (turn: number) => snapshots.find((snapshot) => snapshot.turn === turn)?.fieldEffects

    expect(at(1)).toEqual(['Trick Room'])
    expect(at(2)).toEqual(['Trick Room', 'Psychic Terrain'])
    expect(at(5)).toEqual(['Psychic Terrain'])
    expect(at(6)).toEqual([])
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
    // replaced, so the field has not mentioned it for three turns. It leads
    // this list because it led the battle: being unmasked on turn 2 does not
    // move a Pokémon to the back of the bench.
    expect(of('p2')).toEqual([
      expect.objectContaining({ species: 'Zoroark-Hisui', hp: 0, fainted: true }),
      expect.objectContaining({ species: 'Gholdengo', hp: 90, fainted: false }),
    ])
  })
})

describe('the lasting effects on one Pokémon', () => {
  it('holds a volatile until the log takes it off', () => {
    expect(slotAt(['|-start|p1a: Scrafty|move: Taunt'], 'p1a')?.volatiles).toEqual(['Taunt'])
    expect(
      slotAt(
        ['|-start|p1a: Scrafty|move: Taunt', '|turn|2', '|-end|p1a: Scrafty|move: Taunt'],
        'p1a',
      )?.volatiles,
    ).toEqual([])
  })

  it('holds several at once, in the order they went on', () => {
    const lines = ['|-start|p1a: Scrafty|Substitute', '|-start|p1a: Scrafty|move: Leech Seed']

    expect(slotAt(lines, 'p1a')?.volatiles).toEqual(['Substitute', 'Leech Seed'])
  })

  it('says one once when the log starts it twice', () => {
    const lines = ['|-start|p1a: Scrafty|confusion', '|turn|2', '|-start|p1a: Scrafty|confusion']

    expect(slotAt(lines, 'p1a')?.volatiles).toEqual(['confusion'])
  })

  it('leaves them behind when the Pokémon leaves the field', () => {
    // A volatile is lost on a switch out, the same as a stat change — so it
    // cannot come back with the Pokémon, and it cannot follow it to the bench.
    const lines = [
      '|-start|p1a: Scrafty|move: Leech Seed',
      '|turn|2',
      '|switch|p1a: Toxapex|Toxapex, L50, M|100/100',
      '|turn|3',
      '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
    ]

    expect(slotAt(lines, 'p1a')?.volatiles).toEqual([])
    expect(offFieldAt(lines.slice(0, 3))[0]?.volatiles).toEqual([])
  })

  it('drops them when the Pokémon faints', () => {
    const lines = ['|-start|p1a: Scrafty|Substitute', '|turn|2', '|faint|p1a: Scrafty']

    expect(slotAt(lines, 'p1a')?.volatiles).toEqual([])
  })

  it('carries them to the square an Ally Switch moved the Pokémon to', () => {
    // They belong to the Pokémon, not to the square, like the stat changes.
    const lines = [
      '|switch|p1b: Garchomp|Garchomp, L50, F|100/100',
      '|-start|p1a: Scrafty|Substitute',
      '|turn|2',
      '|move|p1a: Scrafty|Ally Switch|p1a: Scrafty',
      '|swap|p1a: Scrafty|1',
    ]

    expect(slotAt(lines, 'p1b')).toMatchObject({ species: 'Scrafty', volatiles: ['Substitute'] })
    expect(slotAt(lines, 'p1a')).toMatchObject({ species: 'Garchomp', volatiles: [] })
  })

  it('hands them to the body an Illusion turned out to be', () => {
    const lines = [
      '|-start|p2a: Whimsicott|move: Leech Seed',
      '|turn|2',
      '|replace|p2a: Zoroark|Zoroark-Hisui, L50, M',
    ]

    expect(slotAt(lines, 'p2a')).toMatchObject({
      species: 'Zoroark-Hisui',
      volatiles: ['Leech Seed'],
    })
  })

  it('reads a real game turn by turn', () => {
    // `2667299955`: Gliscor put a Substitute up on 15, lost it on 16, put a
    // second one up on 17 and was taunted in the same turn. So one coming off
    // must not take the next one with it, and two on one Pokémon must both be
    // there.
    const snapshots = fieldSnapshots(parseTimeline(volatileReplay.log))
    const at = (turn: number) =>
      snapshots
        .find((snapshot) => snapshot.turn === turn)
        ?.slots.find((slot) => slot.species === 'Gliscor')?.volatiles

    expect(at(15)).toEqual(['Substitute'])
    expect(at(16)).toEqual([])
    expect(at(17)).toEqual(['Substitute', 'Taunt'])
  })
})

describe('an ability taken off a Pokémon that stays out', () => {
  const XERNEAS_AURA = [
    '|switch|p1b: Xerneas|Xerneas, L50|100/100',
    '|-ability|p1b: Xerneas|Fairy Aura',
  ]

  it('takes the whole-field chip down with it', () => {
    // #119's stated limit, and the reason this ticket owns `-endability`: the
    // holder is still standing, so nothing else here would ever clear it.
    const lines = [
      ...XERNEAS_AURA,
      '|turn|2',
      '|-endability|p1b: Xerneas|Fairy Aura|[from] move: Gastro Acid',
    ]

    expect(fieldSnapshots(parseTimeline(log(lines))).at(-1)?.fieldAbilities).toEqual([])
  })

  it('takes it down when the log did not name what ended', () => {
    const lines = [...XERNEAS_AURA, '|turn|2', '|-endability|p1b: Xerneas']

    expect(fieldSnapshots(parseTimeline(log(lines))).at(-1)?.fieldAbilities).toEqual([])
  })

  it('gives the row back the one that replaced it', () => {
    // Skill Swap ends one and announces the next in the same breath.
    const lines = [
      ...XERNEAS_AURA,
      '|turn|2',
      '|-endability|p1b: Xerneas|Fairy Aura',
      '|-ability|p1b: Xerneas|Dark Aura',
    ]

    expect(fieldSnapshots(parseTimeline(log(lines))).at(-1)?.fieldAbilities).toEqual(['Dark Aura'])
  })
})

describe('the weather', () => {
  /** The weather standing at the end of the last turn of `lines`. */
  function weatherAt(lines: string[]) {
    return fieldSnapshots(parseTimeline(log(lines))).at(-1)?.weather
  }

  it('holds the weather until the log says there is none', () => {
    expect(weatherAt(['|-weather|Snowscape'])).toBe('Snowscape')
    expect(weatherAt(['|-weather|Snowscape', '|turn|2', '|-weather|none'])).toBeNull()
  })

  it('reads an ability’s weather the same as a move’s', () => {
    // Measured, every weather in the fixtures came from an ability:
    // `|-weather|Snowscape|[from] ability: Snow Warning|[of] p1a: Ninetales`.
    // Who set it is the log's business; the row says what is standing.
    expect(weatherAt(['|-weather|RainDance|[from] ability: Drizzle|[of] p2a: Whimsicott'])).toBe(
      'RainDance',
    )
  })

  it('keeps one weather when the upkeep line repeats it every turn', () => {
    // Showdown re-sends the same weather each turn with `[upkeep]`. Two chips
    // reading 下雪 would be the reader's problem, not the log's.
    const lines = ['|-weather|Snowscape', '|turn|2', '|-weather|Snowscape|[upkeep]']

    expect(weatherAt(lines)).toBe('Snowscape')
  })

  it('replaces the weather a new one overrode', () => {
    expect(weatherAt(['|-weather|Snowscape', '|turn|2', '|-weather|RainDance'])).toBe('RainDance')
  })

  it('says nothing for a weather line with no weather on it', () => {
    // Only reachable from a truncated log, and an empty chip under the FIELD
    // label is worse than no row at all.
    expect(weatherAt(['|-weather|'])).toBeNull()
  })

  it('reads a real game turn by turn', () => {
    // Snow from turn 5, gone on 9, and a second Ninetales brought it back on
    // 10 — so a weather that ran out must not be remembered, and one that came
    // back must not need a second reader.
    const snapshots = fieldSnapshots(parseTimeline(ladderReplay.log))
    const at = (turn: number) => snapshots.find((snapshot) => snapshot.turn === turn)?.weather

    expect(at(4)).toBeNull()
    expect(at(5)).toBe('Snowscape')
    expect(at(8)).toBe('Snowscape')
    expect(at(9)).toBeNull()
    expect(at(10)).toBe('Snowscape')
  })
})

describe('the abilities that stand on the whole field', () => {
  /** A Xerneas alongside Scrafty, and the aura it announces on arrival. */
  const XERNEAS = ['|switch|p1b: Xerneas|Xerneas, L50|100/100', '|-ability|p1b: Xerneas|Fairy Aura']

  function abilitiesAt(lines: string[]) {
    return fieldSnapshots(parseTimeline(log(lines))).at(-1)?.fieldAbilities
  }

  it('holds an aura for as long as its holder is out', () => {
    expect(
      abilitiesAt([...XERNEAS, '|turn|2', '|move|p1a: Scrafty|Fake Out|p2a: Whimsicott']),
    ).toEqual(['Fairy Aura'])
  })

  it('drops it when its holder leaves the field', () => {
    // The aura is the whole field's, but it lives and dies with one Pokémon.
    const lines = [...XERNEAS, '|turn|2', '|switch|p1b: Toxapex|Toxapex, L50, M|100/100']

    expect(abilitiesAt(lines)).toEqual([])
  })

  it('drops it when its holder faints, before anything replaces it', () => {
    // A fainted Pokémon stays on its square until the switch, and nothing a
    // fainted Pokémon has is still in effect.
    expect(abilitiesAt([...XERNEAS, '|turn|2', '|faint|p1b: Xerneas'])).toEqual([])
  })

  it('ignores an ability that fires once and is over', () => {
    // `|-ability|` announces Intimidate the same way it announces an aura. A
    // chip reading 威嚇 from turn 1 to the end of the game would be a lie.
    expect(abilitiesAt(['|-ability|p1a: Scrafty|Intimidate'])).toEqual([])
  })

  it('says an aura once when both sides brought the same one', () => {
    const lines = [
      ...XERNEAS,
      '|switch|p2b: Xerneas|Xerneas, L50|100/100',
      '|-ability|p2b: Xerneas|Fairy Aura',
    ]

    expect(abilitiesAt(lines)).toEqual(['Fairy Aura'])
  })

  it('keeps it with the body an Illusion turned out to be', () => {
    // Not reachable in a game — Illusion copies the look and not the ability,
    // so no aura is announced under a worn name. Asserted because this is the
    // same handover as the stat changes and the Tera type, and the three must
    // not drift apart.
    const lines = [
      '|-ability|p2a: Whimsicott|Fairy Aura',
      '|turn|2',
      '|replace|p2a: Zoroark|Zoroark-Hisui, L50, M',
    ]

    expect(abilitiesAt(lines)).toEqual(['Fairy Aura'])
  })

  it('waits for the log to announce it again when its holder comes back', () => {
    // Not carried across the bench, though it is intrinsic to a Xerneas:
    // whether the Pokémon that returns still has the ability is the log's to
    // say, and every one of these announces itself on arrival. A Porygon2 that
    // traced Fairy Aura, left, and came back tracing Intimidate is the case
    // that carrying it over gets wrong — and nothing would ever clear it,
    // because an arrival can only ever set it.
    const away = [
      ...XERNEAS,
      '|turn|2',
      '|switch|p1b: Toxapex|Toxapex, L50, M|100/100',
      '|turn|3',
      '|switch|p1b: Xerneas|Xerneas, L50|100/100',
    ]

    expect(abilitiesAt(away)).toEqual([])
    expect(abilitiesAt([...away, '|-ability|p1b: Xerneas|Fairy Aura'])).toEqual(['Fairy Aura'])
  })

  it('holds a weather-ignoring ability, which the weather chip cannot say alone', () => {
    // 下雪 with an Air Lock out is snow that does nothing. The row cannot show
    // that the weather is suppressed, but it can at least show the reason.
    const lines = [
      '|switch|p1b: Rayquaza|Rayquaza, L50|100/100',
      '|-ability|p1b: Rayquaza|Air Lock',
      '|-weather|Snowscape',
    ]

    expect(abilitiesAt(lines)).toEqual(['Air Lock'])
  })

  it('says only the Neutralizing Gas when it is out, because it negates the rest', () => {
    // A Ruin chip beside the chip for the thing that switches every ability
    // off is two contradictory claims on one row. Common in these formats, not
    // an edge case.
    const lines = [
      '|switch|p1b: Chi-Yu|Chi-Yu, L50|100/100',
      '|-ability|p1b: Chi-Yu|Beads of Ruin',
      '|turn|2',
      '|switch|p2b: Weezing|Weezing-Galar, L50, M|100/100',
      '|-ability|p2b: Weezing|Neutralizing Gas',
    ]

    expect(abilitiesAt(lines)).toEqual(['Neutralizing Gas'])
  })

  it('gives the rest back when the Neutralizing Gas leaves', () => {
    // Showdown re-announces what comes back on: this only has to stop lying
    // while the gas is out.
    const lines = [
      '|switch|p1b: Chi-Yu|Chi-Yu, L50|100/100',
      '|-ability|p1b: Chi-Yu|Beads of Ruin',
      '|turn|2',
      '|switch|p2b: Weezing|Weezing-Galar, L50, M|100/100',
      '|-ability|p2b: Weezing|Neutralizing Gas',
      '|turn|3',
      '|switch|p2b: Whimsicott|Whimsicott, L50, M|100/100',
      '|-ability|p1b: Chi-Yu|Beads of Ruin',
    ]

    expect(abilitiesAt(lines)).toEqual(['Beads of Ruin'])
  })
})

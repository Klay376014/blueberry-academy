import { describe, expect, it } from 'vitest'
import { parseTimeline } from 'replay-parser'
import type { TimelineTurn } from 'replay-parser'
import { rowsOf, sidelinedCount } from '../utils/timelineRows'
import ladder from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667301751.json'
import lifeOrb from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2667169457.json'
import recoil from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2674380893.json'
import recoilToo from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regmb-2674448634.json'
import skillSwap from '../../../../../../packages/replay-parser/test/fixtures/gen9championsvgc2026regma-2592519449.json'
import multiHit from '../../../../../../packages/replay-parser/test/fixtures/gen9vgc2024regf-2082942604.json'

/** One out on each side, which is what turn 0's own tests read. */
const TWO_UP = [
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
]

/** Both positions filled, which a spread move needs to have two of anything. */
const FOUR_UP = [
  '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
  '|switch|p1b: Torkoal|Torkoal, L50, M|100/100',
  '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
  '|switch|p2b: Garchomp|Garchomp, L50, F|100/100',
]

function turnsOf(lines: string[], leads = TWO_UP): TimelineTurn[] {
  return parseTimeline(
    [
      '|gametype|doubles',
      '|player|p1|Alice|benga|1444',
      '|player|p2|Bob|gentleman|1534',
      '|start',
      ...leads,
      '|turn|1',
      ...lines,
    ].join('\n'),
  ).turns
}

/** The rows of the one numbered turn the test wrote. */
function rows(lines: string[], detailed = false, leads = TWO_UP) {
  const turn = turnsOf(lines, leads)[1]
  if (!turn) throw new Error('No turn 1 in this log.')

  return rowsOf(turn, { detailed })
}

describe('the rows one turn becomes', () => {
  it('draws nothing for a health line Showdown itself does not show', () => {
    // The state behind the drawer takes the silent heal; the log of what was
    // played must not, or it shows a heal nobody saw (#90).
    const silent = ['|-heal|p1a: Scrafty|83/100|[from] ability: Regenerator|[silent]']

    expect(rows(silent, true)).toEqual([])
    expect(sidelinedCount(turnsOf(silent)[1]!)).toBe(0)
  })

  it('reads a move as its English name and the icons it was aimed at', () => {
    // The move name is an identifier and never passes through i18n; the
    // targets are icons, so what is carried is their species.
    expect(rows(['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott'])).toEqual([
      {
        mark: 'move',
        side: 'p1',
        species: 'Scrafty',
        move: 'Knock Off',
        targets: [{ species: 'Whimsicott', notes: [], hits: [] }],
        bystanders: [],
        notes: [],
        message: null,
        quiet: false,
        health: null,
        status: null,
        tone: null,
      },
    ])
  })

  it('leaves out the target of a move aimed at the Pokémon using it', () => {
    // `Protect` pointing at its own user says nothing worth an icon.
    expect(rows(['|move|p1a: Scrafty|Protect|p1a: Scrafty'])[0]).toMatchObject({
      move: 'Protect',
      targets: [],
    })
  })

  it('names every target of a spread move', () => {
    const turn = [
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p1a: Scrafty|Rock Slide|p2a: Whimsicott|[spread] p2a,p2b',
    ]

    expect(
      rows(turn)
        .at(-1)
        ?.targets.map((target) => target.species),
    ).toEqual(['Whimsicott', 'Gholdengo'])
  })

  it('carries a health change as the change itself, not as words', () => {
    expect(rows(['|-damage|p2a: Whimsicott|32/100'])[0]).toMatchObject({
      mark: 'health',
      species: 'Whimsicott',
      health: { kind: 'damage', hpBefore: 100, hpAfter: 32 },
    })
  })

  it('says who fainted and marks the row as the bad news it is', () => {
    expect(rows(['|faint|p2a: Whimsicott'])[0]).toMatchObject({
      mark: 'faint',
      species: 'Whimsicott',
      message: { key: 'fainted' },
      tone: 'bad',
    })
  })

  it('reports a terastallization with the type as a parameter', () => {
    expect(rows(['|-terastallize|p1a: Scrafty|Dark'])[0]).toMatchObject({
      mark: 'tera',
      message: { key: 'terastallized', params: { type: 'Dark' } },
      tone: 'accent',
    })
  })

  it('lets the icon be the whole of a forme change, and still says it out loud', () => {
    // Every forme change would read the same three words, and the icon has
    // already changed into the forme. Kept for a screen reader, which has no
    // icon to compare.
    expect(rows(['|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F'])[0]).toMatchObject({
      mark: 'forme',
      species: 'Scrafty-Mega',
      message: { key: 'changedForme' },
      quiet: true,
    })
  })

  it('says out loud the things an icon cannot show', () => {
    expect(rows(['|faint|p2a: Whimsicott'])[0]?.quiet).toBe(false)
    expect(rows(['|-terastallize|p1a: Scrafty|Dark'])[0]?.quiet).toBe(false)
  })

  it('does not say a Mega Evolution changed forme as well', () => {
    // Showdown sends `detailschange` and then `-mega` for one thing happening.
    // Megaing is the event; the forme change is how it is implemented, and the
    // mega row already carries the new forme's icon.
    const rows = rowsOf(
      turnsOf([
        '|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F',
        '|-mega|p1a: Scrafty|Scrafty|Scraftinite',
      ])[1]!,
      { detailed: true },
    )

    expect(rows.map((row) => row.message?.key)).toEqual(['megaEvolved'])
    expect(rows[0]?.species).toBe('Scrafty-Mega')
  })

  it('keeps a forme change that no Mega Evolution follows', () => {
    // Palafin, Zen Mode, Terapagos: the forme change is the event.
    const rows = rowsOf(turnsOf(['|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F'])[1]!, {
      detailed: true,
    })

    expect(rows.map((row) => row.message?.key)).toEqual(['changedForme'])
  })

  it('reads a switch as the trade it is: who left, who came in', () => {
    // Two icons and an arrow say it without a word, so the sentence is left to
    // the screen reader.
    expect(rows(['|switch|p1a: Toxapex|Toxapex, L50, M|100/100'])[0]).toMatchObject({
      mark: 'switch',
      species: 'Scrafty',
      targets: [{ species: 'Toxapex', notes: [] }],
      message: { key: 'cameInFor' },
      quiet: true,
    })
  })

  it('says "came in" in words when there was nobody to come in for', () => {
    // The lead, and anyone taking an empty position: there is no trade to draw.
    expect(rows(['|switch|p1b: Garchomp|Garchomp, L50, F|100/100'])[0]).toMatchObject({
      species: 'Garchomp',
      targets: [],
      message: { key: 'cameIn' },
      quiet: false,
    })
  })

  it('leaves an Illusion reveal as the reveal, not as a substitution', () => {
    // Nobody left the field: the same body is standing there under its own name.
    expect(rows(['|replace|p2a: Zoroark|Zoroark-Hisui, L50, M'])[0]).toMatchObject({
      species: 'Zoroark-Hisui',
      targets: [],
      message: { key: 'wasAnIllusion' },
      quiet: false,
    })
  })

  it('keeps the lead switches, which are what turn 0 is', () => {
    const lead = rowsOf(turnsOf([])[0]!, { detailed: false })

    expect(lead.map((row) => row.species)).toEqual(['Scrafty', 'Whimsicott'])
    expect(lead[0]?.message).toEqual({ key: 'cameIn' })
  })

  it('keeps an ability on the main line, where it decides turns', () => {
    // Intimidate, Snow Warning, Protosynthesis: what an ability did is as much
    // of the turn as the moves are, and it is announced once.
    expect(rows(['|-ability|p1a: Scrafty|Intimidate'])).toMatchObject([
      { species: 'Scrafty', message: { key: 'ability', params: { ability: 'Intimidate' } } },
    ])
    expect(sidelinedCount(turnsOf(['|-ability|p1a: Scrafty|Intimidate'])[1]!)).toBe(0)
  })

  it('draws a field effect going up and coming down, on the main line', () => {
    // Trick Room decides every turn it is up, and its end has no move of its
    // own to be read from — holding either back behind "the rest of this turn"
    // is how the timeline came to show neither at all (#104).
    const set = ['|-fieldstart|move: Trick Room|[of] p1a: Scrafty']
    const lifted = ['|-fieldend|move: Trick Room']

    expect(rows(set)).toMatchObject([
      {
        side: null,
        // Whoever the log said set it, so the row has a face. Nothing is
        // inferred: a terrain a move set names nobody and shows nobody.
        species: 'Scrafty',
        message: { key: 'fieldEffectStarted', params: { effect: 'Trick Room' } },
      },
    ])
    expect(sidelinedCount(turnsOf(set)[1]!)).toBe(0)

    expect(rows(lifted)).toMatchObject([
      {
        species: null,
        message: { key: 'fieldEffectEnded', params: { effect: 'Trick Room' } },
      },
    ])
    expect(sidelinedCount(turnsOf(lifted)[1]!)).toBe(0)
  })

  it('keeps the weather an ability set, and not the turns it kept blowing', () => {
    // Measured: the line that sets it carries `[from] ability: Snow Warning`,
    // and the eight after it are `[upkeep]` — the same weather, once a turn.
    const set = ['|-weather|Snowscape|[from] ability: Snow Warning|[of] p1a: Ninetales']
    const upkeep = ['|-weather|Snowscape|[upkeep]']

    expect(rows(set)).toMatchObject([
      { message: { key: 'weather', params: { weather: 'Snowscape' } } },
    ])
    expect(sidelinedCount(turnsOf(set)[1]!)).toBe(0)

    expect(rows(upkeep)).toEqual([])
    expect(rows(upkeep, true)).toHaveLength(1)
    expect(sidelinedCount(turnsOf(upkeep)[1]!)).toBe(1)
  })

  it('holds back the supporting events until they are asked for', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-supereffective|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|32/100',
      '|-boost|p1a: Scrafty|atk|1',
      '|-activate|p2a: Whimsicott|move: Protect',
      '|-enditem|p2a: Whimsicott|Sitrus Berry',
    ]

    // The whole turn reads on one row: it moved, it was super effective, it
    // took 68%, and its own attack went up. The berry is available and not in
    // the way.
    expect(rows(lines).map((row) => row.mark)).toEqual(['move'])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(1)
    expect(rows(lines, true)).toHaveLength(2)
  })

  it('never shows a line the parser could not read, at either level', () => {
    // Kept by the parser so that a "show the raw log" switch needs no parser
    // change, and shown by neither level until there is one.
    const lines = ['|upkeep', '|inactive|Alice has 30 seconds left.']

    expect(rows(lines, true)).toEqual([])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(0)
  })

  it('describes a stat change in the stats’ own terms', () => {
    expect(rows(['|-unboost|p2a: Whimsicott|atk|1'], true)[0]).toMatchObject({
      message: { key: 'statFell', params: { stat: 'atk', stages: '1' } },
    })
    expect(rows(['|-boost|p1a: Scrafty|spe|2'], true)[0]).toMatchObject({
      message: { key: 'statRose', params: { stat: 'spe', stages: '2' } },
    })
  })
  it('says what a line that rewrote the stat changes did, on a row of its own', () => {
    const said = (line: string) => rows([line], true)[0]

    // Nobody's line, so nobody's rail: Haze names no Pokémon at all.
    expect(said('|-clearallboost')).toMatchObject({
      side: null,
      species: null,
      message: { key: 'allBoostsCleared' },
    })
    expect(said('|-clearboost|p1a: Scrafty')).toMatchObject({
      side: 'p1',
      species: 'Scrafty',
      message: { key: 'boostsCleared' },
    })
    expect(
      said('|-clearpositiveboost|p2a: Whimsicott|p1a: Scrafty|move: Spectral Thief'),
    ).toMatchObject({ species: 'Whimsicott', message: { key: 'positiveBoostsCleared' } })
    // A set says where the stat now stands, sign and all — `atk 6` would read
    // as six of something rather than as the top of the scale.
    expect(said('|-setboost|p1a: Scrafty|atk|6|[from] move: Belly Drum')).toMatchObject({
      message: { key: 'boostSet', params: { stat: 'atk', stages: '+6' } },
    })
    expect(said('|-invertboost|p1a: Scrafty')).toMatchObject({
      message: { key: 'boostsInverted' },
    })
  })

  it('puts the other Pokémon of a trade behind the arrow, where a swap needs two', () => {
    const swap = rows(
      ['|-swapboost|p1a: Scrafty|p2a: Whimsicott|atk, spa|[from] move: Power Swap'],
      true,
    )[0]

    expect(swap).toMatchObject({
      side: 'p1',
      species: 'Scrafty',
      targets: [{ species: 'Whimsicott' }],
      // The stats as the log spelled them, comma-joined: the component is what
      // puts each into the reader's language.
      message: { key: 'boostsSwapped', params: { stats: 'atk,spa' } },
    })

    // Heart Swap names no stats, so the sentence cannot list any.
    expect(
      rows(['|-swapboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Heart Swap'], true)[0],
    ).toMatchObject({ message: { key: 'allBoostsSwapped' }, targets: [{ species: 'Whimsicott' }] })

    expect(
      rows(['|-copyboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Psych Up'], true)[0],
    ).toMatchObject({
      species: 'Scrafty',
      targets: [{ species: 'Whimsicott' }],
      message: { key: 'boostsCopied' },
    })
  })
})

describe('the results an action gathers onto its own row', () => {
  it('pins how a hit landed on the Pokémon it landed on', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-supereffective|p2a: Whimsicott',
    ]

    expect(rows(lines)).toMatchObject([
      {
        move: 'Knock Off',
        targets: [{ species: 'Whimsicott', notes: [{ key: 'hit.supereffective' }] }],
      },
    ])
  })
  it('makes room on the row for a Pokémon that only turns up in the results', () => {
    // Measured: `|move|p2b: Gholdengo|Make It Rain|p1b: Garchomp|[spread] p1a`.
    // The spread list is the targets, and the Garchomp that protected is named
    // in no other place than its own result — so a row that only had targets
    // could not show who stopped the move.
    const lines = [
      '|switch|p1b: Garchomp|Garchomp, L50, F|100/100',
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p2b: Gholdengo|Make It Rain|p1b: Garchomp|[spread] p1a',
      '|-activate|p1b: Garchomp|move: Protect',
    ]

    expect(rows(lines).at(-1)).toMatchObject({
      move: 'Make It Rain',
      targets: [{ species: 'Scrafty', notes: [] }],
      bystanders: [
        { species: 'Garchomp', notes: [{ key: 'effectHeld', params: { effect: 'Protect' } }] },
      ],
    })
  })
  it('gathers a result that arrives after the damage did', () => {
    // Nothing about a `-damage` says the move is over, and measured logs put
    // the stat drop and the Protect that held on the far side of it.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|32/100',
      '|-resisted|p2a: Whimsicott',
    ]

    expect(rows(lines)[0]?.targets[0]?.notes).toEqual([{ key: 'hit.resisted', quiet: false }])
    expect(rows(lines)).toHaveLength(1)
  })
  it('puts the Protect that went up on the Pokémon that put it up', () => {
    // `-singleturn` names the user, not a target: it is the move working, and
    // the row already says `Protect`, so the words are the screen reader's.
    const lines = ['|move|p1a: Scrafty|Protect|p1a: Scrafty', '|-singleturn|p1a: Scrafty|Protect']

    expect(rows(lines)).toMatchObject([
      {
        move: 'Protect',
        targets: [],
        notes: [{ key: 'effectStarted', params: { effect: 'Protect' }, quiet: true }],
      },
    ])
  })
  it('reads a move’s own -activate as the move working, not as a block', () => {
    // `-activate` is Showdown's generic "this effect did something", and a
    // Skill Swap announces its success with one. Read as a block it said a
    // move that worked had been stopped, and said its own name twice (#151).
    const lines = [
      '|move|p1a: Scrafty|Skill Swap|p2a: Whimsicott',
      '|-activate|p1a: Scrafty|Skill Swap',
    ]

    expect(rows(lines)).toMatchObject([
      {
        move: 'Skill Swap',
        notes: [{ key: 'effectActivated', params: { effect: 'Skill Swap' }, quiet: true }],
      },
    ])
  })
  it('reads an -activate that stopped nothing as the effect firing', () => {
    // The 11 `-activate` lines in the fixtures that are not a guard: Toxic
    // Debris, Quick Claw, Supreme Overlord, confusion, and the residual ticks
    // of Infestation and Magma Storm. None of them stopped a move.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-activate|p2a: Whimsicott|ability: Toxic Debris',
    ]

    expect(rows(lines)[0]?.targets[0]?.notes).toEqual([
      { key: 'effectActivated', params: { effect: 'Toxic Debris' }, quiet: false },
    ])
  })
  it('shows the Pokémon an -activate named, on the row that stands alone', () => {
    // A Skill Swap that folds onto its move already shows the other half
    // behind the move's arrow. One that does not — nothing is open across a
    // switch — had nowhere to show it at all, because `[of]` reached no row.
    // Beside the dot, not behind the arrow: `[of]` names the one that was
    // traded with here and the one doing the trapping on a Magma Storm tick,
    // so the direction is the log's to state and it does not (#152).
    const lines = [
      '|switch|p2a: Toxapex|Toxapex, L50, M|100/100',
      '|-activate|p1a: Scrafty|Skill Swap|||[of] p2a: Toxapex',
    ]

    expect(rows(lines, true).at(-1)).toMatchObject({
      species: 'Scrafty',
      targets: [],
      bystanders: [{ species: 'Toxapex', notes: [], hits: [] }],
      message: { key: 'effectActivated', params: { effect: 'Skill Swap' } },
    })
  })
  it('leaves the row of an -activate that named nobody pointing at nothing', () => {
    const lines = [
      '|switch|p2a: Toxapex|Toxapex, L50, M|100/100',
      '|-activate|p1a: Scrafty|ability: Toxic Debris',
    ]

    expect(rows(lines, true).at(-1)).toMatchObject({
      species: 'Scrafty',
      targets: [],
      bystanders: [],
    })
  })
  it('draws no second icon for an -activate that named its own subject', () => {
    const lines = [
      '|switch|p2a: Toxapex|Toxapex, L50, M|100/100',
      '|-activate|p1a: Scrafty|Trick|||[of] p1a: Scrafty',
    ]

    expect(rows(lines, true).at(-1)).toMatchObject({ species: 'Scrafty', bystanders: [] })
  })
  it('keeps “held” for a Safeguard, which no fixture carries', () => {
    // Safeguard and Mist announce a status move or a stat drop turned away on
    // the same line a Protect does, and neither is in the fixtures — so this
    // is the only thing holding them to the wording they share (#151).
    const lines = [
      '|move|p1a: Scrafty|Thunder Wave|p2a: Whimsicott',
      '|-activate|p2a: Whimsicott|move: Safeguard',
    ]

    expect(rows(lines)[0]?.targets[0]?.notes).toEqual([
      { key: 'effectHeld', params: { effect: 'Safeguard' }, quiet: false },
    ])
  })
  it('keeps “held” for the moves whose whole job is to stop one', () => {
    // The 37 of the fixtures' 48 that are a guard, and the reason the wording
    // was written this way in the first place.
    const lines = [
      '|move|p1a: Scrafty|Rock Slide|p2a: Whimsicott',
      '|-activate|p2a: Whimsicott|move: Wide Guard',
    ]

    expect(rows(lines)[0]?.targets[0]?.notes).toEqual([
      { key: 'effectHeld', params: { effect: 'Wide Guard' }, quiet: false },
    ])
  })
  it('folds a volatile the move put on onto that move’s row', () => {
    // Leech Seed's row already says Leech Seed, so the note the target carries
    // is the same word twice: quiet, like the Protect that goes up.
    const seeded = [
      '|move|p1a: Scrafty|Leech Seed|p2a: Whimsicott',
      '|-start|p2a: Whimsicott|move: Leech Seed',
    ]

    expect(rows(seeded)).toMatchObject([
      {
        move: 'Leech Seed',
        targets: [
          {
            species: 'Whimsicott',
            notes: [{ key: 'volatileStarted', params: { effect: 'Leech Seed' }, quiet: true }],
          },
        ],
      },
    ])
  })

  it('says a volatile the move did not name, and one wearing off', () => {
    // Confuse Ray leaves `confusion`, which is not the move's name, so the
    // note has something to add. A volatile coming off has no move open at
    // all: it happens at the end of the turn, on a row of its own.
    const confused = [
      '|move|p2a: Whimsicott|Confuse Ray|p1a: Scrafty',
      '|-start|p1a: Scrafty|confusion',
    ]

    expect(rows(confused)[0]?.targets[0]?.notes).toEqual([
      { key: 'volatileStarted', params: { effect: 'confusion' }, quiet: false },
    ])

    expect(rows(['|-end|p1a: Scrafty|move: Taunt'], true)).toMatchObject([
      { species: 'Scrafty', message: { key: 'volatileEnded', params: { effect: 'Taunt' } } },
    ])
  })

  it('keeps a volatile that ran out on the residual off the last move’s row', () => {
    // Measured in `gen9ou-2667296078` turn 10: a Taunt wore off after the
    // turn's last move, and folding it there made the row read as though Surf
    // had removed it. Nothing closes an action but a move or a switch, so the
    // residual phase is still inside the last one — and this file's own rule
    // is that a row never claims causality.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100',
      '|-end|p1a: Scrafty|move: Taunt',
    ]

    expect(rows(lines, true)).toMatchObject([
      { move: 'Knock Off', notes: [] },
      { species: 'Scrafty', message: { key: 'volatileEnded', params: { effect: 'Taunt' } } },
    ])
  })

  it('folds a Substitute the move broke onto that move’s row', () => {
    // The other half of the same line: on a Pokémon the move was aimed at,
    // the move is the only thing that could have taken it off.
    const lines = [
      '|-start|p2a: Whimsicott|Substitute',
      '|turn|2',
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-end|p2a: Whimsicott|Substitute',
    ]
    const turn = turnsOf(lines)[2]!

    expect(rowsOf(turn, { detailed: false })).toMatchObject([
      {
        move: 'Knock Off',
        targets: [
          {
            species: 'Whimsicott',
            notes: [{ key: 'volatileEnded', params: { effect: 'Substitute' }, quiet: false }],
          },
        ],
      },
    ])
  })

  it('says an Illusion breaking once, not twice', () => {
    // Showdown sends `|replace|` and then `|-end|…|Illusion` for the one
    // thing, measured in `gen9championsvgc2026regmb-2667169457` turn 2. The
    // reveal row already says it.
    const lines = ['|replace|p2a: Zoroark|Zoroark-Hisui, L50, M']

    expect(rows([...lines, '|-end|p2a: Zoroark|Illusion'], true)).toEqual(rows(lines, true))
  })

  it('says an ability that was taken off, and nothing when the log did not name it', () => {
    const named = [
      '|move|p2a: Whimsicott|Gastro Acid|p1a: Scrafty',
      '|-endability|p1a: Scrafty|Fairy Aura|[from] move: Gastro Acid',
    ]

    // On the main line: an ability going away decides the turns after it as
    // much as the `|-ability|` that announced it does.
    expect(rows(named)).toMatchObject([
      { move: 'Gastro Acid' },
      { species: 'Scrafty', message: { key: 'abilityEnded', params: { ability: 'Fairy Aura' } } },
    ])

    // Nothing named means nothing to say, so there is no row rather than a row
    // with a hole in it.
    expect(rows(['|-endability|p1a: Scrafty'], true)).toEqual([])
  })

  it('folds a failure onto the move that failed', () => {
    const failed = ['|move|p1a: Scrafty|Protect|p1a: Scrafty', '|-fail|p1a: Scrafty']

    // On the Pokémon that used the move, which is whose failure it is. A miss
    // is the one that moved off the user — see 'a move that missed' below,
    // and #149 for why.
    expect(rows(failed)).toMatchObject([{ move: 'Protect', notes: [{ key: 'failed' }] }])
  })
  it('gives each target of a spread move its own result', () => {
    const lines = [
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p1a: Scrafty|Rock Slide|p2a: Whimsicott|[spread] p2a,p2b',
      '|-supereffective|p2b: Gholdengo',
      '|-resisted|p2a: Whimsicott',
    ]

    // In the order the log listed the targets, not the order the results
    // arrived in: the icons stay where the reader last saw them.
    expect(rows(lines).at(-1)?.targets).toEqual([
      { species: 'Whimsicott', notes: [{ key: 'hit.resisted', quiet: false }], hits: [] },
      { species: 'Gholdengo', notes: [{ key: 'hit.supereffective', quiet: false }], hits: [] },
    ])
  })

  it('closes an action at the next move, and at a switch', () => {
    const nextMove = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|move|p2a: Whimsicott|Moonblast|p1a: Scrafty',
      '|-resisted|p1a: Scrafty',
    ]
    const afterSwitch = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|switch|p2a: Toxapex|Toxapex, L50, M|100/100',
      '|-activate|p2a: Toxapex|move: Protect',
    ]

    // The result belongs to Moonblast, whose user it names, and not to the
    // Knock Off two rows up.
    const [knockOff, moonblast] = rows(nextMove)
    expect(knockOff?.targets[0]?.notes).toEqual([])
    expect(moonblast?.targets[0]?.notes).toEqual([{ key: 'hit.resisted', quiet: false }])

    // Nothing is open across a switch, so the effect keeps its own row.
    expect(rows(afterSwitch, true).map((row) => row.message?.key)).toEqual([
      undefined,
      'cameInFor',
      'effectHeld',
    ])
    expect(rows(afterSwitch)[0]?.targets[0]?.notes).toEqual([])
  })
})

/**
 * The stat changes a move caused, on the row of the move that caused them
 * (#206). The gate is the one T26 wrote for the damage: the log's own fields
 * and nothing else, so a Weakness Policy that fired under a move stays off it.
 */
describe('the stat changes an action gathers onto its own row', () => {
  it('folds a drop onto the target the move itself named', () => {
    const lines = [
      '|move|p1a: Scrafty|Parting Shot|p2a: Whimsicott',
      '|-unboost|p2a: Whimsicott|atk|1',
      '|-unboost|p2a: Whimsicott|spa|1',
    ]

    expect(rows(lines)).toMatchObject([
      {
        move: 'Parting Shot',
        targets: [
          {
            species: 'Whimsicott',
            notes: [
              { key: 'statFell', params: { stat: 'atk', stages: '1' }, quiet: false },
              { key: 'statFell', params: { stat: 'spa', stages: '1' }, quiet: false },
            ],
          },
        ],
      },
    ])
    // Folding is a way of drawing, not a second row: the turn is no longer.
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(0)
  })

  it('puts a stat change on the Pokémon that took the hit, in its own slot', () => {
    // The drop arrives after the damage, so it is the target's rather than
    // that hit's: a hit carries what the log said before it (#170).
    const lines = [
      '|move|p1a: Scrafty|Crunch|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|62/100',
      '|-unboost|p2a: Whimsicott|def|1',
    ]

    expect(rows(lines)[0]?.targets[0]).toMatchObject({
      species: 'Whimsicott',
      hits: [{ notes: [] }],
      notes: [{ key: 'statFell', params: { stat: 'def', stages: '1' } }],
    })
  })

  it('folds a stat change the move put on its own user onto the row itself', () => {
    expect(
      rows(['|move|p1a: Scrafty|Swords Dance|p1a: Scrafty', '|-boost|p1a: Scrafty|atk|2'])[0],
    ).toMatchObject({
      move: 'Swords Dance',
      targets: [],
      notes: [{ key: 'statRose', params: { stat: 'atk', stages: '2' }, quiet: false }],
    })
  })

  it('folds a line whose named source is the move already on the row', () => {
    // Belly Drum says `[from] move: Belly Drum`, which is the open move saying
    // it did this — the opposite of the Life Orb case `from` exists to catch.
    const lines = [
      '|move|p1a: Scrafty|Belly Drum|p1a: Scrafty',
      '|-setboost|p1a: Scrafty|atk|6|[from] move: Belly Drum',
    ]

    expect(rows(lines)[0]?.notes).toEqual([
      { key: 'boostSet', params: { stat: 'atk', stages: '+6' }, quiet: false },
    ])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(0)
  })

  it('leaves a stat change the log blamed on something else on its own row', () => {
    // A Weakness Policy fires on a Pokémon the move did hit, so the target
    // test alone would put an item's work on the attacker's row.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100',
      '|-boost|p2a: Whimsicott|atk|2|[from] item: Weakness Policy',
    ]

    expect(rows(lines).map((row) => [row.move, row.message?.key])).toEqual([
      ['Knock Off', undefined],
      [null, 'statRose'],
    ])
    expect(rows(lines)[0]?.targets[0]?.notes).toEqual([])
    // On the main line, so the switch offers nothing that is already drawn.
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(0)
  })

  it('reads the whole of a named source, namespace included', () => {
    // `item: Metronome` and the move Metronome share a name, and the half that
    // tells them apart is the one a bare-name comparison throws away.
    const lines = [
      '|move|p1a: Scrafty|Metronome|p1a: Scrafty',
      '|-boost|p1a: Scrafty|atk|1|[from] item: Metronome',
    ]

    expect(rows(lines).map((row) => row.message?.key)).toEqual([undefined, 'statRose'])
    expect(rows(lines)[0]?.notes).toEqual([])
  })

  it('leaves a stat change with no move open on its own row', () => {
    // The residual phase, and anything after a switch closed the action: there
    // is no move to fold onto, and the line is still what decided the turn.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|switch|p2a: Gholdengo|Gholdengo, L50|100/100',
      '|-boost|p1a: Scrafty|spe|1',
    ]

    expect(rows(lines).map((row) => row.message?.key)).toEqual([undefined, 'cameInFor', 'statRose'])
  })

  it('folds nothing onto a Pokémon the move was never aimed at', () => {
    // A bystander is made for a result that named one; a stat change is not
    // one of those, because nothing in the line ties it to this move.
    const lines = ['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott', '|-unboost|p2b: Garchomp|atk|1']

    expect(rows(lines, false, FOUR_UP).map((row) => row.message?.key)).toEqual([
      undefined,
      'statFell',
    ])
    expect(rows(lines, false, FOUR_UP)[0]?.bystanders).toEqual([])
  })

  it('folds the lines that rewrite stat changes by the same rule', () => {
    // Named the target → that target's slot; named the user → the row itself.
    // The partner of a swap is already behind the row's own arrow, so nothing
    // is lost by folding a line that carries two Pokémon.
    const smog = [
      '|move|p1a: Scrafty|Clear Smog|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|62/100',
      '|-clearboost|p2a: Whimsicott',
    ]
    const heartSwap = [
      '|move|p1a: Scrafty|Heart Swap|p2a: Whimsicott',
      '|-swapboost|p1a: Scrafty|p2a: Whimsicott|[from] move: Heart Swap',
    ]

    expect(rows(smog)[0]?.targets[0]?.notes).toEqual([{ key: 'boostsCleared', quiet: false }])
    expect(rows(heartSwap)[0]).toMatchObject({
      move: 'Heart Swap',
      targets: [{ species: 'Whimsicott' }],
      notes: [{ key: 'allBoostsSwapped', quiet: false }],
    })
  })

  it('keeps a Haze on the main line, because it names nobody to fold onto', () => {
    const lines = ['|move|p2a: Whimsicott|Haze|p2a: Whimsicott', '|-clearallboost']

    expect(rows(lines).map((row) => row.message?.key)).toEqual([undefined, 'allBoostsCleared'])
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(0)
  })
})

/**
 * The stat changes an ability announced, on the row that announced it (#207).
 *
 * The pairing is the marker #205 kept — Showdown's own note that this
 * announcement is there for a stat change — and not "the line after this one".
 */
describe('the stat changes an announcement gathers onto its own row', () => {
  it('draws the drops an Intimidate announced beside the dot, one icon each', () => {
    const lines = [
      '|-ability|p1a: Scrafty|Intimidate|boost',
      '|-unboost|p2a: Whimsicott|atk|1',
      '|-unboost|p2b: Garchomp|atk|1',
    ]

    expect(rows(lines, false, FOUR_UP)).toMatchObject([
      {
        species: 'Scrafty',
        message: { key: 'ability', params: { ability: 'Intimidate' } },
        // Behind no arrow: the line says the ability fired, not who it aimed
        // at, and an arrow would claim a direction the log never stated.
        targets: [],
        bystanders: [
          { species: 'Whimsicott', notes: [{ key: 'statFell', params: { stat: 'atk' } }] },
          { species: 'Garchomp', notes: [{ key: 'statFell', params: { stat: 'atk' } }] },
        ],
        notes: [],
      },
    ])
    expect(sidelinedCount(turnsOf(lines, FOUR_UP)[1]!)).toBe(0)
  })

  it('draws a drop on the ability’s own holder on the row itself', () => {
    // Speed Boost, which fires at the end of the turn on the Pokémon holding
    // it: an icon of the Pokémon already at the head of the row says nothing
    // twice, the same rule an `-activate` naming its own subject follows.
    const lines = ['|-ability|p1a: Scrafty|Speed Boost|boost', '|-boost|p1a: Scrafty|spe|1']

    expect(rows(lines)[0]).toMatchObject({
      species: 'Scrafty',
      message: { key: 'ability', params: { ability: 'Speed Boost' } },
      bystanders: [],
      notes: [{ key: 'statRose', params: { stat: 'spe', stages: '1' }, quiet: false }],
    })
  })

  it('gives one icon to a Pokémon the announcement moved twice', () => {
    const lines = [
      '|-ability|p1a: Scrafty|Intimidate|boost',
      '|-unboost|p2a: Whimsicott|atk|1',
      '|-unboost|p2a: Whimsicott|spa|1',
    ]

    expect(rows(lines)[0]?.bystanders).toMatchObject([
      { species: 'Whimsicott', notes: [{ key: 'statFell' }, { key: 'statFell' }] },
    ])
  })

  it('collects nothing for an announcement the log put no marker on', () => {
    // Pressure and Unnerve announce themselves and mean nothing of the sort.
    // Their neighbour keeps the row #206 gave it.
    const lines = ['|-ability|p1a: Scrafty|Pressure', '|-unboost|p2a: Whimsicott|atk|1']

    expect(rows(lines).map((row) => row.message?.key)).toEqual(['ability', 'statFell'])
    expect(rows(lines)[0]?.bystanders).toEqual([])
  })

  it('stops collecting at the first line that is not a stat change', () => {
    // The marker says this announcement is about a stat change; it does not
    // say how far down the log to keep reading. Anything else closes it.
    const lines = [
      '|-ability|p1a: Scrafty|Intimidate|boost',
      '|-unboost|p2a: Whimsicott|atk|1',
      '|-damage|p2a: Whimsicott|90/100',
      '|-unboost|p2b: Garchomp|atk|1',
    ]

    expect(rows(lines, false, FOUR_UP).map((row) => row.message?.key)).toEqual([
      'ability',
      undefined,
      'statFell',
    ])
    expect(rows(lines, false, FOUR_UP)[0]?.bystanders).toMatchObject([{ species: 'Whimsicott' }])
  })

  it('keeps an announcement that collected nothing as the bare row it is', () => {
    // Measured in `gen9ou-2667299955` turn 18: a marked Intimidate whose drop
    // never came. The marker is a claim about the announcement, not a promise
    // about what follows.
    const lines = ['|-ability|p1a: Scrafty|Intimidate|boost', '|-resisted|p2a: Whimsicott']

    expect(rows(lines, true).map((row) => row.message?.key)).toEqual(['ability', 'hit.resisted'])
    expect(rows(lines, true)[0]?.bystanders).toEqual([])
  })

  it('keeps an open move from eating what an ability announced', () => {
    // The drop is on a Pokémon Knock Off named as its target and carries no
    // source, so #206's gate alone would fold it onto Knock Off. The
    // announcement is the nearer claim, and it is the log's own.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100',
      '|-ability|p1b: Torkoal|Intimidate|boost',
      '|-unboost|p2a: Whimsicott|atk|1',
    ]
    const drawn = rows(lines, false, FOUR_UP)

    expect(drawn[0]).toMatchObject({ move: 'Knock Off', targets: [{ notes: [] }] })
    expect(drawn[1]).toMatchObject({
      species: 'Torkoal',
      bystanders: [{ species: 'Whimsicott', notes: [{ key: 'statFell' }] }],
    })
  })

  it('keeps an announcement from eating what a move caused', () => {
    // And the other way: the move line closes the announcement, so the drop
    // that follows it is the move's by #206's gate.
    const lines = [
      '|-ability|p1b: Torkoal|Intimidate|boost',
      '|-unboost|p2a: Whimsicott|atk|1',
      '|move|p1a: Scrafty|Parting Shot|p2a: Whimsicott',
      '|-unboost|p2a: Whimsicott|spa|1',
    ]
    const drawn = rows(lines, false, FOUR_UP)

    expect(drawn[0]?.bystanders).toMatchObject([
      { species: 'Whimsicott', notes: [{ key: 'statFell', params: { stat: 'atk' } }] },
    ])
    expect(drawn[1]).toMatchObject({
      move: 'Parting Shot',
      targets: [{ species: 'Whimsicott', notes: [{ key: 'statFell', params: { stat: 'spa' } }] }],
    })
  })
})

describe('the damage an action gathers onto its own row', () => {
  it('folds a hit onto the target it hit, when the log named no other source', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100',
    ]

    expect(rows(lines)).toMatchObject([
      {
        move: 'Knock Off',
        targets: [{ species: 'Whimsicott', hits: [{ change: { hpBefore: 100, hpAfter: 38 } }] }],
      },
    ])
    expect(rows(lines)).toHaveLength(1)
  })
  it('leaves the damage the log gave a source of on its own row', () => {
    // Measured on turn 3 of the ladder fixture: `[from] item: Life Orb` on the
    // Pokémon that just used the move, and `[from] brn` at the end of the turn.
    // Both would be a lie beside the move's target icon, and `from` is the log
    // saying so itself.
    const lines = [
      '|move|p2a: Whimsicott|Moonblast|p1a: Scrafty',
      '|-damage|p1a: Scrafty|62/100',
      '|-damage|p2a: Whimsicott|90/100|[from] item: Life Orb',
      '|-damage|p1a: Scrafty|56/100 brn|[from] brn',
      '|-heal|p1a: Scrafty|62/100|[from] item: Leftovers',
    ]

    expect(rows(lines).map((row) => [row.mark, row.species, row.health?.from])).toEqual([
      ['move', 'Whimsicott', undefined],
      ['health', 'Whimsicott', 'item: Life Orb'],
      ['health', 'Scrafty', 'brn'],
      ['health', 'Scrafty', 'item: Leftovers'],
    ])
    // The one with no source of its own is the one that went onto the row.
    expect(rows(lines)[0]?.targets[0]?.hits).toMatchObject([{ change: { hpAfter: 62 } }])
  })

  it('folds nothing onto a Pokémon the move was never aimed at', () => {
    // Garchomp is on the row because it stopped the move, not because the log
    // called it a target — so a change in its HP is nobody's to claim.
    const lines = [
      '|switch|p1b: Garchomp|Garchomp, L50, F|100/100',
      '|move|p2a: Whimsicott|Make It Rain|p1b: Garchomp|[spread] p1a',
      '|-activate|p1b: Garchomp|move: Protect',
      '|-damage|p1b: Garchomp|80/100',
    ]

    const [move, hurt] = rows(lines).slice(-2)
    expect(move?.bystanders).toEqual([
      {
        species: 'Garchomp',
        notes: [{ key: 'effectHeld', params: { effect: 'Protect' }, quiet: false }],
        hits: [],
      },
    ])
    expect(hurt).toMatchObject({ mark: 'health', species: 'Garchomp' })
  })

  it('keeps both hits of a move that hit twice', () => {
    const lines = [
      '|move|p1a: Scrafty|Dual Wingbeat|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|70/100',
      '|-damage|p2a: Whimsicott|41/100',
    ]

    expect(rows(lines)[0]?.targets[0]?.hits).toMatchObject([
      { change: { hpAfter: 70 } },
      { change: { hpAfter: 41 } },
    ])
  })

  it('gives each hit the results that arrived before it, and not its neighbour’s', () => {
    // Surging Strikes reports every hit the way a single hit is reported, so
    // the only boundary is the damage line that closes one (#170). Which hit a
    // crit belongs to is what a reading of one hit per line is made of.
    const lines = [
      '|move|p1a: Scrafty|Surging Strikes|p2a: Whimsicott',
      '|-resisted|p2a: Whimsicott',
      '|-crit|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|87/100',
      '|-crit|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|75/100',
    ]

    expect(rows(lines)[0]?.targets[0]).toMatchObject({
      notes: [],
      hits: [
        {
          notes: [{ key: 'hit.resisted' }, { key: 'hit.crit' }],
          change: { hpAfter: 87 },
        },
        { notes: [{ key: 'hit.crit' }], change: { hpAfter: 75 } },
      ],
    })
  })

  it('leaves a result that followed the last hit off every hit', () => {
    // Nothing closes it, and hanging it on the hit before would say the move
    // did it in that bite. It stays the target's own note, as it is today.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100',
      '|-activate|p2a: Whimsicott|move: Protect',
    ]

    expect(rows(lines)[0]?.targets[0]).toMatchObject({
      notes: [{ key: 'effectHeld', params: { effect: 'Protect' } }],
      hits: [{ notes: [], change: { hpAfter: 38 } }],
    })
  })

  it('pairs every hit of a real multi-hit move with its own crit and resist', () => {
    // The battle #170 was reported from: three hits on one Rillaboom in one
    // turn, with a Fake Out on the other slot in the same turn — the neighbour
    // a per-hit reading must not swallow.
    const turn = parseTimeline(multiHit.log).turns.find((it) => it.number === 1)
    const row = rowsOf(turn!, { detailed: false }).find((it) => it.move === 'Surging Strikes')

    expect(row?.targets).toHaveLength(1)
    expect(row?.targets[0]?.hits).toMatchObject([
      { notes: [{ key: 'hit.resisted' }, { key: 'hit.crit' }], change: { hpAfter: 87 } },
      { notes: [{ key: 'hit.resisted' }, { key: 'hit.crit' }], change: { hpAfter: 75 } },
      { notes: [{ key: 'hit.resisted' }, { key: 'hit.crit' }], change: { hpAfter: 64 } },
    ])
  })

  it('gives each target of a spread move its own numbers, in the log’s order', () => {
    const lines = [
      '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
      '|move|p1a: Scrafty|Rock Slide|p2a: Whimsicott|[spread] p2a,p2b',
      '|-damage|p2b: Gholdengo|61/100',
      '|-damage|p2a: Whimsicott|0 fnt',
    ]

    expect(
      rows(lines)
        .at(-1)
        ?.targets.map((target) => [target.species, target.hits.map((hit) => hit.change.hpAfter)]),
    ).toEqual([
      ['Whimsicott', [0]],
      ['Gholdengo', [61]],
    ])
  })
  it('folds nothing that Showdown itself did not show', () => {
    // A silent line is drawn nowhere at all (T24), and folding decides where a
    // change is drawn rather than whether — so the flag has to be asked here
    // too, or what was hidden reappears on the main line.
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|38/100|[silent]',
    ]

    expect(rows(lines)[0]?.targets[0]?.hits).toEqual([])
    expect(rows(lines, true)).toHaveLength(1)
  })
})

/**
 * What a move failed to hit, and what a knockout is said about — the two
 * places the timeline used to say too little and too much (#149).
 */
describe('a move that missed', () => {
  it('says which Pokémon it failed to hit', () => {
    // The real shape, from `gen9championsvgc2026regmb-2667301751` turn 7.
    const [row] = rows([
      '|move|p1a: Scrafty|Blizzard|p2a: Whimsicott|[miss]',
      '|-miss|p1a: Scrafty|p2a: Whimsicott',
    ])

    expect(row?.targets).toEqual([
      { species: 'Whimsicott', notes: [{ key: 'missed', quiet: false }], hits: [] },
    ])
    // Not on the Pokémon that used it: the row's subject did not dodge
    // anything, and saying it there is what left the reader guessing.
    expect(row?.notes).toEqual([])
  })

  it('says which of two a spread move failed to hit', () => {
    // Also real, from `gen9championsvgc2026regmb-2674380893`: a Rock Slide
    // that hit one and missed the other. The source used to say this shape
    // had never been measured.
    const [row] = rows(
      [
        '|move|p1a: Scrafty|Rock Slide|p2b: Garchomp|[spread] p2b',
        '|-miss|p1a: Scrafty|p2a: Whimsicott',
        '|-damage|p2b: Garchomp|69/100',
      ],
      false,
      FOUR_UP,
    )

    // The one it hit is a target; the one it missed the log never called one,
    // so it stands where a Pokémon an action reached without targeting does.
    expect(row?.targets.map((target) => target.species)).toEqual(['Garchomp'])
    expect(row?.targets[0]?.hits.map((hit) => hit.change.hpAfter)).toEqual([69])
    expect(row?.bystanders).toEqual([
      { species: 'Whimsicott', notes: [{ key: 'missed', quiet: false }], hits: [] },
    ])
  })

  it('keeps the miss on the row when the log named nobody', () => {
    const [row] = rows(['|move|p1a: Scrafty|Blizzard|p2a: Whimsicott', '|-miss|p1a: Scrafty'])

    expect(row?.notes).toEqual([{ key: 'missed', quiet: false }])
    expect(row?.targets[0]?.notes).toEqual([])
  })
})

describe('a Pokémon knocked out', () => {
  it('is said once, on the row of the move that did it', () => {
    const drawn = rows([
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|0 fnt',
      '|faint|p2a: Whimsicott',
    ])

    // The hit that took it to nothing is on the move's row already, and the
    // health chip says so — a row of its own said the same word again.
    expect(drawn.map((row) => row.mark)).toEqual(['move'])
    expect(drawn[0]?.targets[0]?.hits.map((hit) => hit.change.hpAfter)).toEqual([0])
  })

  it('keeps a row of its own when its own move recoiled on it', () => {
    const drawn = rows([
      '|move|p1a: Scrafty|Double-Edge|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|50/100',
      '|-damage|p1a: Scrafty|0 fnt|[from] Recoil',
      '|faint|p1a: Scrafty',
    ])

    // The recoil carries `[from]`, so it never reached the move's row and
    // nothing there says the attacker is gone.
    expect(drawn.filter((row) => row.mark === 'faint').map((row) => row.species)).toEqual([
      'Scrafty',
    ])
  })

  it('keeps a row of its own when a residual tick finished it', () => {
    const drawn = rows([
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|50/100',
      '|-damage|p2a: Whimsicott|0 fnt|[from] psn',
      '|faint|p2a: Whimsicott',
    ])

    // A target of the move, but not killed by it: the row shows the 50 the
    // move took, never a nothing, so the faint is news.
    expect(drawn.filter((row) => row.mark === 'faint').map((row) => row.species)).toEqual([
      'Whimsicott',
    ])
  })

  it('offers the same rows behind the details switch as in front of it', () => {
    const lines = [
      '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
      '|-damage|p2a: Whimsicott|0 fnt',
      '|faint|p2a: Whimsicott',
    ]

    // The count is the difference between the two levels, so a row dropped
    // from one and not the other would be offered and never appear.
    expect(sidelinedCount(turnsOf(lines)[1]!)).toBe(rows(lines, true).length - rows(lines).length)
    expect(rows(lines, true).map((row) => row.mark)).toEqual(['move'])
  })
})

/**
 * The same two rules against whole games rather than written turns, because
 * what made the repetition worth a ticket was that it happened every time
 * (#149).
 *
 * Four games rather than one: the faints that must **survive** are the rare
 * shape, and all six of the first game's are the common one. Life Orb is in
 * `-2667169457`, Recoil in the other two, and between them they also carry an
 * Earthquake that killed both targets at once and a Wave Crash that killed its
 * target and then its user.
 */
describe('whole games', () => {
  const games = [
    { name: '2667301751', log: ladder.log, survives: [] as string[] },
    { name: '2667169457', log: lifeOrb.log, survives: ['Gholdengo'] },
    { name: '2674380893', log: recoil.log, survives: ['Basculegion'] },
    { name: '2674448634', log: recoilToo.log, survives: ['Basculegion'] },
  ]

  const drawnFor = (log: string) =>
    parseTimeline(log).turns.map((turn) => rowsOf(turn, { detailed: false }))

  it.each(games)('never reports the same Pokémon knocked out twice in $name', ({ log }) => {
    const saidTwice = drawnFor(log).flatMap((rows) =>
      rows.flatMap((row, index) => {
        if (row.mark !== 'faint') return []

        const shownBefore = rows
          .slice(0, index)
          .some((earlier) =>
            earlier.targets.some(
              (target) =>
                target.species === row.species &&
                target.hits.some((hit) => hit.change.kind === 'damage' && hit.change.hpAfter === 0),
            ),
          )

        return shownBefore ? [row.species] : []
      }),
    )

    expect(saidTwice).toEqual([])
  })

  it.each(games)(
    'keeps a row for the self-KOs of $name and for nothing else',
    ({ log, survives }) => {
      // The direction that matters: a faint the move's row cannot account for
      // must still be drawn. Life Orb and Recoil kill the Pokémon that attacked,
      // whose damage carries `[from]` and so never reached that row.
      expect(
        drawnFor(log)
          .flat()
          .filter((row) => row.mark === 'faint')
          .map((row) => row.species),
      ).toEqual(survives)
    },
  )

  it.each(games)('accounts for every faint of $name, turn by turn', ({ log }) => {
    // Every `|faint|` the log reports is either drawn as a row or swallowed by
    // a row that shows that Pokémon at nothing — reconciled per turn, so a
    // change that started dropping or drawing wholesale would show up here.
    //
    // What this does **not** reach: a target finished by a residual tick, the
    // shape where the Pokémon is a target but the row cannot account for it.
    // None of the ten fixtures has one — all 61 of their faints follow a
    // damage to 0 — so the written turn above is that case's only guard.
    const turns = parseTimeline(log).turns

    for (const turn of turns) {
      const rows = rowsOf(turn, { detailed: false })
      const faintLines = turn.events.filter((event) => event.kind === 'faint').length
      const drawn = rows.filter((row) => row.mark === 'faint').length
      const swallowed = rows
        .flatMap((row) => row.targets)
        .filter((target) =>
          target.hits.some((hit) => hit.change.kind === 'damage' && hit.change.hpAfter === 0),
        ).length

      expect(drawn + swallowed).toBe(faintLines)
    }
  })

  it('names a dodger wherever it drew a miss', () => {
    const misses = games
      .flatMap((game) => drawnFor(game.log).flat())
      .flatMap((row) => [...row.targets, ...row.bystanders])
      .filter((at) => at.notes.some((note) => note.key === 'missed'))

    expect(misses.length).toBeGreaterThan(0)
    expect(misses.every((at) => at.species.length > 0)).toBe(true)
  })

  it.each(games)('offers in $name exactly the rows the details switch counts', ({ log }) => {
    for (const turn of parseTimeline(log).turns) {
      expect(sidelinedCount(turn)).toBe(
        rowsOf(turn, { detailed: true }).length - rowsOf(turn, { detailed: false }).length,
      )
    }
  })
})

/**
 * The game the wording was reported from, read as a whole rather than as
 * written lines: what made it worth a ticket is that it was a real turn of a
 * real game, and the log's `[of] p2a: Incineroar` is a shape no written test
 * here spells out (#151).
 */
describe('the Skill Swap of gen9championsvgc2026regma-2592519449', () => {
  const turn = parseTimeline(skillSwap.log).turns.find((turn) => turn.number === 4)

  it('says the swap happened, once', () => {
    const row = rowsOf(turn!, { detailed: false }).find((row) => row.move === 'Skill Swap')

    expect(row).toMatchObject({
      side: 'p2',
      species: 'Starmie-Mega',
      targets: [{ species: 'Incineroar' }],
      notes: [{ key: 'effectActivated', params: { effect: 'Skill Swap' }, quiet: true }],
    })
  })
})

/**
 * The turn #206 was written from, read as a whole rather than as written
 * lines: a Parting Shot in a real game whose two drops were behind the details
 * switch, so the reader saw "it happened" and never saw what it did.
 */
describe('the Parting Shot of gen9vgc2024regf-2082942604', () => {
  const turn = parseTimeline(multiHit.log).turns.find((turn) => turn.number === 2)!

  it('draws the drops on the move that caused them, without adding a row', () => {
    // The two the turn used to hide, named here so that the count below is
    // read against the log rather than against itself: both are `-unboost`
    // lines on the Rillaboom the Parting Shot was aimed at.
    expect(turn.events.filter((event) => event.kind === 'boost')).toHaveLength(2)

    // Five main-line rows before this change and five after: what moved is
    // where the two drops are drawn, not how much of the turn is on screen.
    // Behind the switch there were two and now there are none.
    expect(rowsOf(turn, { detailed: false }).length).toBe(5)
    expect(sidelinedCount(turn)).toBe(0)
    expect(
      rowsOf(turn, { detailed: true }).filter((row) => row.message?.key === 'statFell'),
    ).toEqual([])

    expect(
      rowsOf(turn, { detailed: false }).find((row) => row.move === 'Parting Shot')?.targets,
    ).toMatchObject([
      {
        species: 'Rillaboom',
        notes: [
          { key: 'statFell', params: { stat: 'atk', stages: '1' } },
          { key: 'statFell', params: { stat: 'spa', stages: '1' } },
        ],
      },
    ])
  })
})

/**
 * The opening of the same game, which is the picture #207 was written from:
 * two Intimidates on the switch in, four drops between them.
 */
describe('the leads of gen9vgc2024regf-2082942604', () => {
  const turn = parseTimeline(multiHit.log).turns.find((turn) => turn.number === 0)!

  it('draws each Intimidate with the two it lowered beside it', () => {
    // Ten rows before this change — four switches and six lines the log spent
    // on two abilities — and six after. Nothing was behind the details switch
    // either way: #206 put the four drops on the main line, and this one puts
    // them where they belong.
    const drawn = rowsOf(turn, { detailed: false })

    expect(drawn).toHaveLength(6)
    expect(sidelinedCount(turn)).toBe(0)
    expect(drawn.filter((row) => row.message?.key === 'statFell')).toEqual([])

    expect(drawn.filter((row) => row.message?.key === 'ability')).toMatchObject([
      {
        species: 'Incineroar',
        side: 'p1',
        bystanders: [
          { species: 'Incineroar', notes: [{ key: 'statFell', params: { stat: 'atk' } }] },
          { species: 'Amoonguss', notes: [{ key: 'statFell', params: { stat: 'atk' } }] },
        ],
      },
      {
        species: 'Incineroar',
        side: 'p2',
        bystanders: [
          { species: 'Urshifu-Rapid-Strike', notes: [{ key: 'statFell' }] },
          { species: 'Incineroar', notes: [{ key: 'statFell' }] },
        ],
      },
    ])
  })
})

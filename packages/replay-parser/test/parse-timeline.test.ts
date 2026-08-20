import { describe, expect, it } from 'vite-plus/test'
import { parseTimeline } from '../src/index'
import type { BattleTimeline, TimelineEvent } from '../src/index'
import ladderFixture from './fixtures/gen9championsvgc2026regmb-2667169457.json'
import seriesFixture from './fixtures/gen9championsvgc2026regmbbo3-2667582547.json'
import tieFixture from './fixtures/gen9ou-2667293085.json'
import longFixture from './fixtures/gen9ou-2667299955.json'

interface TimelineLog {
  /** Everything after the opening switches, i.e. what the test is about. */
  lines?: string[]
}

/**
 * A minimal doubles log with both sides already on the field, so each test can
 * add only the lines it is about.
 */
function log({ lines = [] }: TimelineLog = {}): string {
  return [
    '|gametype|doubles',
    '|player|p1|Alice|benga|1444',
    '|player|p2|Bob|gentleman|1534',
    '|poke|p1|Scrafty, L50, F|',
    '|poke|p2|Whimsicott, L50, M|',
    '|start',
    '|t:|1787130700',
    '|switch|p1a: Scrafty|Scrafty, L50, F|100/100',
    '|switch|p2a: Whimsicott|Whimsicott, L50, M|100/100',
    '|turn|1',
    '|t:|1787130760',
    ...lines,
  ].join('\n')
}

/** Every event of one kind across the whole timeline, narrowed to that kind. */
function eventsOfKind<K extends TimelineEvent['kind']>(
  timeline: BattleTimeline,
  kind: K,
): Extract<TimelineEvent, { kind: K }>[] {
  return timeline.turns
    .flatMap((turn) => turn.events)
    .filter((event): event is Extract<TimelineEvent, { kind: K }> => event.kind === kind)
}

describe('parseTimeline', () => {
  it('puts the opening switches in a turn 0, before the first numbered turn', () => {
    // The lead is sent before |turn|1. A separate `lead` field would make the
    // opening a special case in every consumer that walks the turns.
    const timeline = parseTimeline(log({ lines: ['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott'] }))

    expect(timeline.turns.map((turn) => turn.number)).toEqual([0, 1])
    expect(timeline.turns[0]?.events.map((event) => event.kind)).toEqual(['switch', 'switch'])
  })

  it('reads the turn start time from the |t:| line that follows the turn', () => {
    const timeline = parseTimeline(log())

    expect(timeline.turns[0]?.startedAt).toBe('2026-08-19T09:11:40.000Z')
    expect(timeline.turns[1]?.startedAt).toBe('2026-08-19T09:12:40.000Z')
  })

  it('names the mover, the move and the target it was aimed at', () => {
    const timeline = parseTimeline(log({ lines: ['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott'] }))

    expect(timeline.turns[1]?.events[0]).toMatchObject({
      kind: 'move',
      move: 'Knock Off',
      actor: { position: 'p1a', side: 'p1', species: 'Scrafty' },
      targets: [{ position: 'p2a', species: 'Whimsicott' }],
    })
  })

  it('lists every target of a spread move, not only the one named first', () => {
    // The log says who a spread move hit — this is read, not inferred.
    const timeline = parseTimeline(
      log({
        lines: [
          '|switch|p1b: Toxapex|Toxapex, L50, M|100/100',
          '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
          '|move|p1a: Scrafty|Earthquake|p2a: Whimsicott|[spread] p2a,p2b',
        ],
      }),
    )

    const move = timeline.turns[1]?.events.at(-1)
    expect(move).toMatchObject({ kind: 'move', move: 'Earthquake' })
    expect(move?.kind === 'move' && move.targets.map((target) => target.position)).toEqual([
      'p2a',
      'p2b',
    ])
  })

  it('keeps a move that hit nothing, so the turn does not lose an action', () => {
    const timeline = parseTimeline(log({ lines: ['|move|p1a: Scrafty|Protect|p1a: Scrafty'] }))

    expect(timeline.turns[1]?.events[0]).toMatchObject({
      kind: 'move',
      targets: [{ position: 'p1a' }],
    })
  })

  it('records a Pokémon that could not act, which is the only trace of a lost turn', () => {
    const timeline = parseTimeline(log({ lines: ['|cant|p1a: Scrafty|par'] }))

    expect(timeline.turns[1]?.events[0]).toMatchObject({
      kind: 'cant',
      reason: 'par',
      pokemon: { position: 'p1a', species: 'Scrafty' },
    })
  })

  it('reports damage as the drop it caused, which the log only implies', () => {
    // |-damage| carries what is left, not what was lost. Without the running
    // HP the UI could only show "38%", never "-55%".
    const timeline = parseTimeline(
      log({
        lines: ['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott', '|-damage|p2a: Whimsicott|38/100'],
      }),
    )

    expect(timeline.turns[1]?.events[1]).toMatchObject({
      kind: 'damage',
      hpBefore: 100,
      hpAfter: 38,
      hpDelta: -62,
      from: null,
    })
  })

  it('names the source of damage only when the log named it', () => {
    // Burn, Life Orb and Rough Skin come with [from]; move damage never does.
    // Filling that gap in would be the KO attribution this parser declines.
    const timeline = parseTimeline(log({ lines: ['|-damage|p1a: Scrafty|93/100 brn|[from] brn'] }))

    expect(timeline.turns[1]?.events[0]).toMatchObject({ kind: 'damage', from: 'brn' })
  })

  it('reads an HP field that carries a status, a faint, or an unexplained suffix', () => {
    // All three measured in real logs: `93/100 brn`, `0 fnt`, and one `50/100g`
    // whose suffix nothing in the protocol documentation explains.
    const timeline = parseTimeline(
      log({
        lines: [
          '|-damage|p1a: Scrafty|93/100 brn',
          '|-heal|p1a: Scrafty|50/100g',
          '|-damage|p1a: Scrafty|0 fnt',
        ],
      }),
    )

    const hp = timeline.turns[1]?.events.map((event) =>
      event.kind === 'damage' || event.kind === 'heal' ? event.hpAfter : null,
    )
    expect(hp).toEqual([93, 50, 0])
  })

  it('resets the tracked HP when somebody new arrives at a hurt position', () => {
    // |switch| carries the arriving Pokémon's own HP, so a position that was
    // left at 38% must not make the next arrival look healed.
    const timeline = parseTimeline(
      log({
        lines: [
          '|-damage|p2a: Whimsicott|38/100',
          '|switch|p2a: Gholdengo|Gholdengo, L50|100/100',
          '|-damage|p2a: Gholdengo|71/100',
        ],
      }),
    )

    expect(timeline.turns[1]?.events.at(-1)).toMatchObject({ hpBefore: 100, hpAfter: 71 })
  })

  it('records a faint as its own event, without saying who caused it', () => {
    const timeline = parseTimeline(log({ lines: ['|faint|p2a: Whimsicott'] }))

    const faint = timeline.turns[1]?.events[0]
    expect(faint).toMatchObject({ kind: 'faint', pokemon: { species: 'Whimsicott' } })
    expect(Object.keys(faint ?? {})).toEqual(['kind', 'pokemon'])
  })

  it('drops the lines Showdown marks silent, which it does not show either', () => {
    const timeline = parseTimeline(
      log({
        lines: ['|-heal|p1a: Scrafty|83/100|[from] ability: Regenerator|[silent]'],
      }),
    )

    expect(timeline.turns[1]?.events).toEqual([])
  })

  it('shows a Pokémon in the forme it changed into, not the species it counts as', () => {
    // The opposite of what a signature needs: `battle-only-formes` reduces a
    // Mega back to who it is, and the timeline must not, because megaing is
    // precisely what happened on screen.
    const timeline = parseTimeline(
      log({
        lines: [
          '|detailschange|p1a: Scrafty|Scrafty-Mega, L50, F',
          '|-mega|p1a: Scrafty|Scrafty|Scraftinite',
          '|move|p1a: Scrafty|Knock Off|p2a: Whimsicott',
        ],
      }),
    )

    expect(timeline.turns[1]?.events[0]).toMatchObject({
      kind: 'formeChange',
      pokemon: { species: 'Scrafty-Mega' },
    })
    expect(timeline.turns[1]?.events.at(-1)).toMatchObject({
      kind: 'move',
      actor: { species: 'Scrafty-Mega' },
    })
  })

  it('keeps the name an Illusion was wearing and adds who it turned out to be', () => {
    // The lie is the point: the opponent played against a Whimsicott all along.
    // Rewriting the earlier events would erase what actually happened, and
    // leaving the truth out would make those turns unreadable.
    const timeline = parseTimeline(
      log({
        lines: [
          '|move|p2a: Whimsicott|Encore|p1a: Scrafty',
          '|replace|p2a: Zoroark|Zoroark-Hisui, L50, M',
          '|-end|p2a: Zoroark|Illusion',
        ],
      }),
    )

    expect(timeline.turns[1]?.events[0]).toMatchObject({
      kind: 'move',
      actor: { species: 'Whimsicott', revealedSpecies: 'Zoroark-Hisui' },
    })
    expect(timeline.turns[0]?.events.at(-1)).toMatchObject({
      kind: 'switch',
      pokemon: { species: 'Whimsicott', revealedSpecies: 'Zoroark-Hisui' },
    })
  })

  it('drops the bare | Showdown uses to space the log out', () => {
    // A blank-line marker carries nothing; keeping it as an unrecognised event
    // would put an empty row in every turn. A `||<text>` message is different —
    // that one has something to say and is kept.
    const timeline = parseTimeline(log({ lines: ['|', '||Bob is ready for game 3.'] }))

    expect(timeline.turns[1]?.events).toEqual([
      { kind: 'unknown', raw: '||Bob is ready for game 3.' },
    ])
  })

  it('keeps a line it does not read, so a turn never silently loses an event', () => {
    // Showdown's protocol is far larger than what this parser reads. An
    // unrecognised line is kept verbatim: a turn that quietly went empty would
    // be a bug nobody could trace.
    const timeline = parseTimeline(log({ lines: ['|-sidestart|p1: Alice|move: Tailwind'] }))

    expect(timeline.turns[1]?.events[0]).toEqual({
      kind: 'unknown',
      raw: '|-sidestart|p1: Alice|move: Tailwind',
    })
  })

  it('gives the trainer name alongside the species, since most lines carry only that', () => {
    const timeline = parseTimeline(
      log({
        lines: [
          '|switch|p2a: did you calc that?|Clodsire, F|100/100',
          '|-damage|p2a: did you calc that?|38/100',
        ],
      }),
    )

    expect(timeline.turns[1]?.events.at(-1)).toMatchObject({
      kind: 'damage',
      pokemon: { nickname: 'did you calc that?', species: 'Clodsire' },
    })
  })

  it('parses what it can out of a truncated log instead of throwing', () => {
    // A half-written log still describes the turns it got through, and the
    // battle it belongs to was already recorded at import time.
    const full = log({
      lines: ['|move|p1a: Scrafty|Knock Off|p2a: Whimsicott', '|turn|2', '|move'],
    })
    const truncated = full.slice(0, full.length - 12)

    expect(() => parseTimeline(truncated)).not.toThrow()
    expect(parseTimeline(truncated).turns[1]?.events[0]).toMatchObject({ kind: 'move' })
  })

  it('structures the field and stat lines rather than leaving them unread', () => {
    const timeline = parseTimeline(
      log({
        lines: [
          '|-terastallize|p1a: Scrafty|Fire',
          '|-status|p2a: Whimsicott|brn',
          '|-boost|p1a: Scrafty|atk|2',
          '|-unboost|p2a: Whimsicott|spa|1',
          '|-weather|Sandstorm',
          '|-supereffective|p2a: Whimsicott',
          '|-miss|p1a: Scrafty|p2a: Whimsicott',
          '|-fail|p2a: Whimsicott',
        ],
      }),
    )

    expect(timeline.turns[1]?.events.map((event) => event.kind)).toEqual([
      'terastallize',
      'status',
      'boost',
      'boost',
      'weather',
      'hitResult',
      'miss',
      'fail',
    ])
    expect(timeline.turns[1]?.events[3]).toMatchObject({ kind: 'boost', stat: 'spa', stages: -1 })
  })

  it('parses a real Bo3 game end to end', () => {
    // The shortest fixture, so the whole event stream stays readable. The other
    // fixtures are held by named assertions instead: a snapshot nobody can read
    // through is a snapshot nobody reviews.
    expect(parseTimeline(seriesFixture.log)).toMatchSnapshot()
  })

  it('gives a real long battle one turn each, plus the opening', () => {
    const timeline = parseTimeline(longFixture.log)

    expect(timeline.turns.map((turn) => turn.number)).toEqual(
      Array.from({ length: 32 }, (_, index) => index),
    )
    // Every numbered turn is timestamped. The opening is not, in this battle:
    // its |t:| sits in the preamble, before |start|, where the timeline has not
    // begun yet.
    expect(timeline.turns.slice(1).every((turn) => turn.startedAt !== null)).toBe(true)
    expect(timeline.turns[0]?.startedAt).toBeNull()
  })

  it('resolves every nickname in a real battle where both sides used them', () => {
    // 39 nicknamed switches. A timeline showing "did you calc that?" and
    // nothing else would be unreadable.
    const timeline = parseTimeline(tieFixture.log)
    const named = eventsOfKind(timeline, 'switch')

    // 135 appearances, 39 of them under a name the trainer chose. Every one of
    // them still resolves to a species, which is the point.
    expect(named.filter((event) => event.pokemon.nickname !== event.pokemon.species).length).toBe(
      39,
    )
    expect(named.every((event) => event.pokemon.species !== '')).toBe(true)
  })

  it('reveals the real Illusion in a battle that actually had one', () => {
    const timeline = parseTimeline(ladderFixture.log)
    const worn = eventsOfKind(timeline, 'switch').filter(
      (event) => event.pokemon.revealedSpecies !== null,
    )

    expect(worn.length).toBeGreaterThan(0)
    expect(worn.every((event) => event.pokemon.revealedSpecies === 'Zoroark-Hisui')).toBe(true)
  })

  it('shows the Mega in a real battle from the turn it megaed', () => {
    const timeline = parseTimeline(ladderFixture.log)
    const events = timeline.turns.flatMap((turn) => turn.events)
    const megaAt = events.findIndex((event) => event.kind === 'formeChange')

    expect(megaAt).toBeGreaterThan(-1)
    expect(
      events.slice(0, megaAt).some((event) => JSON.stringify(event).includes('Scrafty-Mega')),
    ).toBe(false)
    expect(
      events.slice(megaAt).some((event) => JSON.stringify(event).includes('Scrafty-Mega')),
    ).toBe(true)
  })

  it('tracks HP through a silent heal, so the next hit is not read as a gain', () => {
    // Rest heals silently. Skipping the line entirely would leave the running
    // HP at the pre-Rest value and turn the next hit into a positive delta —
    // a damage row rendering as "+31%".
    const timeline = parseTimeline(
      log({
        lines: [
          '|-damage|p1a: Scrafty|39/100',
          '|-heal|p1a: Scrafty|100/100 slp|[from] move: Rest|[silent]',
          '|-damage|p1a: Scrafty|70/100 slp',
        ],
      }),
    )

    expect(timeline.turns[1]?.events).toHaveLength(2)
    expect(timeline.turns[1]?.events.at(-1)).toMatchObject({ hpBefore: 100, hpDelta: -30 })
  })

  it('follows Ally Switch, so later lines are not read against the wrong slot', () => {
    // |swap| moves a Pokémon between field positions. Without it every later
    // line addressed to p1a resolves to whoever started there.
    const timeline = parseTimeline(
      log({
        lines: [
          '|switch|p1b: Toxapex|Toxapex, L50, M|100/100',
          '|move|p1a: Scrafty|Ally Switch|p1a: Scrafty',
          '|swap|p1a: Scrafty|1',
          '|-damage|p1a: Toxapex|60/100',
        ],
      }),
    )

    expect(timeline.turns[1]?.events.at(-1)).toMatchObject({
      kind: 'damage',
      pokemon: { position: 'p1a', species: 'Toxapex' },
      hpBefore: 100,
    })
  })

  it('follows a temporary forme change, which uses its own line type', () => {
    // Aegislash, Mimikyu, Morpeko and Cherrim change forme through
    // |-formechange|, not |detailschange|. Reading only the latter would leave
    // the timeline calling it Aegislash-Shield for the rest of the battle.
    const timeline = parseTimeline(
      log({
        lines: [
          '|-formechange|p1a: Scrafty|Aegislash-Blade|[from] ability: Stance Change',
          '|-damage|p1a: Scrafty|60/100',
        ],
      }),
    )

    expect(timeline.turns[1]?.events.at(-1)).toMatchObject({
      kind: 'damage',
      pokemon: { species: 'Aegislash-Blade' },
    })
  })

  it('survives a timestamp no date can hold', () => {
    const timeline = parseTimeline(log({ lines: ['|turn|2', '|t:|999999999999999999'] }))

    expect(timeline.turns[1]?.startedAt).toBe('2026-08-19T09:12:40.000Z')
    expect(timeline.turns[2]?.startedAt).toBeNull()
  })

  it('carries an Illusion across an Ally Switch, revealing the right slot', () => {
    // The disguise moves with the Pokémon. Leaving the reveal keyed to the old
    // position would label the ally as the Zoroark.
    const timeline = parseTimeline(
      log({
        lines: [
          '|switch|p2b: Gholdengo|Gholdengo, L50|100/100',
          '|swap|p2a: Whimsicott|1',
          '|replace|p2b: Zoroark|Zoroark-Hisui, L50, M',
        ],
      }),
    )

    const disguised = eventsOfKind(timeline, 'switch').filter(
      (event) => event.pokemon.species === 'Whimsicott',
    )
    const ally = eventsOfKind(timeline, 'switch').filter(
      (event) => event.pokemon.species === 'Gholdengo',
    )

    expect(disguised.every((event) => event.pokemon.revealedSpecies === 'Zoroark-Hisui')).toBe(true)
    expect(ally.every((event) => event.pokemon.revealedSpecies === null)).toBe(true)
  })
})

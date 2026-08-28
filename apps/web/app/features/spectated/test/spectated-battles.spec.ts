import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fakeBattles } from '../../../../test/fakes/battles'
import type { StoredBattle } from '../../../../test/fakes/battles'
import { battleRecordOf } from '../../../../app/shared/api/battles'
import { signIn, signOut } from '../../../../test/helpers'

/**
 * The battles nobody here played, as the home page's own section reads them.
 *
 * A read of its own rather than a slice of the dashboard's: that one excludes
 * spectated battles by design, and every filter it carries is meaningless for
 * a battle with no "me" in it (#66).
 */

const { fake } = vi.hoisted(() => ({ fake: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => fake.value as never)

function battles() {
  return fake.value as ReturnType<typeof fakeBattles>
}

/** A spectated row: no side of mine, both players in `details`. */
function watched(replayId: string, playedAt: string): StoredBattle {
  return {
    replay_id: replayId,
    played_at: playedAt,
    format_id: 'gen9championsvgc2026regmb',
    series_id: null,
    my_side: null,
    my_username: null,
    opponent_username: null,
    result: null,
    rating: null,
    rating_delta: null,
    team_signature: null,
    bring_signature: null,
    bring_complete: false,
    turn_count: 12,
    details: {
      winner: 'p1',
      sides: {
        p1: { username: `alice-${replayId}`, bringSignature: 'a|b' },
        p2: { username: `bob-${replayId}`, bringSignature: 'c|d' },
      },
    },
  }
}

/** One of mine, which this section must never show. */
function mine(replayId: string): StoredBattle {
  return { ...watched(replayId, '2026-08-09T10:00:00Z'), my_side: 'p1', my_username: 'me' }
}

/** A stored row as the read hands it over. */
function recordOf(row: StoredBattle) {
  return battleRecordOf({
    ...row,
    end_reason: null,
    parse_error: null,
    turn_count: row.turn_count ?? null,
    my_side: row.my_side ?? null,
    opponent_username: row.opponent_username ?? null,
    details: row.details ?? null,
  } as Parameters<typeof battleRecordOf>[0])
}

function day(index: number): string {
  return `2026-08-${String(index).padStart(2, '0')}T10:00:00Z`
}

beforeEach(() => {
  signIn()
  fake.value = fakeBattles([watched('w1', day(1)), watched('w2', day(2)), mine('ladder-1')])
  useState('spectated-rows').value = null
  useState('spectated-shown').value = null
  useState('spectated-loading').value = false
  useState('spectated-error').value = null
  useState('spectated-reading').value = null
  useState('spectated-reader').value = 0
  useState('spectated-query').value = ''
})

describe('reading them', () => {
  it('answers with the spectated battles alone, newest first', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    expect(spectated.battles.value.map((battle) => battle.replayId)).toEqual(['w2', 'w1'])
  })

  it('reads once however many callers ask', async () => {
    await Promise.all([
      useSpectatedBattles().whenLoaded(),
      useSpectatedBattles().whenLoaded(),
      useSpectatedBattles().whenLoaded(),
    ])

    expect(battles().reads.filter((read) => read.method === 'spectatedBattles')).toHaveLength(1)
  })

  it('reads nothing for a visitor who is not signed in', async () => {
    signOut()

    await useSpectatedBattles().whenLoaded()

    expect(battles().reads).toEqual([])
  })

  it('says a failed read failed rather than showing an empty section', async () => {
    // An unreachable database presented as "no spectated battles" is a lie the
    // reader cannot tell from the truth.
    battles().error = new Error('unreachable')

    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    expect(spectated.error.value?.message).toBe('unreachable')
    expect(spectated.loaded.value).toBe(false)
  })

  it('reads again when something it cannot see has changed', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    battles().rows = [...battles().rows, watched('w3', day(3))]
    await spectated.refresh()

    expect(spectated.battles.value.map((battle) => battle.replayId)).toEqual(['w3', 'w2', 'w1'])
  })
})

describe('two reads in the air at once', () => {
  it('keeps the later one, however the two requests come back', async () => {
    // Two batches finishing on the import page call `refresh()` twice. If the
    // first response lands last, the battles the second one brought in would
    // be wiped off the list until somebody reloaded.
    const settle: (() => void)[] = []
    const answers = [[watched('w1', day(1))], [watched('w1', day(1)), watched('w3', day(3))]]
    const held = fakeBattles()
    let call = 0

    held.spectatedBattles = () => {
      const answer = answers[call++]!

      return new Promise((resolve) => settle.push(() => resolve(answer.map(recordOf))))
    }

    // Swapped in before the composable is reached: it takes its `Battles` once.
    fake.value = held
    const spectated = useSpectatedBattles()

    const first = spectated.refresh()
    const second = spectated.refresh()

    // Out of order on purpose: the newer read answers, then the older one.
    settle[1]!()
    settle[0]!()
    await Promise.all([first, second])

    expect(spectated.battles.value.map((battle) => battle.replayId)).toEqual(['w1', 'w3'])
  })
})

describe('how many are on screen', () => {
  beforeEach(() => {
    fake.value = fakeBattles(
      Array.from({ length: 25 }, (_, index) => watched(`w${index}`, day(index + 1))),
    )
  })

  it('draws twenty of them and says there are more', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    expect(spectated.battles.value).toHaveLength(25)
    expect(spectated.visible.value).toHaveLength(20)
    expect(spectated.hasMore.value).toBe(true)
  })

  it('hands over the rest when asked, and stops saying there are more', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    spectated.showMore()

    expect(spectated.visible.value).toHaveLength(25)
    expect(spectated.hasMore.value).toBe(false)
  })

  it('goes back to the first screenful when the battles are read again', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()
    spectated.showMore()

    await spectated.refresh()

    expect(spectated.visible.value).toHaveLength(20)
  })
})

describe('searching by player', () => {
  beforeEach(() => {
    fake.value = fakeBattles([
      { ...watched('w1', day(1)) },
      {
        ...watched('w2', day(2)),
        details: {
          winner: 'p1',
          sides: {
            p1: { username: 'Blue Berry', bringSignature: 'a|b' },
            p2: { username: 'Somebody', bringSignature: 'c|d' },
          },
        },
      },
    ])
  })

  it('narrows the list to the battles that player is in', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    spectated.search('blueberry')

    expect(spectated.matches.value.map((battle) => battle.replayId)).toEqual(['w2'])
    expect(spectated.visible.value.map((battle) => battle.replayId)).toEqual(['w2'])
  })

  it('leaves the battles themselves alone, so clearing the box brings them back', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    spectated.search('blueberry')
    spectated.search('')

    expect(spectated.matches.value).toHaveLength(2)
    expect(spectated.battles.value).toHaveLength(2)
  })

  it('searches every battle that was read, not only the ones on screen', async () => {
    // The section draws twenty at a time; the search is not a search of those
    // twenty.
    fake.value = fakeBattles([
      ...Array.from({ length: 25 }, (_, index) => watched(`w${index}`, day(index + 1))),
      {
        ...watched('wanted', '2026-07-01T10:00:00Z'),
        details: {
          winner: null,
          sides: {
            p1: { username: 'Blue Berry', bringSignature: 'a|b' },
            p2: { username: 'Somebody', bringSignature: 'c|d' },
          },
        },
      },
    ])

    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()
    // The oldest of twenty-six, so it is off the first screenful.
    expect(spectated.visible.value.map((battle) => battle.replayId)).not.toContain('wanted')

    spectated.search('blueberry')

    expect(spectated.matches.value.map((battle) => battle.replayId)).toEqual(['wanted'])
  })

  it('goes back to the first screenful when the search changes', async () => {
    fake.value = fakeBattles(
      Array.from({ length: 25 }, (_, index) => watched(`w${index}`, day(index + 1))),
    )

    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()
    spectated.showMore()
    expect(spectated.visible.value).toHaveLength(25)

    spectated.search('alice')

    expect(spectated.visible.value.length).toBeLessThanOrEqual(20)
  })

  it('tells a search that found nothing apart from having watched nothing', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    spectated.search('nobody at all')

    expect(spectated.matches.value).toEqual([])
    expect(spectated.noMatches.value).toBe(true)
    // Still true: this account has watched battles, they are just not these.
    expect(spectated.battles.value).toHaveLength(2)
  })

  it('is not a search that found nothing when nothing was typed', async () => {
    const spectated = useSpectatedBattles()
    await spectated.whenLoaded()

    expect(spectated.noMatches.value).toBe(false)
  })
})

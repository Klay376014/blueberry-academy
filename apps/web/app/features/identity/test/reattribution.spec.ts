import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { fakeBattles } from '../../../../test/fakes/battles'
import type { StoredBattle } from '../../../../test/fakes/battles'
import { signIn } from '../../../../test/helpers'

/**
 * Re-attributing the rows an account already has, against the alias list as it
 * stands now.
 *
 * Written against the in-memory `Battles` rather than PostgREST: what is
 * interesting here is which rows get written and which are left alone, and
 * that is a statement about rows (issue #67).
 */

const { fake } = vi.hoisted(() => ({ fake: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => fake.value as never)

function battles() {
  return fake.value as ReturnType<typeof fakeBattles>
}

/** A side of a battle, as `details` keeps it. */
function side(username: string, bring: string) {
  return {
    username,
    userId: username.toLowerCase().replaceAll(/[^a-z0-9]/g, ''),
    teamSignature: `${bring}|e|f`,
    bringSignature: bring,
    bringComplete: true,
    ratingAfter: 1500,
    ratingDelta: 12,
  }
}

/** A stored row nobody on the list played: spectated, and every column empty. */
function spectated(overrides: Partial<StoredBattle> = {}): StoredBattle {
  return {
    replay_id: 'battle-1',
    played_at: '2026-08-01T10:00:00Z',
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
    details: {
      winner: 'p1',
      sides: { p1: side('NotLittleStar', 'a|b|c|d'), p2: side('Somebody', 'w|x|y|z') },
    },
    ...overrides,
  }
}

beforeEach(() => {
  signIn()
  fake.value = fakeBattles([spectated()])
  useShowdownAliases().value = []
})

describe('re-attributing after a name is bound', () => {
  it('claims a spectated battle once the name on it is bound', async () => {
    useShowdownAliases().value = ['NotLittleStar']

    await useReattribution().reattribute()

    expect(battles().attributed).toEqual([
      {
        replayId: 'battle-1',
        attribution: expect.objectContaining({
          my_side: 'p1',
          my_username: 'NotLittleStar',
          opponent_username: 'Somebody',
          result: 'win',
          bring_signature: 'a|b|c|d',
          rating: 1500,
        }),
      },
    ])
  })

  it('writes only the rows whose answer changed, and then nothing at all', async () => {
    // A heavy account is thousands of rows and almost none of them move. The
    // second run is the honest form of that claim: idempotent means no write.
    useShowdownAliases().value = ['NotLittleStar']
    fake.value = fakeBattles([
      spectated(),
      spectated({ replay_id: 'battle-2' }),
      // Already this user's, and still is.
      spectated({
        replay_id: 'battle-3',
        my_side: 'p1',
        my_username: 'NotLittleStar',
        opponent_username: 'Somebody',
        result: 'win',
        rating: 1500,
        rating_delta: 12,
        team_signature: 'a|b|c|d|e|f',
        bring_signature: 'a|b|c|d',
        bring_complete: true,
      }),
    ])

    const first = await useReattribution().reattribute()

    expect(battles().attributed.map((write) => write.replayId)).toEqual(['battle-1', 'battle-2'])
    expect(first.report).toMatchObject({ attributed: 2, reattributed: 0, processed: 3, total: 3 })

    battles().attributed.length = 0
    const again = await useReattribution().reattribute()

    expect(battles().attributed).toEqual([])
    expect(again.report).toMatchObject({ attributed: 0, reattributed: 0, processed: 3 })
  })

  it('turns a battle over to p1 when the other player’s name is bound later', async () => {
    // The rule the importer has always followed: both players bound means p1,
    // so a row filed under p2 has to be turned over rather than left as it is
    // — a state no other action could repair.
    useShowdownAliases().value = ['Somebody']
    fake.value = fakeBattles([spectated()])
    await useReattribution().reattribute()

    useShowdownAliases().value = ['Somebody', 'NotLittleStar']
    battles().attributed.length = 0
    const report = await useReattribution().reattribute()

    expect(battles().attributed[0]?.attribution).toMatchObject({
      my_side: 'p1',
      my_username: 'NotLittleStar',
      result: 'win',
    })
    expect(report.report).toMatchObject({ attributed: 0, reattributed: 1 })
  })

  it('skips a row nothing could be derived from, and says how many', async () => {
    // The row a failed parse left behind: the log is stored and can be
    // re-parsed, but there is nothing here to attribute.
    useShowdownAliases().value = ['NotLittleStar']
    fake.value = fakeBattles([spectated({ replay_id: 'unparsed-1', details: {} }), spectated()])

    const report = await useReattribution().reattribute()

    expect(battles().attributed.map((write) => write.replayId)).toEqual(['battle-1'])
    expect(report.report).toMatchObject({ unattributable: 1, attributed: 1, processed: 2 })
  })
})

/** As many spectated rows as asked for, each with its own replay id. */
function manyRows(count: number): StoredBattle[] {
  return Array.from({ length: count }, (_, index) =>
    spectated({ replay_id: `battle-${index + 1}` }),
  )
}

/** Makes the fake refuse every write after the first `allowed` of them. */
function refuseWritesAfter(allowed: number) {
  const write = battles().setAttribution.bind(battles())
  let written = 0

  battles().setAttribution = (replayId, attribution) => {
    written += 1
    if (written > allowed) return Promise.reject(new Error('refused'))

    return write(replayId, attribution)
  }
}

describe('re-attributing after a name is unbound', () => {
  /** The same battle, as it looks once `NotLittleStar` has claimed it. */
  function claimed() {
    return spectated({
      my_side: 'p1',
      my_username: 'NotLittleStar',
      opponent_username: 'Somebody',
      result: 'win',
      rating: 1500,
      rating_delta: 12,
      team_signature: 'a|b|c|d|e|f',
      bring_signature: 'a|b|c|d',
      bring_complete: true,
    })
  }

  it('hands a battle back to spectated when its name is gone', async () => {
    // Without the reverse direction, a name bound by mistake — easy in a
    // trust model that cannot verify ownership — leaves battles in the
    // user's statistics that nothing could ever take out.
    useShowdownAliases().value = []
    fake.value = fakeBattles([claimed()])

    const outcome = await useReattribution().reattribute()

    expect(battles().attributed[0]?.attribution).toEqual({
      my_side: null,
      my_username: null,
      opponent_username: null,
      result: null,
      team_signature: null,
      bring_signature: null,
      bring_complete: false,
      rating: null,
      rating_delta: null,
    })
    // Counted apart from a battle that merely changed hands: "turned over"
    // and "no longer yours" are different things to be told.
    expect(outcome.report).toMatchObject({ unattributed: 1, reattributed: 0, attributed: 0 })
  })

  it('restores a battle exactly when the name is bound again', async () => {
    fake.value = fakeBattles([claimed()])
    const before = { ...battles().rows[0] }

    useShowdownAliases().value = []
    await useReattribution().reattribute()
    expect(battles().rows[0]).toMatchObject({ my_side: null })

    useShowdownAliases().value = ['NotLittleStar']
    await useReattribution().reattribute()

    expect(battles().rows[0]).toEqual(before)
  })
})

describe('a backfill that cannot finish', () => {
  it('stops where it got to and says so, without undoing what it wrote', async () => {
    // Deliberately not a transaction: re-running is idempotent, so a run that
    // stopped halfway leaves a state that is consistent, just unfinished.
    useShowdownAliases().value = ['NotLittleStar']
    fake.value = fakeBattles(manyRows(200))
    refuseWritesAfter(10)

    const outcome = await useReattribution().reattribute()

    expect(outcome.status).toBe('stopped')
    expect(outcome.report.processed).toBeLessThan(200)
    expect(outcome.report.total).toBe(200)
    // What did get written stays written.
    expect(battles().attributed.length).toBeGreaterThan(0)
  })

  it('leaves the rows it never reached alone', async () => {
    useShowdownAliases().value = ['NotLittleStar']
    fake.value = fakeBattles(manyRows(200))
    refuseWritesAfter(10)

    await useReattribution().reattribute()

    expect(battles().rows.at(-1)).toMatchObject({ my_side: null, my_username: null })
  })
})

describe('a backfill whose numbers have to be honest', () => {
  it('counts the rows a failing batch did write before it stopped', async () => {
    // The writes of a batch go out together, so some of the failing batch's
    // rows land anyway. Reporting only whole batches would tell the user 25
    // when 40 moved, and the number is what they retry from (#69).
    useShowdownAliases().value = ['NotLittleStar']
    fake.value = fakeBattles(manyRows(60))
    refuseWritesAfter(30)

    const outcome = await useReattribution().reattribute()

    expect(outcome.report.attributed).toBe(battles().rows.filter((row) => row.my_side).length)
    expect(outcome.report.processed).toBe(outcome.report.attributed)
  })

  it('reports a read it could not even make as a run that got nowhere', async () => {
    // The name is bound by this point. Saying "that change did not save"
    // would be the opposite of what happened.
    useShowdownAliases().value = ['NotLittleStar']
    fake.value = fakeBattles(manyRows(3))
    battles().error = new Error('unreachable')

    const outcome = await useReattribution().reattribute()

    expect(outcome).toMatchObject({ status: 'stopped', report: { processed: 0, total: 0 } })
  })

  it('calls a row newly claimed only when it is claimed', async () => {
    // The two numbers are read differently: "turned over" is the only signal
    // that somebody bound a name that was not theirs.
    useShowdownAliases().value = ['Nobody At All']
    fake.value = fakeBattles([
      // Spectated, and stays spectated — but with a stale column to write.
      spectated({ my_username: 'Left Over' }),
    ])

    const outcome = await useReattribution().reattribute()

    expect(outcome.report).toMatchObject({ attributed: 0, reattributed: 1 })
  })
})

describe('what the settings page watches while it runs', () => {
  it('is running from the first row to the last, and reports how far it got', async () => {
    useShowdownAliases().value = ['NotLittleStar']
    fake.value = fakeBattles(manyRows(60))

    const { running, progress, reattribute } = useReattribution()
    expect(running.value).toBe(false)

    const finished = reattribute()
    expect(running.value).toBe(true)

    await finished

    expect(running.value).toBe(false)
    expect(progress.value).toEqual({ processed: 60, total: 60 })
  })

  it('refuses to run against an alias list that was never read', async () => {
    // Binding writes the whole array, and attributing against a list that
    // never arrived would hand every one of this user's battles to nobody.
    useShowdownAliases().value = null

    await expect(useReattribution().reattribute()).rejects.toThrow(/never been read|not been read/)
  })
})

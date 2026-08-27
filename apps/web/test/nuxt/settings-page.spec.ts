import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { fakeBattles } from '../fakes/battles'
import type { StoredBattle } from '../fakes/battles'
import { signIn } from '../helpers'

/**
 * Binding a name, all the way through: the row already imported, the backfill
 * the settings page runs, and the dashboard reading it back.
 *
 * Only the trip to `profiles` is faked. The re-attribution is the real one
 * over the in-memory `battles`, so "no reload needed" is asserted rather than
 * assumed (issue #67).
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

function stored() {
  return battles.value as ReturnType<typeof fakeBattles>
}

/** The real alias state, written the way a stored binding would be. */
mockNuxtImport('useProfile', () => () => {
  const list = useShowdownAliases()

  return {
    aliases: computed(() => list.value ?? []),
    loaded: computed(() => list.value !== null),
    load: () => Promise.resolve(),
    bindAlias: (name: string) => {
      list.value = [...(list.value ?? []), name]

      return Promise.resolve('bound' as const)
    },
    unbindAlias: () => Promise.resolve(),
  }
})

function spectatedRow(): StoredBattle {
  const side = (username: string, bring: string) => ({
    username,
    userId: username.toLowerCase(),
    teamSignature: `${bring}|e|f`,
    bringSignature: bring,
    bringComplete: true,
    ratingAfter: 1500,
    ratingDelta: 12,
  })

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
      sides: { p1: side('notlittlestar', 'a|b|c|d'), p2: side('somebody', 'w|x|y|z') },
    },
  }
}

async function settle() {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

beforeEach(() => {
  signIn()
  battles.value = fakeBattles([spectatedRow()])
  useShowdownAliases().value = []
  useState('stats-rows').value = null
  useState('stats-read-key').value = null
  useState('stats-reading').value = null
})

describe('binding a Showdown name on the settings page', () => {
  it('claims the battles already imported and re-reads the dashboard, with no reload', async () => {
    const stats = useStats()
    await stats.whenLoaded()
    // Spectated, so the dashboard cannot see it yet.
    expect(stats.battles.value).toHaveLength(0)

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await wrapper.get('[data-testid="alias-input"]').setValue('NotLittleStar')
    await wrapper.get('[data-testid="alias-form"]').trigger('submit')
    await settle()

    // The row itself moved…
    expect(stored().attributed).toHaveLength(1)
    // …the name is on offer in the dashboard's picker…
    expect(stats.identityOptions.value).toEqual(['notlittlestar'])
    // …and the battle is in the numbers, without anybody reloading anything.
    expect(stats.battles.value).toHaveLength(1)
  })

  it('writes nothing at all when a re-run has nothing to change', async () => {
    // The button is safe to press at any time, which is only true because a
    // run that changes nothing writes nothing.
    useShowdownAliases().value = ['NotLittleStar']
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await wrapper.get('[data-testid="reattribute"]').trigger('click')
    await settle()
    expect(stored().attributed).toHaveLength(1)

    stored().attributed.length = 0
    await wrapper.get('[data-testid="reattribute"]').trigger('click')
    await settle()

    expect(stored().attributed).toEqual([])
  })

  it('leaves the name the dashboard is filtered by where the user left it', async () => {
    // Binding a name is not a request to go and look at it: the filter the
    // user chose stays chosen, and nothing pops up asking them to move it.
    // A name already bound, with a battle of its own, and the dashboard
    // filtered by it.
    useShowdownAliases().value = ['Somebody Else']
    stored().rows = [
      spectatedRow(),
      {
        ...spectatedRow(),
        replay_id: 'battle-2',
        my_side: 'p1',
        my_username: 'Somebody Else',
        result: 'win',
        team_signature: 'q|r|s|t|u|v',
        bring_signature: 'q|r|s|t',
        bring_complete: true,
        rating: 1500,
        rating_delta: 12,
        details: {
          winner: 'p1',
          sides: {
            p1: {
              username: 'Somebody Else',
              userId: 'somebodyelse',
              teamSignature: 'q|r|s|t|u|v',
              bringSignature: 'q|r|s|t',
              bringComplete: true,
              ratingAfter: 1500,
              ratingDelta: 12,
            },
            p2: {
              username: 'Third Party',
              userId: 'thirdparty',
              teamSignature: 'w|x|y|z|e|f',
              bringSignature: 'w|x|y|z',
              bringComplete: true,
              ratingAfter: 1500,
              ratingDelta: 12,
            },
          },
        },
      },
    ]
    const stats = useStats()
    await stats.whenLoaded()
    expect(stats.filters.value.identity).toBe('Somebody Else')

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await wrapper.get('[data-testid="alias-input"]').setValue('NotLittleStar')
    await wrapper.get('[data-testid="alias-form"]').trigger('submit')
    await settle()

    expect(stats.identityOptions.value).toContain('notlittlestar')
    expect(stats.filters.value.identity).toBe('Somebody Else')
  })
})

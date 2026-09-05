import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import Home from '../../app/pages/index.vue'
import { fakeBattles } from '../fakes/battles'
import en from '../../i18n/locales/en.json'
import zhTW from '../../i18n/locales/zh-TW.json'
import { signIn } from '../helpers'

/**
 * What the dashboard says when it has nothing to show.
 *
 * An app-level test rather than a feature's, because the answer depends on
 * something the stats feature cannot read: attribution is the alias list
 * re-derived (ADR-0012), so an account with no Showdown name bound files every
 * battle it imports as spectated and arrives here however much it imported.
 * The page is where the two features meet (ADR-0013, #129).
 */

const { battles, load } = vi.hoisted(() => ({
  battles: { value: null as unknown },
  load: vi.fn(),
}))

battles.value = fakeBattles()

mockNuxtImport('useBattles', () => () => battles.value as never)

mockNuxtImport('useProfile', () => () => {
  const stored = useShowdownAliases()

  return {
    aliases: computed(() => stored.value ?? []),
    loaded: computed(() => stored.value !== null),
    load,
    bindAlias: vi.fn(),
    unbindAlias: vi.fn(),
  }
})

type Wrapper = Awaited<ReturnType<typeof mountSuspended>>

/** Where the empty state sends the reader, and what it says on the way. */
function action(wrapper: Wrapper) {
  const link = wrapper.get('[data-testid="empty-action"]')

  return { href: link.attributes('href'), text: wrapper.get('[data-testid="stats-empty"]').text() }
}

describe('the dashboard with nothing to show', () => {
  beforeEach(() => {
    signIn()
    ;(battles.value as ReturnType<typeof fakeBattles>).rows = []
    useState('stats-rows').value = null
    useState('stats-reading').value = null
    useState('spectated-rows').value = null
    useState('spectated-reading').value = null
    useShowdownAliases().value = ['NotLittleStar']
    load.mockReset().mockResolvedValue(undefined)
  })

  it('sends a reader with no name bound to settings, and says why first', async () => {
    // The state issue #129 is about: thirty replays imported, every one of
    // them filed as spectated, and a dashboard that only said "no data".
    useShowdownAliases().value = []

    const wrapper = await mountSuspended(Home)
    const { href, text } = action(wrapper)

    expect(href).toContain('/settings')
    // Why, not just where: the reason the battles are missing is the whole
    // point of the detour.
    expect(text).toContain('Showdown')
  })

  it('keeps pointing at import once a name is bound', async () => {
    const wrapper = await mountSuspended(Home)

    expect(action(wrapper).href).toContain('/import')
  })

  it('points at import when the alias list could not be read at all', async () => {
    // Unread and empty look alike from here and mean opposite things. Sending
    // a reader to bind a name they have already bound, because a read failed,
    // is worse than the wording that was there before.
    useShowdownAliases().value = null
    load.mockRejectedValue(new Error('no profile'))

    const wrapper = await mountSuspended(Home)

    expect(action(wrapper).href).toContain('/import')
  })

  it('carries both empty states in both locales', () => {
    for (const locale of [en, zhTW]) {
      expect(locale.teams.emptyUnbound).toBeTruthy()
      expect(locale.teams.emptyUnboundAction).toBeTruthy()
    }
  })
})

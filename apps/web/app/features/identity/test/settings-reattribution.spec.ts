import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import App from '../../../app.vue'
import { fakeBattles } from '../../../../test/fakes/battles'
import type { StoredBattle } from '../../../../test/fakes/battles'
import { signIn } from '../../../../test/helpers'

/**
 * What the settings page does with the re-attribution that follows a binding.
 *
 * The run itself is `test/reattribution.spec.ts`; this is about the two things
 * only the screen can get wrong — leaving the form open while the alias list
 * is in flux, and saying nothing about what the binding did to the battles
 * already there (issue #67).
 */

const { bindAlias, unbindAlias, reattribute, running, progress } = vi.hoisted(() => ({
  bindAlias: vi.fn(),
  unbindAlias: vi.fn(),
  reattribute: vi.fn(),
  running: { value: false },
  progress: { value: null as { processed: number; total: number } | null },
}))

mockNuxtImport('useProfile', () => () => {
  const stored = useShowdownAliases()
  return {
    aliases: computed(() => stored.value ?? []),
    loaded: computed(() => stored.value !== null),
    load: vi.fn(),
    bindAlias,
    unbindAlias,
  }
})

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

function stored() {
  return battles.value as ReturnType<typeof fakeBattles>
}

/** A row already attributed to one name, so it can be counted under it. */
function attributedRow(replayId: string, username: string): StoredBattle {
  return {
    replay_id: replayId,
    played_at: '2026-08-01T10:00:00Z',
    format_id: 'gen9championsvgc2026regmb',
    series_id: null,
    my_side: 'p1',
    my_username: username,
    result: 'win',
    rating: null,
    rating_delta: null,
    team_signature: 'a|b|c|d|e|f',
    bring_signature: 'a|b|c|d',
    bring_complete: true,
  }
}

mockNuxtImport('useReattribution', () => () => ({
  running: toRef(running, 'value'),
  progress: toRef(progress, 'value'),
  reattribute,
}))

function done(report: Record<string, number>) {
  return {
    status: 'done',
    report: { unattributed: 0, unattributable: 0, processed: 0, total: 0, ...report },
  }
}

async function bind(wrapper: Awaited<ReturnType<typeof mountSuspended>>, name: string) {
  await wrapper.get('[data-testid="alias-input"]').setValue(name)
  await wrapper.get('[data-testid="alias-form"]').trigger('submit')
}

beforeEach(() => {
  signIn()
  battles.value = fakeBattles()
  useShowdownAliases().value = []
  running.value = false
  progress.value = null
  bindAlias.mockReset().mockResolvedValue('bound')
  unbindAlias.mockReset().mockResolvedValue(undefined)
  reattribute.mockReset().mockResolvedValue(done({ attributed: 0, reattributed: 0 }))
})

describe('binding a name and the battles already imported', () => {
  it('re-attributes the battles as soon as the name is bound', async () => {
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await bind(wrapper, 'NotLittleStar')

    expect(bindAlias).toHaveBeenCalledWith('NotLittleStar')
    expect(reattribute).toHaveBeenCalledTimes(1)
  })

  it('says how many battles it claimed, and how many it turned over', async () => {
    // The second number is the only thing that tells a user they bound their
    // opponent's name — which the trust model makes easy to do.
    reattribute.mockResolvedValue(done({ attributed: 128, reattributed: 3 }))
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await bind(wrapper, 'NotLittleStar')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="reattribution-summary"]').text()).toContain('128')
    })

    expect(wrapper.get('[data-testid="reattribution-summary"]').text()).toContain('3')
  })

  it('does not re-attribute for a name that was not added', async () => {
    bindAlias.mockResolvedValue('already-bound')
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await bind(wrapper, 'NotLittleStar')

    expect(reattribute).not.toHaveBeenCalled()
  })

  it('shuts the form while it runs', async () => {
    running.value = true
    useShowdownAliases().value = ['NotLittleStar']
    const wrapper = await mountSuspended(App, { route: '/settings' })

    expect(wrapper.get('[data-testid="alias-input"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="alias-bind"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="alias-remove"]').attributes('disabled')).toBeDefined()
  })

  it('shows how far it has got while it runs', async () => {
    running.value = true
    progress.value = { processed: 340, total: 812 }
    const wrapper = await mountSuspended(App, { route: '/settings' })

    const shown = wrapper.get('[data-testid="reattribution-progress"]').text()

    expect(shown).toContain('340')
    expect(shown).toContain('812')
  })

  it('reports a run that stopped, and how far it got', async () => {
    reattribute.mockResolvedValue({
      status: 'stopped',
      report: { attributed: 4, reattributed: 0, unattributable: 0, processed: 25, total: 812 },
    })
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await bind(wrapper, 'NotLittleStar')
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="reattribution-error"]').exists()).toBe(true)
    })

    expect(wrapper.get('[data-testid="reattribution-error"]').text()).toContain('25')
    // And the form is usable again, so the user has somewhere to try from.
    expect(wrapper.get('[data-testid="alias-input"]').attributes('disabled')).toBeUndefined()
  })
})

describe('what each bound name has under it', () => {
  it('shows how many battles are filed under each name', async () => {
    // The question the user came to this page with: is there any data under
    // the alt I just bound? And the number #70's confirmation needs.
    useShowdownAliases().value = ['NotLittleStar', 'Blue Berry', 'Alt']
    stored().rows = [
      attributedRow('a', 'NotLittleStar'),
      // The same name, spelled the way one replay carried it.
      attributedRow('b', 'notlittlestar'),
      attributedRow('c', 'Somebody Else'),
      attributedRow('d', 'alt'),
    ]

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await vi.waitFor(() => {
      expect(wrapper.findAll('[data-testid="alias-battles"]')).toHaveLength(3)
    })

    const shown = wrapper.findAll('[data-testid="alias-battles"]').map((el) => el.text())

    expect(shown[0]).toBe('2 battles')
    expect(shown[1]).toBe('0 battles')
    // Not "1 battles": a name with a single battle under it is common enough
    // on an alt, which is what the count is there to answer about.
    expect(shown[2]).toBe('1 battle')
  })

  it('counts again once a run has finished, with no reload', async () => {
    useShowdownAliases().value = ['NotLittleStar']
    const wrapper = await mountSuspended(App, { route: '/settings' })
    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="alias-battles"]').text()).toContain('0')
    })

    // What re-attributing would have done, had it not been mocked out.
    stored().rows = [attributedRow('a', 'NotLittleStar')]
    await wrapper.get('[data-testid="reattribute"]').trigger('click')

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="alias-battles"]').text()).toContain('1')
    })
  })
})

describe('the re-attribute button', () => {
  it('re-runs the attribution without touching the alias list', async () => {
    // The way out of a run that stopped: the name is already bound, so the
    // bind button is no help, and the user has nothing else to press.
    useShowdownAliases().value = ['NotLittleStar']
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await wrapper.get('[data-testid="reattribute"]').trigger('click')

    expect(reattribute).toHaveBeenCalledTimes(1)
    expect(bindAlias).not.toHaveBeenCalled()
    expect(unbindAlias).not.toHaveBeenCalled()
    expect(useShowdownAliases().value).toEqual(['NotLittleStar'])
  })

  it('reports what the run did, the same way binding does', async () => {
    reattribute.mockResolvedValue(done({ attributed: 7, reattributed: 1 }))
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await wrapper.get('[data-testid="reattribute"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="reattribution-summary"]').text()).toContain('7')
    })
  })

  it('is shut while a run is going, like the rest of the form', async () => {
    running.value = true
    const wrapper = await mountSuspended(App, { route: '/settings' })

    expect(wrapper.get('[data-testid="reattribute"]').attributes('disabled')).toBeDefined()
  })

  it('is there to press with no names bound at all', async () => {
    // Not a no-op: a name unbound on another device leaves battles here still
    // attributed to it, and this is what hands them back.
    useShowdownAliases().value = []
    const wrapper = await mountSuspended(App, { route: '/settings' })

    expect(wrapper.get('[data-testid="reattribute"]').attributes('disabled')).toBeUndefined()
  })
})

describe('after a run that stopped', () => {
  it('leaves the way to retry on the screen the failure is on', async () => {
    // No automatic retry: a run stops on the network or on permissions, and
    // both give the same answer three times. The user decides.
    reattribute.mockResolvedValue({
      status: 'stopped',
      report: { attributed: 4, reattributed: 0, unattributable: 0, processed: 25, total: 812 },
    })
    useShowdownAliases().value = ['NotLittleStar']
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await wrapper.get('[data-testid="reattribute"]').trigger('click')
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="reattribution-error"]').exists()).toBe(true)
    })
    expect(reattribute).toHaveBeenCalledTimes(1)

    const retry = wrapper.get('[data-testid="reattribute"]')
    expect(retry.attributes('disabled')).toBeUndefined()
    await retry.trigger('click')

    expect(reattribute).toHaveBeenCalledTimes(2)
  })
})

/**
 * The confirmation, which reka-ui teleports out of the wrapper — and the last
 * one in the document, because an unmounted page from an earlier test leaves
 * its own behind (the drawer's tests document the same trap).
 */
function confirmation() {
  return [...document.body.querySelectorAll('[data-testid="unbind-confirm"]')].at(-1) ?? null
}

function pressIn(testid: string) {
  const buttons = [...document.body.querySelectorAll<HTMLElement>(`[data-testid="${testid}"]`)]
  buttons.at(-1)?.click()
}

describe('removing a name', () => {
  beforeEach(() => {
    // Teleported nodes outlive the page that made them.
    for (const stale of document.body.querySelectorAll('[data-testid="unbind-confirm"]')) {
      stale.remove()
    }
    useShowdownAliases().value = ['NotLittleStar']
    stored().rows = [attributedRow('a', 'NotLittleStar'), attributedRow('b', 'NotLittleStar')]
  })

  it('asks first, and says how many battles it is about to cost', async () => {
    // "Unbind a name" and "take 800 battles out of my statistics" are not the
    // same thing in a user's head, and right now they are the same action.
    const wrapper = await mountSuspended(App, { route: '/settings' })
    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="alias-battles"]').text()).toContain('2')
    })

    await wrapper.get('[data-testid="alias-remove"]').trigger('click')
    await vi.waitFor(() => {
      expect(confirmation()).not.toBeNull()
    })

    expect(confirmation()?.textContent).toContain('2')
    expect(confirmation()?.textContent).toContain('NotLittleStar')
    // Nothing has happened yet.
    expect(unbindAlias).not.toHaveBeenCalled()
    expect(reattribute).not.toHaveBeenCalled()
  })

  it('changes nothing at all when it is called off', async () => {
    const wrapper = await mountSuspended(App, { route: '/settings' })
    await wrapper.get('[data-testid="alias-remove"]').trigger('click')
    await vi.waitFor(() => {
      expect(confirmation()).not.toBeNull()
    })

    pressIn('unbind-cancel')
    await vi.waitFor(() => {
      expect(confirmation()).toBeNull()
    })

    expect(unbindAlias).not.toHaveBeenCalled()
    expect(reattribute).not.toHaveBeenCalled()
    expect(useShowdownAliases().value).toEqual(['NotLittleStar'])
  })

  it('unbinds and re-attributes once it is confirmed', async () => {
    const wrapper = await mountSuspended(App, { route: '/settings' })
    await wrapper.get('[data-testid="alias-remove"]').trigger('click')
    await vi.waitFor(() => {
      expect(confirmation()).not.toBeNull()
    })

    pressIn('unbind-remove')

    await vi.waitFor(() => {
      expect(reattribute).toHaveBeenCalledTimes(1)
    })
    expect(unbindAlias).toHaveBeenCalledWith('NotLittleStar')
  })

  it('says how many battles went back to spectated', async () => {
    // Not "0 claimed, 812 turned over": turned over means a different name of
    // the user's own, and these are nobody's now.
    reattribute.mockResolvedValue(done({ attributed: 0, reattributed: 0, unattributed: 812 }))
    const wrapper = await mountSuspended(App, { route: '/settings' })
    await wrapper.get('[data-testid="alias-remove"]').trigger('click')
    await vi.waitFor(() => {
      expect(confirmation()).not.toBeNull()
    })

    pressIn('unbind-remove')

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="reattribution-summary"]').text()).toContain('812')
    })
  })
})

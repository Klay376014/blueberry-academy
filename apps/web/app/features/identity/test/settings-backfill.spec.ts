import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import App from '../../../app.vue'
import { signIn } from '../../../../test/helpers'

/**
 * What the settings page does with the backfill that follows a binding.
 *
 * The backfill itself is `test/reattribution.spec.ts`; this is about the two
 * things only the screen can get wrong — leaving the form open while the alias
 * list is in flux, and saying nothing about what the binding did to the
 * battles already there (issue #67).
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

mockNuxtImport('useReattribution', () => () => ({
  running: toRef(running, 'value'),
  progress: toRef(progress, 'value'),
  reattribute,
}))

function done(report: Record<string, number>) {
  return { status: 'done', report: { unattributable: 0, processed: 0, total: 0, ...report } }
}

async function bind(wrapper: Awaited<ReturnType<typeof mountSuspended>>, name: string) {
  await wrapper.get('[data-testid="alias-input"]').setValue(name)
  await wrapper.get('[data-testid="alias-form"]').trigger('submit')
}

beforeEach(() => {
  signIn()
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

  it('shuts the form while the backfill runs', async () => {
    // The alias list is half-applied until it finishes, and a second binding
    // on top of it would interleave two backfills over one whole-array write.
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

  it('reports a backfill that stopped, and how far it got', async () => {
    reattribute.mockResolvedValue({
      status: 'stopped',
      message: 'refused',
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

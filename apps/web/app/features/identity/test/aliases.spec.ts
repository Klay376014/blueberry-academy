import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import App from '../../../app.vue'
import { signIn } from '../../../../test/helpers'

// Only the trip to Supabase is faked. `aliases` stays the real state the
// composable writes, so a binding inside a test means what it means in the app.
const { load, bindAlias, unbindAlias } = vi.hoisted(() => ({
  load: vi.fn(),
  bindAlias: vi.fn(),
  unbindAlias: vi.fn(),
}))

mockNuxtImport('useProfile', () => () => {
  const stored = useShowdownAliases()
  return {
    aliases: computed(() => stored.value ?? []),
    loaded: computed(() => stored.value !== null),
    load,
    bindAlias,
    unbindAlias,
  }
})

/** Types a name into the field and presses the button beside it. */
async function bind(wrapper: Awaited<ReturnType<typeof mountSuspended>>, name: string) {
  await wrapper.get('[data-testid="alias-input"]').setValue(name)
  await wrapper.get('[data-testid="alias-form"]').trigger('submit')
}

describe('the Showdown alias settings', () => {
  beforeEach(() => {
    signIn()
    useShowdownAliases().value = []
    load.mockReset().mockResolvedValue(undefined)
    bindAlias.mockReset().mockResolvedValue('bound')
    unbindAlias.mockReset().mockResolvedValue(undefined)
  })

  it('lists the names already bound', async () => {
    useShowdownAliases().value = ['NotLittleStar', 'Bibas Rozkurwiator']

    const wrapper = await mountSuspended(App, { route: '/settings' })

    const names = wrapper.findAll('[data-testid="alias-name"]').map((el) => el.text())
    expect(names).toEqual(['NotLittleStar', 'Bibas Rozkurwiator'])
  })

  it('binds a name that was typed in', async () => {
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await bind(wrapper, 'NotLittleStar')

    expect(bindAlias).toHaveBeenCalledWith('NotLittleStar')
  })

  it('clears the field after a name goes in, ready for the next one', async () => {
    const wrapper = await mountSuspended(App, { route: '/settings' })

    await bind(wrapper, 'NotLittleStar')

    await vi.waitFor(() => {
      expect(wrapper.get<HTMLInputElement>('[data-testid="alias-input"]').element.value).toBe('')
    })
  })

  it('says a differently-cased name is one the user already has', async () => {
    useShowdownAliases().value = ['NotLittleStar']
    bindAlias.mockResolvedValue('already-bound')

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await bind(wrapper, 'notlittlestar')

    await vi.waitFor(() => {
      expect(wrapper.get('[data-testid="alias-message"]').text()).toContain('notlittlestar')
    })
    // Recognised, not added -- there is still one entry on screen.
    expect(wrapper.findAll('[data-testid="alias-name"]')).toHaveLength(1)
  })

  it('says so when what was typed could never be a Showdown name', async () => {
    bindAlias.mockResolvedValue('unusable')

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await bind(wrapper, '!!!')

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="alias-message"]').exists()).toBe(true)
    })
  })

  it('says so when the change did not save, rather than looking like it did', async () => {
    bindAlias.mockRejectedValue(new Error('row level security'))

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await bind(wrapper, 'NotLittleStar')

    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="alias-error"]').exists()).toBe(true)
    })
  })

  it('asks before it unbinds a name, and names the one it asked about', async () => {
    // Removing a name takes its battles out of the statistics, which is not
    // what "remove a name" sounds like — so it asks first (#70). What the
    // question says and what confirming it does are in
    // `settings-reattribution.spec.ts`.
    useShowdownAliases().value = ['NotLittleStar', 'Bibas Rozkurwiator']

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await wrapper.findAll('[data-testid="alias-remove"]')[1]!.trigger('click')

    expect(unbindAlias).not.toHaveBeenCalled()
    await vi.waitFor(() => {
      const asked = [...document.body.querySelectorAll('[data-testid="unbind-confirm"]')].at(-1)
      expect(asked?.textContent).toContain('Bibas Rozkurwiator')
    })
  })

  it('is honest that nobody can verify the account is yours', async () => {
    const wrapper = await mountSuspended(App, { route: '/settings' })

    // Acceptance criterion, and §10 of the design document: a user must not
    // walk away thinking this was checked.
    const notice = wrapper.get('[data-testid="alias-unverified"]').text()
    expect(notice).toMatch(/cannot verify/i)
    // ...and what the list is actually for.
    expect(notice).toMatch(/battles/i)
  })

  it('says the notice in the language the reader is in', async () => {
    const wrapper = await mountSuspended(App, { route: '/zh-TW/settings' })

    expect(wrapper.get('[data-testid="alias-unverified"]').text()).toContain('無法驗證')
  })

  it('shuts the form when the list could not be read, rather than risk replacing it', async () => {
    // Binding writes the whole list back. On top of a list that never arrived
    // that would delete every name the profile really has, so there is
    // nothing to type into until a read succeeds.
    load.mockImplementation(async () => {
      useShowdownAliases().value = null
      throw new Error('network')
    })

    const wrapper = await mountSuspended(App, { route: '/settings' })

    expect(wrapper.get('[data-testid="alias-load-error"]').text()).not.toBe('')
    expect(wrapper.get('[data-testid="alias-input"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="alias-bind"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-testid="alias-empty"]').exists()).toBe(false)
  })

  it('stops naming the rejected name once the user types a different one', async () => {
    useShowdownAliases().value = ['NotLittleStar']
    bindAlias.mockResolvedValue('already-bound')

    const wrapper = await mountSuspended(App, { route: '/settings' })
    await bind(wrapper, 'notlittlestar')
    await vi.waitFor(() => {
      expect(wrapper.find('[data-testid="alias-message"]').exists()).toBe(true)
    })

    // Otherwise the message follows the field and claims whatever is being
    // typed is already bound.
    await wrapper.get('[data-testid="alias-input"]').setValue('SomeoneElse')

    expect(wrapper.find('[data-testid="alias-message"]').exists()).toBe(false)
  })

  it('reaches the page from the nav', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })

    const hrefs = wrapper.findAll('nav a').map((a) => a.attributes('href'))
    expect(hrefs).toContain('/settings')
  })
})

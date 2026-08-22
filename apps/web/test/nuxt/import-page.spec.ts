import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn } from '../helpers'
import type { BattleRow } from '../../app/composables/useIngest'

// The import itself is faked; the page, the link parsing and the alias state
// are real. What this asserts is what a user is told, which is the part
// useIngest cannot decide for itself.
const { importReplay, load } = vi.hoisted(() => ({
  importReplay: vi.fn(),
  load: vi.fn(),
}))

mockNuxtImport('useIngest', () => () => ({ importReplay }))

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

const LINK = 'https://replay.pokemonshowdown.com/gen9championsvgc2026regmb-2667169457'

function battle(overrides: Partial<BattleRow> = {}): BattleRow {
  return {
    user_id: 'test-user',
    replay_id: 'gen9championsvgc2026regmb-2667169457',
    played_at: '2026-08-19T09:19:18.000Z',
    format_id: 'gen9championsvgc2026regmb',
    rated: true,
    game_type: 'doubles',
    rating: 1429,
    rating_delta: -15,
    series_id: null,
    my_side: 'p1',
    my_username: 'DavoPro1214',
    opponent_username: 'Bibas Rozkurwiator',
    result: 'loss',
    team_signature: 'garchomp|gholdengo|ninetalesalola|raichu|scrafty|toxapex',
    bring_signature: 'garchomp|ninetalesalola|scrafty|toxapex',
    bring_complete: true,
    turn_count: 15,
    end_reason: null,
    details: {},
    log_path: 'test-user/gen9championsvgc2026regmb-2667169457.json.gz',
    parser_version: '1',
    parse_error: null,
    ...overrides,
  }
}

/** Pastes a link into the field and presses the button beside it. */
async function paste(wrapper: Awaited<ReturnType<typeof mountSuspended>>, link: string) {
  await wrapper.get('[data-testid="import-input"]').setValue(link)
  await wrapper.get('[data-testid="import-form"]').trigger('submit')
  await nextTick()
}

describe('the import page', () => {
  beforeEach(() => {
    signIn()
    useShowdownAliases().value = ['DavoPro1214']
    load.mockReset().mockResolvedValue(undefined)
    importReplay.mockReset().mockResolvedValue({ status: 'imported', battle: battle() })
  })

  it('imports the replay a pasted link points at', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, LINK)

    expect(importReplay).toHaveBeenCalledWith({
      id: 'gen9championsvgc2026regmb-2667169457',
      password: null,
    })
  })

  it('shows the battle that came in', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, LINK)

    const shown = wrapper.get('[data-testid="import-result"]').text()
    expect(shown).toContain('Bibas Rozkurwiator')
    // The species the user brought, by name rather than by id.
    expect(shown).toContain('Ninetales-Alola')
    expect(wrapper.get('[data-testid="battle-result"]').text()).toBe('Loss')
  })

  it('refuses a link that is not a replay without asking Showdown', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, 'https://pokemonshowdown.com/users/notlittlestar')

    expect(importReplay).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="import-error"]').exists()).toBe(true)
  })

  it('says when a battle was nobody on the alias list', async () => {
    importReplay.mockResolvedValue({
      status: 'imported',
      battle: battle({
        my_side: null,
        my_username: null,
        opponent_username: null,
        result: null,
        team_signature: null,
        bring_signature: null,
        bring_complete: false,
        rating: null,
        rating_delta: null,
      }),
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, LINK)

    // It is stored, it counts towards nothing, and the user is told why
    // rather than left looking at a battle with no result.
    expect(wrapper.find('[data-testid="battle-spectated"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="battle-result"]').exists()).toBe(false)
  })

  it('says the log was kept when the parse failed', async () => {
    importReplay.mockResolvedValue({
      status: 'unparsed',
      battle: battle({ parse_error: 'nobody has taught it that line yet' }),
      message: 'nobody has taught it that line yet',
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, LINK)

    const shown = wrapper.get('[data-testid="import-unparsed"]').text()
    expect(shown).toContain('nobody has taught it that line yet')
  })

  it('gives the reason an import did not happen', async () => {
    importReplay.mockResolvedValue({
      status: 'failed',
      reason: 'not-found',
      message: 'Showdown has no replay gen9ou-1.',
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, LINK)

    expect(wrapper.get('[data-testid="import-error"]').text()).toContain('Showdown')
  })

  it('will not send the same link twice while the first one is still going', async () => {
    let finish = (_outcome: unknown) => {}
    importReplay.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, LINK)
    await paste(wrapper, LINK)

    expect(importReplay).toHaveBeenCalledTimes(1)

    finish({ status: 'imported', battle: battle() })
  })

  it('keeps the form shut when the alias list could not be read', async () => {
    // Importing against a list that never arrived would file the user's own
    // battles as somebody else's.
    useShowdownAliases().value = null
    load.mockRejectedValue(new Error('offline'))

    const wrapper = await mountSuspended(App, { route: '/import' })

    expect(wrapper.get('[data-testid="import-submit"]').attributes('disabled')).toBeDefined()
  })
})

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime'
import type { BattleRow } from 'battle-row'
import App from '../../app/app.vue'
import { fakeBattles } from '../fakes/battles'
import { STATS_ROWS } from '../fixtures/stats-rows'
import { signIn } from '../helpers'
import type { BatchItem, ImportOptions, ImportReport } from '../../app/features/ingest'

// The import itself is faked; the page, the link parsing and the alias state
// are real. What this asserts is what a user is told, which is the part
// useIngest cannot decide for itself.
const { importMany, syncAccount, load } = vi.hoisted(() => ({
  importMany: vi.fn(),
  syncAccount: vi.fn(),
  load: vi.fn(),
}))

mockNuxtImport('useIngest', () => () => ({ importMany, syncAccount }))

/**
 * The dashboard's own reads, because this page now asks for one when a batch
 * finishes. One fake for the file: `useStats` registers its watchers once per
 * session and they keep whichever adapter answered first.
 */
const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

battles.value = fakeBattles()

mockNuxtImport('useBattles', () => () => battles.value as never)

function stored() {
  return battles.value as ReturnType<typeof fakeBattles>
}

/** Long enough for a read the fake resolves immediately to have landed. */
async function settle() {
  for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

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

const REPLAY = 'gen9championsvgc2026regmb-2667169457'
const LINK = `https://replay.pokemonshowdown.com/${REPLAY}`

function battle(overrides: Partial<BattleRow> = {}): BattleRow {
  return {
    user_id: 'test-user',
    replay_id: REPLAY,
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
    log_path: `test-user/${REPLAY}.json.gz`,
    parser_version: '1',
    parse_error: null,
    ...overrides,
  }
}

/** A report over the items given, counted the way useIngest counts them. */
function report(items: BatchItem[]): ImportReport {
  const counts = { imported: 0, unparsed: 0, skipped: 0, failed: 0 }
  for (const item of items) counts[item.outcome.status] += 1

  return { items, counts }
}

function imported(id = REPLAY): BatchItem {
  return { ref: { id }, outcome: { status: 'imported', battle: battle({ replay_id: id }) } }
}

type Wrapper = Awaited<ReturnType<typeof mountSuspended>>

/** Pastes into the link box and presses the button under it. */
async function paste(wrapper: Wrapper, links: string) {
  await wrapper.get('[data-testid="import-input"]').setValue(links)
  await wrapper.get('[data-testid="import-form"]').trigger('submit')
  await nextTick()
}

/** Types a Showdown name into the sync box and presses sync. */
async function sync(wrapper: Wrapper, name: string) {
  await wrapper.get('[data-testid="sync-input"]').setValue(name)
  await wrapper.get('[data-testid="sync-form"]').trigger('submit')
  await nextTick()
}

/** The per-replay lines of the report, as `<status> <label>`. */
function reportRows(wrapper: Wrapper): string[] {
  return wrapper
    .findAll('[data-testid="report-row"]')
    .map((row: { text: () => string }) => row.text())
}

describe('the import page', () => {
  beforeEach(() => {
    signIn()
    stored().rows = []
    useState('stats-rows').value = null
    useState('stats-reading').value = null
    useShowdownAliases().value = ['DavoPro1214']
    load.mockReset().mockResolvedValue(undefined)
    importMany.mockReset().mockResolvedValue(report([imported()]))
    syncAccount.mockReset().mockResolvedValue({
      status: 'listed',
      report: report([imported()]),
      truncated: false,
    })
  })

  it('re-reads the dashboard once a batch has finished', async () => {
    // `useState` outlives a route in an SPA, so without this the dashboard
    // still shows the numbers from before the import and only a page reload
    // says otherwise.
    const stats = useStats()
    await stats.whenLoaded()
    expect(stats.battles.value).toHaveLength(0)

    const wrapper = await mountSuspended(App, { route: '/import' })
    stored().rows = STATS_ROWS

    await paste(wrapper, LINK)
    await settle()

    expect(stats.battles.value.length).toBeGreaterThan(0)
  })

  it('imports the replay a pasted link points at', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, LINK)

    expect(importMany.mock.calls[0]![0]).toEqual([{ id: REPLAY, password: null }])
  })

  it('imports a whole pasted list, one replay per line', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, `${LINK}\n\n  gen9ou-2667293085  \nsmogtours-gen9ou-799535`)

    // Blank lines and stray spacing are what pasting out of a chat log looks
    // like; none of them is a replay that failed.
    expect(importMany.mock.calls[0]![0]).toEqual([
      { id: REPLAY, password: null },
      { id: 'gen9ou-2667293085', password: null },
      { id: 'smogtours-gen9ou-799535', password: null },
    ])
  })

  it('shows the single battle that came in', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, LINK)

    const shown = wrapper.get('[data-testid="import-result"]').text()
    expect(shown).toContain('Bibas Rozkurwiator')
    // The species the user brought, by name rather than by id.
    expect(shown).toContain('Ninetales-Alola')
    expect(wrapper.get('[data-testid="battle-result"]').text()).toBe('Loss')
  })

  it('reports every replay of a batch, with what became of each', async () => {
    importMany.mockResolvedValue(
      report([
        imported('gen9ou-1'),
        { ref: { id: 'gen9ou-2' }, outcome: { status: 'skipped' } },
        {
          ref: { id: 'gen9ou-3' },
          outcome: { status: 'failed', reason: 'not-found', message: 'no such replay' },
        },
      ]),
    )

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, 'gen9ou-1\ngen9ou-2\ngen9ou-3')

    const rows = reportRows(wrapper)
    expect(rows).toHaveLength(3)
    expect(rows[1]).toContain('gen9ou-2')
    // The twelve that failed are the reason this list exists, so each one
    // says why rather than only that it did.
    expect(rows[2]).toContain('Showdown')
    expect(wrapper.get('[data-testid="report-counts"]').text()).toMatch(/1.*1.*1/s)
  })

  it('keeps a line that is not a replay link out of the batch, and says so', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, `${LINK}\nhttps://pokemonshowdown.com/users/notlittlestar`)

    // Refused here rather than by Showdown, and it does not stop the line
    // above it from being imported.
    expect(importMany.mock.calls[0]![0]).toEqual([{ id: REPLAY, password: null }])
    expect(reportRows(wrapper).some((row: string) => row.includes('notlittlestar'))).toBe(true)
  })

  it('imports nothing when not one line was a replay link', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await paste(wrapper, 'what a nice battle')

    expect(importMany).not.toHaveBeenCalled()
    expect(reportRows(wrapper)).toHaveLength(1)
  })

  it('syncs the Showdown name that was typed', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await sync(wrapper, 'Bibas Rozkurwiator')

    expect(syncAccount.mock.calls[0]![0]).toBe('Bibas Rozkurwiator')
  })

  it('offers the bound alias as the name to sync, since that is whose battles these are', async () => {
    useShowdownAliases().value = ['NotLittleStar', 'DavoPro1214']

    const wrapper = await mountSuspended(App, { route: '/import' })

    expect((wrapper.get('[data-testid="sync-input"]').element as HTMLInputElement).value).toBe(
      'NotLittleStar',
    )
  })

  it('says when a search ran out of pages before the account ran out of replays', async () => {
    syncAccount.mockResolvedValue({
      status: 'listed',
      report: report([imported()]),
      truncated: true,
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await sync(wrapper, 'DavoPro1214')

    expect(wrapper.find('[data-testid="sync-truncated"]').exists()).toBe(true)
  })

  it('gives the reason a sync could not even list the account', async () => {
    syncAccount.mockResolvedValue({
      status: 'failed',
      reason: 'unavailable',
      message: 'Showdown did not answer.',
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await sync(wrapper, 'DavoPro1214')

    expect(wrapper.get('[data-testid="import-error"]').text()).toContain('Showdown')
  })

  it('refuses a name that could never be a Showdown name, without asking', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })

    await sync(wrapper, '   ')

    expect(syncAccount).not.toHaveBeenCalled()
    expect(wrapper.find('[data-testid="import-error"]').exists()).toBe(true)
  })

  it('says the log was kept when a parse failed', async () => {
    importMany.mockResolvedValue(
      report([
        {
          ref: { id: REPLAY },
          outcome: {
            status: 'unparsed',
            battle: battle({ parse_error: 'nobody has taught it that line yet' }),
            message: 'nobody has taught it that line yet',
          },
        },
      ]),
    )

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, LINK)

    expect(wrapper.get('[data-testid="import-unparsed"]').text()).toContain(
      'nobody has taught it that line yet',
    )
  })

  it('says when a battle was nobody on the alias list', async () => {
    importMany.mockResolvedValue(
      report([
        {
          ref: { id: REPLAY },
          outcome: {
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
          },
        },
      ]),
    )

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, LINK)

    expect(wrapper.find('[data-testid="battle-spectated"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="battle-result"]').exists()).toBe(false)
  })

  it('will not start a second import while the first one is still going', async () => {
    let finish = (_report: unknown) => {}
    importMany.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, LINK)
    await paste(wrapper, LINK)
    // The other entrance is shut too: both of them talk to the same Showdown.
    await sync(wrapper, 'DavoPro1214')

    expect(importMany).toHaveBeenCalledTimes(1)
    expect(syncAccount).not.toHaveBeenCalled()

    finish(report([imported()]))
  })

  it('shows how far along it is while the batch is still running', async () => {
    // The mock is the import: it announces the total, hands over one replay,
    // and is held open so the page can be read mid-flight.
    let finish = (_report: unknown) => {}
    importMany.mockImplementation((refs: { id: string }[], options: ImportOptions) => {
      options.onTotal?.(refs.length)
      options.onResult?.(imported('gen9ou-1'))

      return new Promise((resolve) => {
        finish = resolve
      })
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, 'gen9ou-1\ngen9ou-2\ngen9ou-3')
    await nextTick()

    const bar = wrapper.get('[data-testid="import-progress"]')
    expect(bar.attributes('aria-valuenow')).toBe('1')
    expect(bar.attributes('aria-valuemax')).toBe('3')
    expect(bar.text()).toContain('1')
    expect(bar.text()).toContain('3')

    finish(report([imported('gen9ou-1')]))
  })

  it('lists each replay the moment it lands, rather than only at the end', async () => {
    let finish = (_report: unknown) => {}
    importMany.mockImplementation((refs: { id: string }[], options: ImportOptions) => {
      options.onTotal?.(refs.length)
      options.onResult?.({
        ref: { id: 'gen9ou-2' },
        outcome: { status: 'failed', reason: 'not-found', message: 'no such replay' },
      })

      return new Promise((resolve) => {
        finish = resolve
      })
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, 'gen9ou-1\ngen9ou-2')
    await nextTick()

    // Mid-import, and already saying why that one did not make it -- which is
    // the whole reason this list is per replay.
    const rows = reportRows(wrapper)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('gen9ou-2')
    expect(rows[0]).toContain('Showdown')

    finish(report([imported('gen9ou-1')]))
  })

  it('keeps the list up after the import has finished', async () => {
    importMany.mockImplementation((_refs: unknown, options: ImportOptions) => {
      options.onResult?.(imported('gen9ou-1'))

      return Promise.resolve(report([imported('gen9ou-1')]))
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, 'gen9ou-1')
    await nextTick()

    // Reported live and reported at the end are the same replay, so it is
    // listed once rather than twice, and the bar is gone with the work.
    expect(reportRows(wrapper)).toHaveLength(1)
    expect(wrapper.find('[data-testid="import-progress"]').exists()).toBe(false)
  })

  it('counts as it goes, so the tally is readable before the end', async () => {
    let finish = (_report: unknown) => {}
    importMany.mockImplementation((_refs: unknown, options: ImportOptions) => {
      options.onTotal?.(2)
      options.onResult?.(imported('gen9ou-1'))

      return new Promise((resolve) => {
        finish = resolve
      })
    })

    const wrapper = await mountSuspended(App, { route: '/import' })
    await paste(wrapper, 'gen9ou-1\ngen9ou-2')
    await nextTick()

    expect(wrapper.get('[data-testid="report-counts"]').text()).toMatch(/1.*0.*0/s)

    finish(report([imported('gen9ou-1')]))
  })

  it('says it is still asking Showdown while a sync has no total yet', async () => {
    let finish = (_outcome: unknown) => {}
    syncAccount.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      }),
    )

    const wrapper = await mountSuspended(App, { route: '/import' })
    await sync(wrapper, 'DavoPro1214')
    await nextTick()

    // The listing has to come back before there is a denominator, and a bar
    // at 0 / 0 would read as "nothing is happening".
    const bar = wrapper.get('[data-testid="import-progress"]')
    expect(bar.attributes('aria-valuenow')).toBeUndefined()
    expect(bar.text()).toContain('Showdown')

    finish({ status: 'listed', report: report([imported()]), truncated: false })
  })

  it('keeps the form shut when the alias list could not be read', async () => {
    // Importing against a list that never arrived would file the user's own
    // battles as somebody else's.
    useShowdownAliases().value = null
    load.mockRejectedValue(new Error('offline'))

    const wrapper = await mountSuspended(App, { route: '/import' })

    expect(wrapper.get('[data-testid="import-submit"]').attributes('disabled')).toBeDefined()
    expect(wrapper.get('[data-testid="sync-submit"]').attributes('disabled')).toBeDefined()
  })
})

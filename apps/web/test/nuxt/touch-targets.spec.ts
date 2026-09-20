import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import type { BattleRow } from 'battle-row'
import About from '../../app/pages/about.vue'
import ErrorPage from '../../app/error.vue'
import Home from '../../app/pages/index.vue'
import Login from '../../app/pages/login.vue'
import Privacy from '../../app/pages/privacy.vue'
import ImportPage from '../../app/pages/import.vue'
import Settings from '../../app/pages/settings.vue'
import { fakeBattles } from '../fakes/battles'
import type { StoredBattle } from '../fakes/battles'
import { STATS_ROWS } from '../fixtures/stats-rows'
import type { BatchItem, ImportReport } from '../../app/features/ingest'
import { forgetTeleported, teleported } from '../teleported'
import { expectApart, expectFloor } from '../touch-floor'
import { signIn, signOut } from '../helpers'

/**
 * The touch-target floor of docs/specs/2026-09-18-responsive-baseline.md §5,
 * over the pages that draw controls of their own; the site chrome's half is
 * `responsive.spec.ts` and the rule itself is `test/touch-floor.ts`.
 *
 * Written as a sweep over every pressable a page holds rather than as a list
 * of testids: a list only ever covers the ten controls somebody thought of,
 * and the eleventh is added by whoever reads this file least.
 */

const { battles, importMany } = vi.hoisted(() => ({
  battles: { value: null as unknown },
  importMany: vi.fn(),
}))

mockNuxtImport('useBattles', () => () => battles.value as never)

/** The import itself is faked; what is swept is what the page draws about it. */
mockNuxtImport('useIngest', () => () => ({
  importMany,
  syncAccount: vi.fn(),
  syncPrivate: vi.fn(),
}))

/** The alias state, without the trip to `profiles` — as `settings-page.spec.ts`. */
mockNuxtImport('useProfile', () => () => {
  const list = useShowdownAliases()

  return {
    aliases: computed(() => list.value ?? []),
    loaded: computed(() => list.value !== null),
    load: () => Promise.resolve(),
    bindAlias: () => Promise.resolve('bound' as const),
    unbindAlias: () => Promise.resolve(),
  }
})

/** A battle between two strangers, which is what the spectated list holds. */
function watched(replayId: string): StoredBattle {
  const side = (username: string) => ({
    username,
    bringSignature: 'pikachu|eevee',
    teamSignature: 'blastoise|eevee|pikachu',
  })

  return {
    replay_id: replayId,
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
    turn_count: 17,
    details: { winner: 'p1', sides: { p1: side('Alice'), p2: side('Bob') } },
  }
}

/** The same battle as an import has just written it: nobody's, so far. */
function watchedImport(replayId: string): BatchItem {
  const battle: BattleRow = {
    user_id: 'test-user',
    replay_id: replayId,
    replay_private: false,
    replay_password: null,
    played_at: '2026-08-01T10:00:00Z',
    format_id: 'gen9championsvgc2026regmb',
    rated: true,
    game_type: 'doubles',
    rating: null,
    rating_delta: null,
    series_id: null,
    my_side: null,
    my_username: null,
    opponent_username: null,
    result: null,
    team_signature: null,
    bring_signature: null,
    bring_complete: false,
    turn_count: 17,
    end_reason: null,
    details: {},
    log_path: `test-user/${replayId}.json.gz`,
    parser_version: '1',
    parse_error: null,
  }

  return { ref: { id: replayId }, outcome: { status: 'imported', battle } }
}

function reportOf(items: BatchItem[]): ImportReport {
  const counts = { imported: 0, unparsed: 0, skipped: 0, failed: 0 }
  for (const item of items) counts[item.outcome.status] += 1

  return { items, counts }
}

/** Pastes into the link box and presses the button under it. */
async function paste(page: Awaited<ReturnType<typeof mountSuspended>>, links: string) {
  await page.get('[data-testid="import-input"]').setValue(links)
  await page.get('[data-testid="import-form"]').trigger('submit')
  await nextTick()
}

/** One more than the section draws before it offers to draw the rest. */
const A_SCREENFUL_AND_ONE = 21

beforeEach(() => {
  battles.value = fakeBattles([
    ...STATS_ROWS,
    ...Array.from({ length: A_SCREENFUL_AND_ONE }, (_, index) => watched(`watched-${index}`)),
  ])

  importMany.mockReset()
  useShowdownAliases().value = ['Reader']
  signIn()
  useStatsFilters().value = defaultStatsFilters()
  useState('stats-rows').value = null
})

describe('the touch-target floor, page by page', () => {
  it('holds on the dashboard and the spectated list beside it', async () => {
    const page = await mountSuspended(Home)

    expectFloor(page.element as Element, [
      'filter-identity',
      'team-card',
      'spectated-search',
      'spectated-more',
    ])
  })

  it('holds on the landing page a stranger is shown at the same address', async () => {
    signOut()

    const page = await mountSuspended(Home)

    expectFloor(page.element as Element, ['landing-cta'])
    expectApart(page.get('[data-testid="landing-actions"]').element)
  })

  it('holds on both of the import page’s forms', async () => {
    const page = await mountSuspended(ImportPage)

    expectFloor(page.element as Element, [
      'import-input',
      'import-submit',
      'sync-input',
      'sync-submit',
      'private-open',
    ])

    // The field and its two buttons share one row, and the row wraps.
    expectApart(page.get('[data-testid="sync-form"]').element)
  })

  /**
   * Both of these links sit inside a sentence, and both are behind a `v-if`
   * that the sweep above never reaches: the page draws them only once an
   * import has landed on nobody. Reached here by importing one, so that the
   * hit area they carry instead of a height is swept like everything else.
   */
  it('holds on the two links out of an import that landed on nobody', async () => {
    importMany.mockResolvedValue(reportOf([watchedImport('gen9ou-1'), watchedImport('gen9ou-2')]))

    const batch = await mountSuspended(ImportPage)
    await paste(batch, 'gen9ou-1\ngen9ou-2')

    expectFloor(batch.element as Element, ['all-spectated-bind'])

    // One link is the batch's and the other the single battle's, and the page
    // draws whichever the import was: never both at once.
    importMany.mockResolvedValue(reportOf([watchedImport('gen9ou-1')]))

    const one = await mountSuspended(ImportPage)
    await paste(one, 'gen9ou-1')

    expectFloor(one.element as Element, ['battle-spectated-bind'])
  })

  it('holds on the settings page, the remove button in each alias row included', async () => {
    const page = await mountSuspended(Settings)

    expectFloor(page.element as Element, [
      'alias-input',
      'alias-bind',
      'alias-remove',
      'reattribute',
    ])
    expectApart(page.get('[data-testid="alias-form"]').element)
  })

  it('holds on the login page', async () => {
    signOut()

    const page = await mountSuspended(Login)

    expectFloor(page.element as Element, ['sign-in-google', 'login-privacy'])

    // A 44px button and a link of the same height, so the gap is the only
    // thing keeping the thumb from choosing between them.
    expectApart(page.get('[data-testid="login-actions"]').element)
  })

  it('holds on the two pages readable without an account', async () => {
    signOut()

    expectFloor((await mountSuspended(Privacy)).element as Element, ['privacy-contact'])

    // The about page carries prose and no control of its own, so it has no
    // landmark to name; a section of that prose stands in for one, and the
    // sweep is here so the first link added to the page is caught by it.
    const about = await mountSuspended(About)

    expect(about.find('[data-testid="about-source"]').exists()).toBe(true)
    expectFloor(about.element as Element, [])
  })

  it('holds on the way back out of a wrong address', async () => {
    signOut()

    const page = await mountSuspended(ErrorPage, {
      props: { error: createError({ statusCode: 404 }) },
    })

    expectFloor(page.element as Element, ['error-home'])
  })
})

/**
 * Teleported to `document.body`, so it is out of reach of the sweeps above and
 * is the one place a control can be added without any of them noticing.
 */
describe('the touch-target floor inside a dialog', () => {
  it('holds on the footer of the unbinding confirmation', async () => {
    forgetTeleported('unbind-confirm')

    const page = await mountSuspended(Settings)
    await page.get('[data-testid="alias-remove"]').trigger('click')
    await nextTick()

    const dialog = teleported('unbind-confirm')

    expect(dialog).not.toBeNull()
    expectFloor(dialog!, ['unbind-cancel', 'unbind-remove'])
    expectApart(dialog!.querySelector('[data-slot="alert-dialog-footer"]')!)
  })

  it('holds on the password dialog the private sync opens', async () => {
    forgetTeleported('private-dialog')

    const page = await mountSuspended(ImportPage)
    await page.get('[data-testid="private-open"]').trigger('click')
    await nextTick()

    const dialog = teleported('private-dialog')

    expect(dialog).not.toBeNull()
    expectFloor(dialog!, ['private-password', 'private-cancel', 'private-submit'])
  })

  /**
   * The other half of what a dialog owes a 320px screen: `p-6` on both sides
   * of one is a sixth of it, and `w-full` puts the border under the bezel.
   */
  it('spends less of a narrow screen on its own padding', async () => {
    forgetTeleported('unbind-confirm')

    const page = await mountSuspended(Settings)
    await page.get('[data-testid="alias-remove"]').trigger('click')
    await nextTick()

    const classes = (teleported('unbind-confirm')?.getAttribute('class') ?? '').split(' ')

    expect(classes).toContain('p-4')
    expect(classes).toContain('sm:p-6')
    expect(classes).toContain('w-[calc(100%-2rem)]')
    expect(classes).toContain('max-w-lg')
  })
})

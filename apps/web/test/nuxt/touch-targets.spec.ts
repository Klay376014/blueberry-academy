import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
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
import { forgetTeleported, teleported } from '../teleported'
import { signIn, signOut } from '../helpers'

/**
 * The touch-target floor of docs/specs/2026-09-18-responsive-baseline.md §5,
 * over the pages that draw controls of their own. The site chrome's own half
 * is `responsive.spec.ts`, and §6 of that document is what says why this
 * asserts classes rather than heights: jsdom has no layout engine, so "the
 * thumb lands on it" is read by hand at the six widths and written back onto
 * issue #218.
 *
 * Written as a rule over every pressable a page holds rather than as a list of
 * testids: a list only ever covers the ten controls somebody thought of, and
 * the eleventh is added by whoever reads this file least.
 */

const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

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

/** Anything a thumb can land on, which is more than the things called buttons. */
const PRESSABLE = 'a, button, input:not([type="hidden"]), select, textarea'

/**
 * The floor, wherever it is carried. §5 allows three answers and this is all
 * three: the control itself, the `<label>` that wraps a 16px checkbox, or a
 * `::before` hit area behind a graphic that keeps its drawn size.
 */
function carriesFloor(element: Element): boolean {
  const own = element.getAttribute('class') ?? ''
  if (own.includes('min-h-11') || own.includes('before:size-11')) return true

  const label = element.closest('label')

  return label !== null && (label.getAttribute('class') ?? '').includes('min-h-11')
}

function nameOf(element: Element): string {
  return (
    element.getAttribute('data-testid') ??
    element.getAttribute('aria-label') ??
    element.textContent?.trim().slice(0, 30) ??
    element.tagName.toLowerCase()
  )
}

/**
 * @param landmarks Controls this region is known to hold, so the sweep below
 * cannot pass by finding nothing. Named rather than counted: how many controls
 * a region draws at once is what a narrow layout is allowed to change.
 */
function expectFloor(root: Element, landmarks: string[]) {
  const pressables = [...root.querySelectorAll(PRESSABLE)]
  const names = pressables.map(nameOf)

  for (const landmark of landmarks) expect(names).toContain(landmark)

  expect(pressables.filter((element) => !carriesFloor(element)).map(nameOf)).toEqual([])
}

/** 8px between two of them, in both axes: these rows wrap. */
function expectApart(element: Element) {
  const classes = (element.getAttribute('class') ?? '').split(' ')

  expect(
    classes.some((name) => /^gap-(?:[2-9]|\d\d)$/.test(name)),
    nameOf(element),
  ).toBe(true)
}

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

/** One more than the section draws before it offers to draw the rest. */
const A_SCREENFUL_AND_ONE = 21

beforeEach(() => {
  battles.value = fakeBattles([
    ...STATS_ROWS,
    ...Array.from({ length: A_SCREENFUL_AND_ONE }, (_, index) => watched(`watched-${index}`)),
  ])

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
    // The about page carries prose and no control of its own; it is swept so
    // that the first link added to it is caught here.
    expectFloor((await mountSuspended(About)).element as Element, [])
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

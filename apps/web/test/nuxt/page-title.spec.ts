import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import ErrorPage from '../../app/error.vue'
import { fakeBattles } from '../fakes/battles'
import { signIn, signOut } from '../helpers'

/**
 * What the browser tab says (issue #139).
 *
 * Before this, only the two prerendered prose pages had a `<title>` at all and
 * every other page showed its own URL — five tabs open and none of them could
 * be told from the others.
 *
 * The site name is not translated (it is the name of the thing, see
 * `SiteBrand`), so what varies by locale is the page half alone.
 */
const { battles } = vi.hoisted(() => ({ battles: { value: null as unknown } }))

mockNuxtImport('useBattles', () => () => battles.value as never)

/** Every address a reader can reach, and what its tab should say. */
const ROUTES = [
  ['/', null],
  ['/about', 'About'],
  ['/privacy', 'Privacy and terms'],
  ['/import', 'Import a replay'],
  ['/settings', 'Settings'],
  ['/login', 'Sign in'],
] as const

const title = (page: string | null) => (page ? `${page} · Blueberry Academy` : 'Blueberry Academy')

describe('the browser tab', () => {
  beforeEach(() => {
    battles.value = fakeBattles()
    signIn()
  })

  it.each(ROUTES)('says what page %s is', async (route, page) => {
    await mountSuspended(App, { route })

    await vi.waitFor(() => {
      expect(document.title).toBe(title(page))
    })
  })

  // The site half last: a tab strip narrows from the right, so what survives
  // is the half that differs between tabs rather than the half they share.
  it('puts the page first and the site second', async () => {
    await mountSuspended(App, { route: '/import' })

    await vi.waitFor(() => {
      expect(document.title).toMatch(/^Import a replay · /)
    })
  })

  it('says only the site name on the page that is the site', async () => {
    await mountSuspended(App, { route: '/' })

    await vi.waitFor(() => {
      expect(document.title).toBe('Blueberry Academy')
    })

    // Not "Blueberry Academy · Blueberry Academy", which is what a template
    // applied to a page with no name of its own would produce.
    expect(document.title).not.toMatch(/Blueberry Academy.*Blueberry Academy/)
  })

  it('says it in the reader’s language', async () => {
    await mountSuspended(App, { route: '/zh-TW/import' })

    await vi.waitFor(() => {
      expect(document.title).toBe('匯入對戰 · Blueberry Academy')
    })
  })

  it('names a mistyped address rather than leaving the tab blank', async () => {
    signOut()

    // Through `createError`, so the props are the shape Nuxt really hands
    // over — the same fixture `error-page.spec.ts` uses.
    await mountSuspended(ErrorPage, { props: { error: createError({ statusCode: 404 }) } })

    await vi.waitFor(() => {
      expect(document.title).toBe(title('There is nothing at this address'))
    })
  })
})

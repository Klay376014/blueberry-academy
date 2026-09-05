import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signOut } from '../helpers'
import { locale } from '../locales'

/**
 * Read off disk rather than imported: `import … from 'en.json'` hands back
 * vue-i18n's compiled message ASTs here, and what is asserted below is the
 * sentence a preview will show, not its parse tree.
 */
const en = locale('en')
const zhTW = locale('zh-TW')

/**
 * What a public page says about itself when its address is pasted somewhere
 * that expands links (issue #130).
 *
 * The tags are read off the document rather than off the composable: what is
 * being asserted is that they reach the head of the page, which is the only
 * place a crawler or a chat client will look.
 */
const content = (selector: string) =>
  document.head.querySelector(selector)?.getAttribute('content') ?? null

const ORIGIN = 'https://blueberry-academy.ivy-cudgel.com'

describe('the dashboard, pasted somewhere', () => {
  // `/` stays a plain SPA and says nothing about itself: it is two pages at one
  // address (issue #126), and the half worth sharing cannot be told apart from
  // the half that is somebody's private dashboard. See the follow-up note on
  // ADR-0001.
  // First in the file on purpose: what a page puts in the head outlives its
  // mount here, so a `/` mounted after `/about` would be read through the
  // about page's leftovers. The address is asserted rather than the absence of
  // any tag at all, so this says what it means either way — nothing on this
  // page claims that `/` is a thing to share.
  it('says nothing: it is whoever is reading it', async () => {
    signOut()

    await mountSuspended(App, { route: '/' })

    const urls = [...document.head.querySelectorAll('meta[property="og:url"]')].map((meta) =>
      meta.getAttribute('content'),
    )

    expect(urls).not.toContain(`${ORIGIN}/`)
  })
})

describe('the about page, pasted somewhere', () => {
  beforeEach(signOut)

  it('says what it is, for a person and for a crawler', async () => {
    await mountSuspended(App, { route: '/about' })

    await vi.waitFor(() => {
      expect(document.title).toBe(en.seo.about.title)
    })

    expect(content('meta[name="description"]')).toBe(en.seo.about.description)
    expect(content('meta[property="og:title"]')).toBe(en.seo.about.title)
    expect(content('meta[property="og:description"]')).toBe(en.seo.about.description)
    expect(content('meta[property="og:type"]')).toBe('website')
    expect(content('meta[property="og:site_name"]')).toBe('Blueberry Academy')
  })

  it('says which address it is, in full', async () => {
    await mountSuspended(App, { route: '/about' })

    await vi.waitFor(() => {
      expect(content('meta[property="og:url"]')).toBe(`${ORIGIN}/about`)
    })

    // Relative would be no answer at all: the reader of these is a machine on
    // another host.
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      `${ORIGIN}/about`,
    )
  })

  it('is a summary card rather than a picture: there is no picture to show', async () => {
    await mountSuspended(App, { route: '/about' })

    await vi.waitFor(() => {
      expect(content('meta[name="twitter:card"]')).toBe('summary')
    })

    expect(content('meta[name="twitter:title"]')).toBe(en.seo.about.title)
    expect(content('meta[name="twitter:description"]')).toBe(en.seo.about.description)
    expect(document.head.querySelector('meta[property="og:image"]')).toBeNull()
  })
})

describe('the privacy page, pasted somewhere', () => {
  beforeEach(signOut)

  it('says what it is', async () => {
    await mountSuspended(App, { route: '/privacy' })

    await vi.waitFor(() => {
      expect(document.title).toBe(en.seo.privacy.title)
    })

    expect(content('meta[property="og:description"]')).toBe(en.seo.privacy.description)
    expect(content('meta[property="og:url"]')).toBe(`${ORIGIN}/privacy`)
  })
})

describe('the copy behind the tags', () => {
  it('is written in both locales', () => {
    for (const page of ['about', 'privacy'] as const) {
      for (const locale of [en, zhTW]) {
        expect(locale.seo[page].title).toBeTruthy()
        expect(locale.seo[page].description).toBeTruthy()
      }
    }
  })

  it('fits what a preview will show of it', () => {
    // Roughly what Google and the chat clients cut a description off at.
    // Longer is not broken, it is just not read — and a sentence that ends
    // mid-word in the preview is worse than a shorter one.
    for (const page of ['about', 'privacy'] as const) {
      for (const locale of [en, zhTW]) {
        expect(locale.seo[page].description.length).toBeLessThanOrEqual(200)
        expect(locale.seo[page].title.length).toBeLessThanOrEqual(70)
      }
    }
  })
})

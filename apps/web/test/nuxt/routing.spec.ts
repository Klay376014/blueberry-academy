import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'
import { signIn, signOut } from '../helpers'

// `/` sits behind the login now; the redirect itself is asserted in
// auth.spec.ts.
describe('file-based routes', () => {
  beforeEach(signIn)

  it('renders the home page at /', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    expect(wrapper.find('main h1').text()).toBe('Blueberry Academy')
  })

  it('renders the about page at /about', async () => {
    const wrapper = await mountSuspended(App, { route: '/about' })
    expect(wrapper.find('main h1').text()).toBe('About')
  })

  it('renders the import page at /import', async () => {
    const wrapper = await mountSuspended(App, { route: '/import' })
    expect(wrapper.find('main h1').text()).toBe('Import a replay')
  })

  it('renders the settings page at /settings', async () => {
    const wrapper = await mountSuspended(App, { route: '/settings' })
    expect(wrapper.find('main h1').text()).toBe('Settings')
  })

  // Scoped to the header's nav, and without `/settings` in it: settings is
  // the reader's own account rather than a place on the site, so it moved
  // into the account menu, and the footer's links are a second `<nav>` that a
  // bare `nav a` would now sweep up as well (issue #128).
  it('links to every route from the nav', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    const hrefs = wrapper.findAll('[data-testid="site-nav"] a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/', '/about', '/import'])
  })

  // Every link on the page rather than the nav's: what a stranger must not be
  // offered is the two pages that need an account, wherever they are drawn.
  it('offers no import or settings link to somebody who is not signed in', async () => {
    signOut()

    const wrapper = await mountSuspended(App, { route: '/login' })

    const hrefs = wrapper.findAll('a').map((a) => a.attributes('href'))
    expect(hrefs).not.toContain('/import')
    expect(hrefs).not.toContain('/settings')
    expect(hrefs).toContain('/about')
  })
})

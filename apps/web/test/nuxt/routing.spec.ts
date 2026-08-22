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

  it('links to every route from the nav', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    const hrefs = wrapper.findAll('nav a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/', '/about', '/import', '/settings'])
  })

  it('offers no import or settings link to somebody who is not signed in', async () => {
    signOut()

    const wrapper = await mountSuspended(App, { route: '/login' })

    const hrefs = wrapper.findAll('nav a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/', '/about'])
  })
})

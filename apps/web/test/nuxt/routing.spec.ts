import { beforeEach, describe, expect, it } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import App from '../../app/app.vue'

// `/` is behind the login now, so these mount as a signed-in user; the
// redirect itself is asserted in auth.spec.ts.
function signIn() {
  useCurrentUser().value = { id: 'test-user' } as never
}

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

  it('links to both routes from the nav', async () => {
    const wrapper = await mountSuspended(App, { route: '/' })
    const hrefs = wrapper.findAll('nav a').map((a) => a.attributes('href'))
    expect(hrefs).toEqual(['/', '/about'])
  })
})

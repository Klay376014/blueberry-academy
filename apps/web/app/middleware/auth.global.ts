/**
 * Deny by default: a new page is protected the moment it is added, rather than
 * when somebody remembers to protect it.
 */
const PUBLIC_ROUTES = new Set([
  'login',
  // Runs before a session exists — this is where one is obtained.
  'auth-callback',
  'about',
  // Two pages of prose about what this reads and what it keeps. Behind the
  // login they would be unreadable by exactly the person deciding whether to
  // sign in (issue #127).
  'privacy',
  // `/` answers both readers: landing content for a stranger, the dashboard
  // for somebody signed in. The page decides which, and reads nothing without
  // a session (issue #126). One route rather than the rule — everything not
  // named here is still protected by default.
  'index',
])

export default defineNuxtRouteMiddleware((to) => {
  // An address that matches no page is not a page to protect: without this it
  // is caught by the rule below and answered with the login screen, which
  // tells somebody who mistyped a URL to sign in. Let it through and the error
  // page says what actually happened (issue #125).
  if (!to.matched.length) return

  // Nuxt i18n names routes `<name>___<locale>`, e.g. `index___zh-TW`.
  const [name = '', locale] = String(to.name ?? '').split('___')

  if (PUBLIC_ROUTES.has(name)) return
  if (useCurrentUser().value) return

  const localePath = useLocalePath()
  // The suffix came off a route name Nuxt i18n generated, so it is one of the
  // configured codes: the cast tells TypeScript what the router guaranteed.
  const target = locale as Parameters<typeof localePath>[1]

  return navigateTo({ path: localePath('/login', target) })
})

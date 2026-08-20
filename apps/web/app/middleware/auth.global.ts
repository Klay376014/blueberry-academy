/**
 * Everything is behind the login except the few routes that cannot be.
 *
 * Deny by default: a new page is protected the moment it is added, rather than
 * when somebody remembers to protect it.
 */
const PUBLIC_ROUTES = new Set([
  'login',
  // Runs before a session exists — this is where one is obtained.
  'auth-callback',
  'about',
])

export default defineNuxtRouteMiddleware((to) => {
  // Nuxt i18n names routes `<name>___<locale>`, e.g. `index___zh-TW`.
  const [name, locale] = String(to.name ?? '').split('___')

  if (name !== undefined && PUBLIC_ROUTES.has(name)) return

  const { user } = useAuth()
  if (user.value) return

  const localePath = useLocalePath()
  // Send them to the login page of the locale they were heading for, rather
  // than dropping them into the default one. The suffix came off a route name
  // Nuxt i18n generated itself, so it is one of the configured codes -- the
  // cast tells TypeScript only what the router already guaranteed.
  const target = locale as Parameters<typeof localePath>[1]

  return navigateTo({ path: localePath('/login', target) })
})

/**
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
  const [name = '', locale] = String(to.name ?? '').split('___')

  if (PUBLIC_ROUTES.has(name)) return
  if (useCurrentUser().value) return

  const localePath = useLocalePath()
  // The suffix came off a route name Nuxt i18n generated, so it is one of the
  // configured codes: the cast tells TypeScript what the router guaranteed.
  const target = locale as Parameters<typeof localePath>[1]

  return navigateTo({ path: localePath('/login', target) })
})

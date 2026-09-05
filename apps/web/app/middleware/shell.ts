/**
 * Which of the two shells a page on both sides of the login is drawn in
 * (issue #126).
 *
 * `/`, `/about` and `/privacy` are readable with or without a session, and the
 * two readers want different frames: a stranger has no account to sign out of,
 * and somebody signed in should not watch their nav disappear for one page.
 *
 * In a middleware rather than in the page, which is where `app/error.vue`
 * settles it: a `<NuxtLayout>` drawn by a page sits inside that page's own
 * Suspense boundary, so the header, the nav and both switchers would wait for
 * whatever the page awaits — a cold load of the dashboard would show an empty
 * window until the battles came back. From here the shell is on the route
 * before the page is asked for anything.
 *
 * Both branches, not only the signed-in one: this writes to the route, and the
 * same route object comes back on the next visit.
 */
export default defineNuxtRouteMiddleware(() => {
  setPageLayout(useCurrentUser().value ? 'app' : 'public')
})

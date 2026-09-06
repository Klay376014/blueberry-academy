/**
 * Puts every page's title into the same shape (issue #139).
 *
 * Called by the two roots rather than by each page: `app/error.vue` replaces
 * `app.vue` outright when something is thrown, so a template registered only
 * in the latter would leave a mistyped address with a bare title.
 *
 * A page then says its own name and nothing else — `useHead({ title })` — and
 * a page that says nothing gets the site name alone.
 */
export function useSiteTitle() {
  useHead({ titleTemplate: (page) => siteTitle(page) })
}

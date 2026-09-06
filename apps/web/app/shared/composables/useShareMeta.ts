/**
 * What a page says about itself to whatever is not a browser: a crawler, or
 * the chat client expanding a link somebody pasted (issue #130).
 *
 * Only the public prose pages call this. `/` deliberately does not — it is two
 * pages at one address, and the half worth sharing cannot be told apart from
 * somebody's private dashboard; see the follow-up note on ADR-0001.
 *
 * Getters rather than values: the reader can change language while the page is
 * open, and a description that stays in the language it was mounted in is a
 * description that lies to the next person the link is sent to.
 */
export function useShareMeta(page: { title: () => string; description: () => string }) {
  const route = useRoute()
  const { baseUrl } = useRuntimeConfig().public.i18n

  /**
   * Absolute, because the reader is on another host. `route.path` rather than
   * `fullPath`: a query string is not part of what this page is.
   */
  const url = () => `${baseUrl}${route.path}`

  // The canonical link, the hreflang alternates and og:locale, all of which
  // follow from the locale and the route rather than from this page.
  useHead(useLocaleHead({ seo: true }))

  /**
   * The tab and the share card say the same thing, site name included.
   *
   * `og:site_name` carries it too, but not every client renders that — a card
   * that says only "About" is a card that does not say whose. So the page half
   * goes to `title` and the shared template adds the site half (issue #139),
   * while `og:title` is handed the same string already assembled, by the same
   * function, so the two cannot drift.
   */
  const full = () => siteTitle(page.title())

  useSeoMeta({
    title: page.title,
    description: page.description,

    ogTitle: full,
    ogDescription: page.description,
    ogType: 'website',
    ogSiteName: SITE_NAME,
    ogUrl: url,

    // A summary card and no `og:image`: there is no image to point at, and
    // pointing at one that does not exist is how a preview ends up blank
    // rather than compact.
    twitterCard: 'summary',
    twitterTitle: full,
    twitterDescription: page.description,
  })
}

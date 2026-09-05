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

  useSeoMeta({
    title: page.title,
    description: page.description,

    ogTitle: page.title,
    ogDescription: page.description,
    ogType: 'website',
    ogSiteName: 'Blueberry Academy',
    ogUrl: url,

    // A summary card and no `og:image`: there is no image to point at, and
    // pointing at one that does not exist is how a preview ends up blank
    // rather than compact.
    twitterCard: 'summary',
    twitterTitle: page.title,
    twitterDescription: page.description,
  })
}

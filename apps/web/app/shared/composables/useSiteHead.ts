/**
 * The head every page shares: the shape of its title (issue #139) and the
 * icon a tab draws it with (issue #140).
 *
 * Called by the two roots rather than by each page: `app/error.vue` replaces
 * `app.vue` outright when something is thrown, so anything registered only in
 * the latter would leave a mistyped address with a bare tab.
 *
 * A page then says its own name and nothing else — `useHead({ title })` — and
 * a page that says nothing gets the site name alone.
 */
export function useSiteHead() {
  useHead({
    titleTemplate: (page) => siteTitle(page),

    // The files in `public/`, cropped and resized from the Blueberry Academy
    // crest. Served from here rather than from the image host they came from:
    // an outside host may stop answering, and a share card whose image will
    // not load renders blank rather than falling back to text.
    //
    // `.ico` is asked for by name at the root whether or not it is declared,
    // so it is declared: an undeclared one is still fetched, and a browser
    // that finds nothing draws a blank page icon.
    link: [
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/icon.png', type: 'image/png', sizes: '512x512' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
    ],
  })
}

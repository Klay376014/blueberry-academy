/** The name of the thing. Not translated — see `SiteBrand` for why. */
export const SITE_NAME = 'Blueberry Academy'

/**
 * What the browser tab says: the page, then the site (issue #139).
 *
 * That order because a tab strip narrows from the right, so the half that
 * survives being cut should be the half that differs between tabs rather than
 * the half every tab shares.
 *
 * The home page has no name of its own — it *is* the site — so it gets the
 * site name alone rather than it twice.
 */
export function siteTitle(page?: string | null): string {
  return page ? `${page} · ${SITE_NAME}` : SITE_NAME
}

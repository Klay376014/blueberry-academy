/**
 * The site's Content-Security-Policy, and the pieces both of its delivery
 * paths need. See docs/specs/2026-09-11-private-replay-sync-design.md §5.5
 * (issue #177).
 *
 * Measured on this build, and the reason there are two paths at all: a request
 * for one of the four prerendered addresses never reaches the Worker — the
 * asset router answers it from `.output/public`, so its headers come from
 * `_headers`, which the cloudflare preset writes out of `routeRules`. Every
 * other address is rendered by the Worker, which is where `routeRules` headers
 * are applied in the usual way. `modules/csp.ts` fills in the first,
 * `server/plugins/csp.ts` the second.
 */

/** A `<script>` with no `src`, as [attributes, body]. */
const INLINE_SCRIPT = /<script(?![^>]*\ssrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi

const TYPE_ATTRIBUTE = /\btype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i

/**
 * What the browser will execute, and therefore what needs a source expression.
 * An absent `type` means classic JavaScript; `application/json` and the other
 * data blocks are not scripts to CSP and get no hash.
 */
const EXECUTABLE_TYPES = new Set([
  '',
  'module',
  'importmap',
  'text/javascript',
  'application/javascript',
])

/**
 * `'sha256-…'` for every inline script in `html`, deduplicated and in the
 * order met.
 *
 * Three of them are unavoidable on every page of this app, which is why
 * `script-src 'self'` on its own cannot stand: Nuxt's entry import map,
 * @nuxtjs/color-mode's pre-paint script, and the `window.__NUXT__.config`
 * block. Only the last differs between the two delivery paths — ADR-0011's
 * runtime variables are written into it as the Worker answers, so its hash is
 * not knowable at build time.
 */
export async function inlineScriptHashes(html: string): Promise<string[]> {
  const hashes: string[] = []

  for (const [, attributes = '', body = ''] of html.matchAll(INLINE_SCRIPT)) {
    const [, quoted = '', single = '', bare = ''] = TYPE_ATTRIBUTE.exec(attributes) ?? []
    if (!EXECUTABLE_TYPES.has((quoted || single || bare).trim().toLowerCase())) continue

    const hash = `'sha256-${await sha256(body)}'`
    if (!hashes.includes(hash)) hashes.push(hash)
  }

  return hashes
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

/** `policy` with `sources` added to `directive`, minus what it already allows. */
export function allowing(policy: string, directive: string, sources: string[]): string {
  return policy
    .split(';')
    .map((part) => {
      const listed = part.trim().split(/\s+/)
      if (listed[0] !== directive) return part

      const missing = sources.filter((source) => !listed.includes(source))
      return missing.length === 0 ? part : `${part} ${missing.join(' ')}`
    })
    .join(';')
}

/**
 * The policy every response carries, before the two additions that can only be
 * made where the response is produced.
 *
 * What each source is for, since a CSP is unreadable otherwise:
 *
 * - `img-src` — Showdown's sprite sheet is linked rather than stored (battle
 *   timeline design document §4), and `data:` is the SVG texture behind the
 *   page, inlined in `app/assets/tailwind.css`.
 * - `font-src 'self'` — Inter is self-hosted, so there is nothing else to
 *   allow (docs/adr/0007-self-hosted-inter.md).
 * - `connect-src` — the replay API the browser imports from, plus the Supabase
 *   project, which is not named here: it is a runtime variable of the Worker
 *   (docs/adr/0011-nuxt-public-as-worker-runtime-vars.md), so the plugin adds
 *   the origin it was actually given. The four prerendered pages are static
 *   files with an empty one baked in, so no client is ever created on them and
 *   they ask for nothing — measured, and the day that stops being true they
 *   need a source here.
 * - `frame-ancestors 'none'` — nothing here is meant to be framed, and this is
 *   the modern spelling of X-Frame-Options.
 * - `form-action 'self'` — the sign-in flow leaves by `location.assign`, not by
 *   submitting a form, so no form on this site posts anywhere else.
 * - the hash in `style-src` is of the **empty string**, and it is what keeps
 *   `'unsafe-inline'` off this line. Unovis styles a chart through emotion,
 *   which appends an empty `<style>` and then fills it with `insertRule`
 *   (`sheet.insertRule`, its speedy path). CSP checks the element when it is
 *   inserted and never sees the rules, so allowing the empty one is the whole
 *   cost. Measured on a throwaway page rendering `StatsTrendChart` against
 *   `wrangler dev`: with `style-src 'self'` alone the element's `.sheet` was
 *   `null` and the chart lost all 34 of its rules; with this hash, `.sheet`
 *   held them. Written-out inline CSS stays blocked — its hash is not this one.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "script-src 'self'",
  "style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
  "img-src 'self' data: https://play.pokemonshowdown.com",
  "font-src 'self'",
  "connect-src 'self' https://replay.pokemonshowdown.com",
].join('; ')

// @vitest-environment node
// The `types` reference is load-bearing here for the same reason it is in
// `architecture.spec.ts`: this file is outside `tsconfig.app.json`'s
// `test/nuxt/**` include, so on its own `node:fs` would resolve to nothing.
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Which addresses are built into HTML at build time, and which are still the
 * empty SPA shell ADR-0001 decided on (issue #130).
 *
 * Read off `nuxt.config.ts` rather than off a running build: the rule is a
 * build input, and a test that boots Nitro to read it back would take minutes
 * to say the same thing. What it cannot see — that the prerender actually
 * produced the tags — is `seo.spec.ts`'s to say, from the head of the page.
 */
const WEB = fileURLToPath(new URL('..', import.meta.url))

const withoutComments = (source: string) =>
  source.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/(?<![:\w])\/\/.*$/gm, ' ')

const NUXT_CONFIG = withoutComments(readFileSync(path.join(WEB, 'nuxt.config.ts'), 'utf8'))
const WRANGLER = withoutComments(readFileSync(path.join(WEB, 'wrangler.jsonc'), 'utf8'))

/** The `routeRules` object, from its opening brace to its matching one. */
function routeRulesBlock(): string {
  const start = NUXT_CONFIG.indexOf('routeRules:')
  expect(start).toBeGreaterThan(-1)

  let depth = 0
  for (let index = NUXT_CONFIG.indexOf('{', start); index < NUXT_CONFIG.length; index++) {
    if (NUXT_CONFIG[index] === '{') depth++
    if (NUXT_CONFIG[index] === '}' && --depth === 0)
      return NUXT_CONFIG.slice(NUXT_CONFIG.indexOf('{', start), index + 1)
  }

  throw new Error('routeRules is not closed')
}

/** Each rule as `[route, its options]`. */
function rules(): [string, string][] {
  return [...routeRulesBlock().matchAll(/'([^']+)':\s*(\{[^}]*\})/g)].map(([, route, options]) => [
    route!,
    options!,
  ])
}

/** The rules that put something at an address, which is not the catch-all. */
const prerendered = () => rules().filter(([route]) => route !== '/**')

describe('what is built into HTML', () => {
  it('is the public prose, in both languages', () => {
    expect(prerendered().map(([route]) => route)).toEqual([
      '/about',
      '/zh-TW/about',
      '/privacy',
      '/zh-TW/privacy',
    ])
  })

  it('is rendered at build time rather than per request', () => {
    // The 10ms CPU budget of the Workers free plan is why ADR-0001 said no to
    // SSR at all. `prerender` spends that budget once, on a build machine.
    for (const [route, options] of prerendered()) {
      expect(`${route}: ${options}`).toContain('prerender: true')
      expect(`${route}: ${options}`).toContain('ssr: true')
    }
  })

  it('leaves everything behind the login a plain SPA shell', () => {
    // Named rather than derived: a page that has to be added to this list is a
    // page somebody is about to render on a server, and that should be a
    // deliberate edit.
    for (const route of ['/import', '/settings', '/teams', '/login', '/auth/callback']) {
      expect(routeRulesBlock()).not.toContain(`'${route}`)
    }

    // `/` is two pages at one address (issue #126): landing content for a
    // stranger, somebody's private dashboard for a reader with a session.
    expect(routeRulesBlock()).not.toContain("'/':")

    // The catch-all, which is what makes every address not named above the
    // empty shell ADR-0001 decided on. `ssr: true` at the top with this under
    // it is the same delivery as `ssr: false` was, and the only spelling of it
    // that lets the four above be rendered at all; see the follow-up note.
    expect(routeRulesBlock()).toContain("'/**': { ssr: false }")
  })
})

describe('the address those pages claim to live at', () => {
  it('is the one the Worker is actually served on', () => {
    const origin = /baseUrl:\s*'([^']+)'/.exec(NUXT_CONFIG)?.[1]
    const domain = /"pattern":\s*"([^"]+)"/.exec(WRANGLER)?.[1]

    // A canonical URL pointing at a host this is not served on is worse than
    // none: it tells a crawler to index somewhere else.
    expect(origin).toBe(`https://${domain}`)
  })

  it('is served at that address rather than one redirect from it', () => {
    // A prerendered page is a file at `about/index.html`, and Cloudflare's
    // default handling answers `/about` with a 307 to `/about/` — measured on
    // this build (issue #130). The canonical link and og:url both say
    // `/about`, so that is the address that has to answer.
    expect(WRANGLER).toContain('"html_handling": "drop-trailing-slash"')
  })
})

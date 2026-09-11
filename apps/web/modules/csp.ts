import { defineNuxtModule } from 'nuxt/kit'
import { CONTENT_SECURITY_POLICY, allowing, inlineScriptHashes } from '../server/csp'

/**
 * Puts the Content-Security-Policy (server/csp.ts) on the catch-all route rule,
 * which is what the cloudflare preset writes `_headers` out of — and therefore
 * what the four prerendered addresses are served with, since the asset router
 * answers those without ever reaching the Worker.
 *
 * A module rather than a `headers` entry in nuxt.config.ts because the policy
 * is not a constant: `script-src` has to name the hash of every inline script
 * those pages carry, and the entry import map alone changes with every build.
 * Measured on this build, the order that makes this work: Nitro prerenders
 * (`Prerendering 4 routes`), then writes `_headers` from `routeRules` as it
 * finishes (`Generated .output/public/_headers`) — so a hash added here while
 * a page is being generated is in the file by the time it is written.
 */
export default defineNuxtModule({
  meta: { name: 'csp' },

  setup(_options, nuxt) {
    nuxt.hook('nitro:init', (nitro) => {
      const rule = (nitro.options.routeRules['/**'] ??= {})
      const headers = (rule.headers ??= {})
      headers['content-security-policy'] = CONTENT_SECURITY_POLICY

      nitro.hooks.hook('prerender:generate', async (route) => {
        if (route.contents === undefined || route.fileName?.endsWith('.html') !== true) return

        const hashes = await inlineScriptHashes(route.contents)

        // Read and write in one step, after the await: routes are generated
        // concurrently, and two of them reading the same policy before either
        // writes would lose one page's hashes.
        headers['content-security-policy'] = allowing(
          headers['content-security-policy']!,
          'script-src',
          hashes,
        )
      })
    })
  },
})

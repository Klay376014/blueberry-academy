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
 *
 * `connect-src` is settled here too, against what this build was given. Those
 * four pages are the one place ADR-0011 does not hold: a prerendered page has
 * the Supabase URL of its *build* written into it, `plugins/supabase.client.ts`
 * runs on every page with no route condition, and `getSession()` renews a token
 * over the network. So the origin baked into the HTML and the origin the
 * header allows have to be the same one — the Worker plugin's version of this
 * never reaches these four.
 */
export default defineNuxtModule({
  meta: { name: 'csp' },

  setup(_options, nuxt) {
    nuxt.hook('nitro:init', (nitro) => {
      // Read from the environment rather than off `runtimeConfig`, which at this
      // hook still holds the declared defaults: measured here, both
      // `nitro.options.runtimeConfig.public.supabaseUrl` and the `nuxt.options`
      // one are `""` on a build that prerenders the real URL into the pages.
      // The override is applied by the renderer, inside `useRuntimeConfig()`,
      // so this reads the variable that renderer will read.
      const supabaseUrl =
        process.env.NUXT_PUBLIC_SUPABASE_URL ?? nitro.options.runtimeConfig.public.supabaseUrl
      const supabase = supabaseUrl === '' ? [] : [new URL(supabaseUrl).origin]

      const rule = (nitro.options.routeRules['/**'] ??= {})
      const headers = (rule.headers ??= {})
      headers['content-security-policy'] = allowing(
        CONTENT_SECURITY_POLICY,
        'connect-src',
        supabase,
      )

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

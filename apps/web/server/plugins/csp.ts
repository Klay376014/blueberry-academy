import { allowing, inlineScriptHashes } from '../csp'

/**
 * The Supabase origin, remembered across requests for the reason the hashes are
 * (server/csp.ts): a Worker is told that URL once, at deploy time
 * (docs/adr/0011-nuxt-public-as-worker-runtime-vars.md), so parsing it again on
 * every request spends ADR-0001's 10ms CPU budget on a constant.
 */
let parsed: { url: string; sources: string[] } | undefined

function supabaseSources(url: string): string[] {
  if (parsed?.url !== url) parsed = { url, sources: url === '' ? [] : [new URL(url).origin] }

  return parsed.sources
}

/**
 * The Content-Security-Policy of everything the Worker renders, which is every
 * address except the four prerendered ones (server/csp.ts).
 *
 * Two things are added here rather than in the policy itself because neither is
 * knowable until the response exists:
 *
 * - the hash of `window.__NUXT__.config`, whose contents are the Worker's own
 *   runtime variables (docs/adr/0011-nuxt-public-as-worker-runtime-vars.md),
 *   and
 * - the Supabase origin those variables name, which is the local stack in
 *   development and the hosted project once deployed. Naming it here rather
 *   than allowing `https://*.supabase.co` keeps `connect-src` down to the one
 *   project this deployment actually talks to.
 */
export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', async (response, { event }) => {
    const policy = getRouteRules(event).headers?.['content-security-policy']
    if (policy === undefined || typeof response.body !== 'string') return

    const { supabaseUrl } = useRuntimeConfig(event).public

    response.headers = {
      ...response.headers,
      'content-security-policy': allowing(
        allowing(policy, 'connect-src', supabaseSources(supabaseUrl)),
        'script-src',
        await inlineScriptHashes(response.body),
      ),
    }
  })
})

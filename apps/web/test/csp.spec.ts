// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { CONTENT_SECURITY_POLICY, allowing, inlineScriptHashes } from '../server/csp'

/**
 * The two moving parts of the Content-Security-Policy (issue #177). What no
 * test here can say is whether a browser accepts the result — that was measured
 * against `wrangler dev`, and the findings are in `server/csp.ts`.
 */

describe('the policy', () => {
  it('leaves no directive to fall back on default-src', () => {
    // A missing `script-src` would quietly inherit `default-src 'self'`, and the
    // hashes added per response would then have nowhere to be added to.
    for (const directive of ['script-src', 'style-src', 'connect-src', 'img-src', 'font-src']) {
      expect(CONTENT_SECURITY_POLICY).toContain(`${directive} `)
    }
  })

  it('allows no inline script and no inline stylesheet of its own', () => {
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-inline')
    expect(CONTENT_SECURITY_POLICY).not.toContain('unsafe-eval')
  })

  it('names no Supabase project, because the Worker is told which at runtime', () => {
    // docs/adr/0011-nuxt-public-as-worker-runtime-vars.md. server/plugins/csp.ts
    // adds the origin it was actually given.
    expect(CONTENT_SECURITY_POLICY).not.toContain('supabase')
  })
})

describe('hashing the inline scripts of a page', () => {
  it('hashes the body of a script that has no src', async () => {
    // sha256 of `alert(1)`, base64.
    expect(await inlineScriptHashes('<script>alert(1)</script>')).toEqual([
      "'sha256-bhHHL3z2vDgxUt0W3dWQOrprscmda2Y5pLsLg4GF+pI='",
    ])
  })

  it('leaves a script with a src alone, hash or not', async () => {
    expect(await inlineScriptHashes('<script type="module" src="/_nuxt/x.js"></script>')).toEqual(
      [],
    )
  })

  it('hashes the import map and the module scripts, which do execute', async () => {
    const html = '<script type="importmap">{}</script><script type="module">1</script>'
    expect(await inlineScriptHashes(html)).toHaveLength(2)
  })

  it('leaves a data block alone, because it is not a script to CSP', async () => {
    // `__NUXT_DATA__` is one of these on every page, and it is never executed.
    const html = '<script type="application/json" id="__NUXT_DATA__">["x"]</script>'
    expect(await inlineScriptHashes(html)).toEqual([])
  })

  it('says each hash once, however many pages share the script', async () => {
    expect(await inlineScriptHashes('<script>a</script><script>a</script>')).toHaveLength(1)
  })
})

describe('adding sources to a directive', () => {
  it('appends to the named directive and nothing else', () => {
    expect(allowing("script-src 'self'; style-src 'self'", 'script-src', ["'sha256-x'"])).toBe(
      "script-src 'self' 'sha256-x'; style-src 'self'",
    )
  })

  it('does not repeat a source the directive already allows', () => {
    expect(allowing("connect-src 'self' https://a", 'connect-src', ['https://a'])).toBe(
      "connect-src 'self' https://a",
    )
  })

  it('leaves a policy without that directive untouched', () => {
    expect(allowing("default-src 'self'", 'script-src', ["'sha256-x'"])).toBe("default-src 'self'")
  })

  it('does not mistake a source for a directive name', () => {
    // `'self'` is the second word of every directive here; matching on the
    // first is what keeps `connect-src` out of a `script-src` edit.
    expect(allowing("script-src 'self'", 'self', ['https://a'])).toBe("script-src 'self'")
  })
})

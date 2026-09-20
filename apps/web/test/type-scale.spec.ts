// @vitest-environment node
// The `types` reference is load-bearing here for the same reason it is in
// `architecture.spec.ts`: this file is outside `tsconfig.app.json`'s
// `test/nuxt/**` include, so on its own `node:fs` would resolve to nothing.
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The type-scale floor of docs/specs/2026-09-18-responsive-baseline.md §5: a
 * sentence is at least 14px, a marker may be as small as it likes.
 *
 * §5 draws that line by asking "is this a sentence", and no class says so.
 * What a class does say is the tag it is on: `<p>` and `<li>` are the two
 * elements that only ever hold prose, and the thirty-odd legitimate 12px
 * nodes on the site — a date, a format, a turn count, a versus — are all
 * `<span>`s inside a row. So the sweep is over those two tags, with an
 * exemption for the ones that carry a marker's own classes (a `<p>` holding
 * nothing but a tally is written `font-mono tabular-nums`).
 *
 * What this cannot see, and what a reader has to: a sentence written into a
 * `<span>`. Read by eye at the six widths of §3, as §6 says.
 */
const WEB = fileURLToPath(new URL('..', import.meta.url))
const APP = path.join(WEB, 'app')

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)

    return path.extname(entry.name) === '.vue' ? [full] : []
  })
}

/** `<!-- -->`, so a tag quoted in prose is not a tag. */
function withoutComments(source: string): string {
  return source.replaceAll(/<!--[\s\S]*?-->/g, ' ')
}

const PROSE_TAG = /<(p|li)(\s[^>]*)?>/g
const CLASS_TOKEN = /[\w[\]/.:-]+/g

/** Below `text-sm`: the named step and any arbitrary value under 14px. */
function isTooSmall(token: string): boolean {
  if (token === 'text-xs') return true

  const px = /^text-\[(\d+)px\]$/.exec(token)

  return px !== null && Number(px[1]) < 14
}

/** A marker's own spelling: a tally, a tag, an abbreviation (§5). */
const MARKER = ['font-mono', 'tabular-nums', 'uppercase']

const show = (file: string) => path.relative(WEB, file).replaceAll(path.sep, '/')

describe('the type-scale floor', () => {
  it('leaves no sentence below 14px', () => {
    const offenders = walk(APP).flatMap((file) => {
      const source = withoutComments(readFileSync(file, 'utf8'))
      const lines = source.split('\n')

      return [...source.matchAll(PROSE_TAG)].flatMap((match) => {
        const tokens = (match[2] ?? '').match(CLASS_TOKEN) ?? []
        if (!tokens.some(isTooSmall) || tokens.some((token) => MARKER.includes(token))) return []

        const line = lines.length - source.slice(match.index).split('\n').length + 1

        return [`${show(file)}:${line} <${match[1]}> is prose below text-sm`]
      })
    })

    expect(offenders).toEqual([])
  })
})

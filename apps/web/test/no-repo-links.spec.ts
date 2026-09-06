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
 * The repository is not something this site hands out (issue #137).
 *
 * Written as a rule over the whole of `app/` and the locale files rather than
 * as two assertions about the two links that were there: what has to hold is
 * that a reader cannot reach the repository from anywhere on the site, and a
 * test naming the places it used to be would pass the day somebody adds a
 * third.
 *
 * `docs/` and this repo's own tooling are not covered and should not be: they
 * are read by whoever is working on it, who has the repository open already.
 */
const WEB = fileURLToPath(new URL('..', import.meta.url))
const APP = path.join(WEB, 'app')
const LOCALES = path.join(WEB, 'i18n', 'locales')

const SOURCE_EXTENSIONS = ['.ts', '.vue', '.json']

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)

    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [full] : []
  })
}

/** What a reader is shown: every component, page and sentence on the site. */
const drawn = () => [...walk(APP), ...walk(LOCALES)]

const show = (file: string) => path.relative(WEB, file).replaceAll(path.sep, '/')

describe('what the site says about where it comes from', () => {
  it('says nothing: the repository is not open to its readers', () => {
    const offenders = drawn()
      .filter((file) => /github\.com/i.test(readFileSync(file, 'utf8')))
      .map((file) => `${show(file)} names github.com, which a reader must not be handed (#137)`)

    expect(offenders).toEqual([])
  })

  it('does not send a reader somewhere this no longer is', () => {
    // The sentence, not only the link: it used to say "ask through the
    // project's repository", which names the thing whether or not it is
    // clickable.
    for (const file of ['en.json', 'zh-TW.json']) {
      const deletion = JSON.parse(readFileSync(path.join(LOCALES, file), 'utf8')).privacy.deletion

      expect(JSON.stringify(deletion)).not.toMatch(/github|repositor|儲存庫/i)
    }
  })
})

// @vitest-environment node
// The `types` reference is load-bearing here for the same reason it is in
// `architecture.spec.ts`: this file is outside `tsconfig.app.json`'s
// `test/nuxt/**` include, so on its own `node:fs` would resolve to nothing.
/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { inspect } from 'node:util'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import config from '../../../vite.config'
import { Secret } from '../server/utils/secret'

const WEB = fileURLToPath(new URL('..', import.meta.url))
const SERVER = path.join(WEB, 'server')

/** The glob the lint override and the scan below both address. */
const SERVER_GLOB = 'apps/web/server/**'

describe('Secret', () => {
  const PASSWORD = 'hunter2'

  it('hands the value back through expose()', () => {
    expect(new Secret(PASSWORD).expose()).toBe(PASSWORD)
  })

  it('redacts String()', () => {
    expect(String(new Secret(PASSWORD))).toBe('[redacted]')
  })

  it('redacts a template literal', () => {
    expect(`sid=${new Secret(PASSWORD)}`).toBe('sid=[redacted]')
  })

  it('redacts JSON.stringify', () => {
    expect(JSON.stringify({ secret: new Secret(PASSWORD) })).toBe('{"secret":"[redacted]"}')
  })

  // Why the value is in a module-level WeakMap rather than on the object: a
  // field is a field to the V8 inspector, `#private` included, and
  // `console.log` goes through the inspector. With nothing on the object
  // there is nothing for it to print.
  it('leaves the object with nothing on it to print', () => {
    const secret = new Secret(PASSWORD)

    expect(Object.getOwnPropertyNames(secret)).toEqual([])
    expect(inspect(secret)).toBe('Secret {}')
  })

  it('keeps two secrets apart', () => {
    expect(new Secret('a').expose()).toBe('a')
    expect(new Secret('b').expose()).toBe('b')
  })
})

/**
 * `console` is off in the folder the credentials pass through — an executable
 * rule rather than a convention in a comment, the way the feature seams are
 * (design document §5.3).
 *
 * Two assertions rather than one: the override has to exist, and the folder
 * has to actually be clean. The second is what `test/architecture.spec.ts`
 * does for the seams — check the thing itself, not only the setting that is
 * supposed to govern it.
 */
describe('no console in server/', () => {
  const SOURCE_EXTENSIONS = ['.ts', '.js']

  function walk(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) return walk(full)

      return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [full] : []
    })
  }

  const serverFiles = walk(SERVER)

  it('has a rule for the folder', () => {
    // Read off the exported config object rather than the file's text, so a
    // reshuffle of the overrides cannot pass by accident.
    const override = config.lint?.overrides?.find((entry) => entry.files?.includes(SERVER_GLOB))

    expect(override?.rules?.['no-console']).toBe('error')
  })

  it('has files for the rule to apply to', () => {
    // Guards the assertion below: an empty folder would pass it by finding
    // nothing.
    expect(serverFiles.length).toBeGreaterThan(0)
  })

  /** `//` and `/* *\/`, so `console.log` named in prose is not a call. */
  function withoutComments(source: string): string {
    return source.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/(?<![:\w])\/\/.*$/gm, ' ')
  }

  it('leaves no console call for the rule to report', () => {
    const calls = serverFiles
      .filter((file) => /\bconsole\s*\./.test(withoutComments(readFileSync(file, 'utf8'))))
      .map((file) => path.relative(WEB, file))

    expect(calls).toEqual([])
  })
})

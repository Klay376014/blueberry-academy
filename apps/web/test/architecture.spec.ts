// @vitest-environment node
// The `types` reference is load-bearing, not decoration: this file is the only
// one under `test/` that is outside `tsconfig.app.json`'s `test/nuxt/**` include,
// so when the pre-commit hook hands it to `vp check` on its own it belongs to no
// project and `node:fs` resolves to nothing. Committing then fails on nine
// phantom errors that a whole-project run never shows.
/// <reference types="node" />
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The feature seams of `app/`, checked over the import graph.
 *
 * `vp check` says the same thing faster and per file (`no-restricted-imports`
 * in vite.config.ts), and it says it about import statements only. Two of the
 * rules below have no import statement to look at:
 *
 * - a relative path is only cross-feature once it is resolved, and
 * - Nuxt auto-imports are global, so `features/timeline` could call
 *   `useStats()` with nothing written down at all.
 *
 * So this walks the resolved graph, and then the auto-imported names on top of
 * it. See issue #61.
 */

const WEB = fileURLToPath(new URL('..', import.meta.url))
const APP = path.join(WEB, 'app')
const FEATURES = path.join(APP, 'features')

const SOURCE_EXTENSIONS = ['.ts', '.vue']
/** What an extensionless specifier may turn out to be, in the order tried. */
const RESOLVE_AS = ['', '.ts', '.vue', '.json', '/index.ts', '/index.vue']

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)

    return SOURCE_EXTENSIONS.includes(path.extname(entry.name)) ? [full] : []
  })
}

const featureNames = readdirSync(FEATURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)

/** Which feature a file belongs to, or null for `shared/`, pages and tests. */
function featureOf(file: string): string | null {
  const relative = path.relative(FEATURES, file)
  if (relative.startsWith('..') || path.isAbsolute(relative)) return null

  return relative.split(path.sep)[0] ?? null
}

/** `//` and `/* *\/` and `<!-- -->`, so a name in prose is not a dependency. */
function withoutComments(source: string): string {
  return source
    .replaceAll(/\/\*[\s\S]*?\*\//g, ' ')
    .replaceAll(/<!--[\s\S]*?-->/g, ' ')
    .replaceAll(/(?<![:\w])\/\/.*$/gm, ' ')
}

const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*)(['"])([^'"]+)\1/g

/** Every module specifier in one file, with `~`/`@` and `..` resolved to a path. */
function importsOf(file: string): { specifier: string; resolved: string | null }[] {
  const source = withoutComments(readFileSync(file, 'utf8'))

  return [...source.matchAll(IMPORT)].map(([, , specifier = '']) => {
    let target: string | null = null

    if (specifier.startsWith('~/') || specifier.startsWith('@/')) {
      target = path.join(APP, specifier.slice(2))
    } else if (specifier.startsWith('.')) {
      target = path.resolve(path.dirname(file), specifier)
    }

    if (target === null) return { specifier, resolved: null }

    const found = RESOLVE_AS.map((suffix) => target + suffix).find((candidate) => {
      try {
        return statSync(candidate).isFile()
      } catch {
        return false
      }
    })

    return { specifier, resolved: found ?? target }
  })
}

const appFiles = walk(APP)
const testFiles = walk(path.join(WEB, 'test'))

/** `app/features/stats/utils/wilson.ts` → `features/stats/utils/wilson.ts`. */
const show = (file: string) => path.relative(APP, file).replaceAll(path.sep, '/')

describe('feature seams', () => {
  it('gives every feature one public API', () => {
    const missing = featureNames.filter((name) => {
      try {
        return !statSync(path.join(FEATURES, name, 'index.ts')).isFile()
      } catch {
        return true
      }
    })

    expect(missing).toEqual([])
  })

  it('keeps features from importing each other', () => {
    const crossings = appFiles.flatMap((file) => {
      const from = featureOf(file)
      if (!from) return []

      return importsOf(file)
        .filter(({ resolved }) => {
          const to = resolved && featureOf(resolved)

          return to !== null && to !== from
        })
        .map(({ specifier }) => `${show(file)} → ${specifier}`)
    })

    expect(crossings).toEqual([])
  })

  it('keeps everything else out of a feature’s internals', () => {
    const reaches = [...appFiles, ...testFiles].flatMap((file) => {
      if (featureOf(file)) return []

      return importsOf(file)
        .filter(({ resolved }) => {
          if (!resolved) return false

          const feature = featureOf(resolved)

          return feature !== null && resolved !== path.join(FEATURES, feature, 'index.ts')
        })
        .map(({ specifier }) => `${path.relative(WEB, file)} → ${specifier}`)
    })

    expect(reaches).toEqual([])
  })

  it('keeps shared/ under every feature and beneath none', () => {
    const shared = path.join(APP, 'shared')

    const reaches = appFiles
      .filter((file) => file.startsWith(shared))
      .flatMap((file) =>
        importsOf(file)
          .filter(({ resolved }) => resolved !== null && featureOf(resolved) !== null)
          .map(({ specifier }) => `${show(file)} → ${specifier}`),
      )

    expect(reaches).toEqual([])
  })
})

/**
 * Where a spec may live. Everything `imports.dirs` scans becomes a global
 * auto-import, so a spec left in one would be registered as a composable —
 * which is why they sit in the feature’s `test/` directory (issue #61).
 */
describe('feature specs', () => {
  // Read raw, not through withoutComments: a glob like `features/*​/utils`
  // contains `/*` and `*/`, so comment stripping would eat the list.
  const NUXT_CONFIG = readFileSync(path.join(WEB, 'nuxt.config.ts'), 'utf8')

  /** The `imports.dirs` globs, e.g. `features/*​/utils`, read off the config. */
  const scannedGlobs = [
    ...(NUXT_CONFIG.match(/imports:\s*\{\s*dirs:\s*\[([^\]]*)\]/)?.[1] ?? '').matchAll(
      /'([^']+)'/g,
    ),
  ].map(([, glob]) => glob!)

  /** `features/stats/utils/wilson.ts` → is `features/stats/utils` scanned? */
  const isScanned = (dir: string) =>
    scannedGlobs.some((glob) => new RegExp(`^${glob.replaceAll('*', '[^/]+')}(/|$)`).test(dir))

  it('reads the scanned directories off nuxt.config.ts', () => {
    expect(scannedGlobs).toContain('features/*/composables')
  })

  it('keeps every spec in its feature’s test/ directory', () => {
    const misplaced = walk(FEATURES)
      .filter((file) => file.endsWith('.spec.ts'))
      .flatMap((file) => {
        const dir = path.relative(APP, path.dirname(file)).replaceAll(path.sep, '/')
        if (dir === `features/${featureOf(file)}/test`) return []

        return [
          isScanned(dir)
            ? `${show(file)} would be auto-imported: ${dir} is in imports.dirs`
            : `${show(file)} belongs in features/${featureOf(file)}/test`,
        ]
      })

    expect(misplaced).toEqual([])
  })
})

/**
 * The same rule over the auto-imported names, which is where lint cannot
 * follow: `features/*​/composables` and `features/*​/utils` are scanned by Nuxt
 * (nuxt.config.ts), so every name they export is in scope everywhere with no
 * import to restrict.
 */
describe('feature seams, auto-imported', () => {
  const EXPORTED =
    /export\s+(?:async\s+)?(?:const|let|function|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g

  /** The names each feature puts into global scope, by feature. */
  const owned = new Map<string, Set<string>>(
    featureNames.map((name) => {
      const scanned = ['composables', 'utils']
        .map((dir) => path.join(FEATURES, name, dir))
        .filter((dir) => {
          try {
            return statSync(dir).isDirectory()
          } catch {
            return false
          }
        })
        .flatMap((dir) => walk(dir))

      const names = scanned.flatMap((file) =>
        [...readFileSync(file, 'utf8').matchAll(EXPORTED)].map(([, exported]) => exported!),
      )

      return [name, new Set(names)]
    }),
  )

  it('names every feature’s auto-imports', () => {
    expect(Object.fromEntries([...owned].map(([name, set]) => [name, set.size > 0]))).toEqual(
      Object.fromEntries(featureNames.map((name) => [name, true])),
    )
  })

  it('keeps a feature from reaching for another one’s auto-imports', () => {
    const uses = appFiles.flatMap((file) => {
      const from = featureOf(file)
      if (!from) return []

      const source = withoutComments(readFileSync(file, 'utf8'))
      const words = new Set(source.match(/[A-Za-z_$][\w$]*/g) ?? [])

      return [...owned]
        .filter(([feature]) => feature !== from)
        .flatMap(([feature, names]) =>
          [...names]
            .filter((name) => words.has(name))
            .map((name) => `${show(file)} uses ${feature}'s ${name}`),
        )
    })

    expect(uses).toEqual([])
  })
})

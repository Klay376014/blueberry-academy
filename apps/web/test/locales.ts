/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

/**
 * A locale file as the data it is.
 *
 * `import messages from '…/en.json'` does not give that back: @nuxtjs/i18n's
 * Vite plugin precompiles the file, so every leaf arrives as a vue-i18n
 * message AST — fine for comparing the shape of two locales against each
 * other, which is what most specs do with it, and useless for asserting a
 * sentence.
 */
export function locale(code: 'en' | 'zh-TW'): typeof import('../i18n/locales/en.json') {
  // Assembled rather than `new URL(…, import.meta.url)`: Vite rewrites that
  // pattern into an asset import, which hands back the very module object
  // this exists to avoid.
  const here = path.dirname(fileURLToPath(import.meta.url))

  return JSON.parse(readFileSync(path.join(here, '..', 'i18n', 'locales', `${code}.json`), 'utf8'))
}

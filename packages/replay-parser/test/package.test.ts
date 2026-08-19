import { describe, expect, it } from 'vite-plus/test'
import pkg from '../package.json'

describe('replay-parser package', () => {
  it('declares no runtime dependencies', () => {
    // The parser's testability rests on it being a pure function: no Supabase,
    // no Nuxt, no fetch, no I/O. A runtime dependency is the first crack.
    expect(pkg).not.toHaveProperty('dependencies')
  })
})

import { describe, expect, it } from 'vite-plus/test'
import pkg from '../package.json'
import ladder from './fixtures/gen9championsvgc2026regmb-2667169457.json'
import forfeit from './fixtures/gen9championsvgc2026regmb-2667301751.json'
import fieldEffects from './fixtures/gen9championsvgc2026regmb-2674299387.json'
import confusion from './fixtures/gen9championsvgc2026regmb-2674380893.json'
import unratedSeries from './fixtures/gen9championsvgc2026regmbbo3-2667579302.json'
import series from './fixtures/gen9championsvgc2026regmbbo3-2667582547.json'
import tie from './fixtures/gen9ou-2667293085.json'
import singles from './fixtures/gen9ou-2667296078.json'
import long from './fixtures/gen9ou-2667299955.json'

/**
 * Every fixture, keyed by the file it is stored in. The key is written out
 * rather than derived so that the file name itself is under test.
 */
const FIXTURES = {
  'gen9championsvgc2026regmb-2667169457.json': ladder,
  'gen9championsvgc2026regmb-2667301751.json': forfeit,
  'gen9championsvgc2026regmb-2674299387.json': fieldEffects,
  // Carries `|-activate|p2b: Garchomp|confusion`, the bare condition name the
  // move table would otherwise rename (#102, ADR-0015).
  'gen9championsvgc2026regmb-2674380893.json': confusion,
  'gen9championsvgc2026regmbbo3-2667579302.json': unratedSeries,
  'gen9championsvgc2026regmbbo3-2667582547.json': series,
  'gen9ou-2667293085.json': tie,
  'gen9ou-2667296078.json': singles,
  'gen9ou-2667299955.json': long,
}

describe('replay-parser package', () => {
  it('declares no runtime dependencies', () => {
    // The parser's testability rests on it being a pure function: no Supabase,
    // no Nuxt, no fetch, no I/O. A runtime dependency is the first crack.
    expect(pkg).not.toHaveProperty('dependencies')
  })

  it('stores only public replays as fixtures, so no password can be committed', () => {
    for (const [file, replay] of Object.entries(FIXTURES)) {
      // Showdown serves a private replay at `<id>-<password>`, so a file named
      // after nothing but its own id cannot be carrying one.
      expect(file).toBe(`${replay.id}.json`)
      expect({ private: replay.private, password: replay.password }).toEqual({
        private: 0,
        password: null,
      })
    }
  })
})

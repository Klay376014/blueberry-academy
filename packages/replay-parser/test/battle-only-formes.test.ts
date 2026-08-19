import { Dex } from '@pkmn/dex'
import { describe, expect, it } from 'vite-plus/test'
import { BATTLE_ONLY_FORMES } from '../src/battle-only-formes'
import { baseSpeciesId, toID } from '../src/species'

describe('BATTLE_ONLY_FORMES', () => {
  it('covers every battle-only forme the dex it was generated from knows', () => {
    // The table is committed, so nothing but this test notices when @pkmn/dex
    // is upgraded and `pnpm gen:battle-only-formes` is not re-run.
    const missing = Dex.species
      .all()
      .filter((species) => species.exists && species.battleOnly)
      .map((species) => species.name)
      .filter((name) => BATTLE_ONLY_FORMES[toID(name)] === undefined)

    expect(missing).toEqual([])
  })

  it('maps every forme to a species that exists and is not battle-only itself', () => {
    for (const [forme, origins] of Object.entries(BATTLE_ONLY_FORMES)) {
      for (const origin of origins ?? []) {
        expect(Dex.species.get(origin).exists, `${forme} -> ${origin}`).toBe(true)
        expect(BATTLE_ONLY_FORMES[origin], `${forme} -> ${origin}`).toBeUndefined()
      }
    }
  })

  it('leaves every registered species alone, so a signature keeps what was picked', () => {
    // A team is declared in formes nobody can be registered in, so normalising
    // a registered species must be the identity — Ninetales-Alola included.
    const registered = Dex.species
      .all()
      .filter((species) => species.exists && !species.battleOnly && Number(species.num) > 0)

    for (const species of registered) {
      expect(baseSpeciesId(species.name), species.name).toBe(toID(species.name))
    }
  })
})

import { describe, expect, it } from 'vite-plus/test'
import { baseSpeciesId, speciesOfDetails, toID } from '../src/species'

describe('toID', () => {
  it('lowercases and strips everything that is not alphanumeric', () => {
    expect(toID('Ninetales-Alola')).toBe('ninetalesalola')
    expect(toID("Farfetch'd")).toBe('farfetchd')
    expect(toID('Mr. Mime')).toBe('mrmime')
    expect(toID('Bibas Rozkurwiator')).toBe('bibasrozkurwiator')
  })

  it('normalises the two spellings of a Showdown name to the same id', () => {
    expect(toID('NotLittleStar')).toBe(toID('notlittlestar'))
  })

  it('strips the ☆ that marks a chat author', () => {
    expect(toID('☆DavoPro1214')).toBe('davopro1214')
  })
})

describe('speciesOfDetails', () => {
  it('takes the species from the front of a details string', () => {
    expect(speciesOfDetails('Scrafty, L50, F')).toBe('Scrafty')
    expect(speciesOfDetails('Gholdengo, L50')).toBe('Gholdengo')
    expect(speciesOfDetails('Staraptor, L50, F, shiny')).toBe('Staraptor')
  })
})

describe('baseSpeciesId', () => {
  it('reduces a Mega forme to the species it evolved from', () => {
    // Otherwise Scrafty and Scrafty-Mega count as two Pokémon in one signature.
    expect(baseSpeciesId('Scrafty-Mega')).toBe('scrafty')
    expect(baseSpeciesId('Glimmora-Mega')).toBe('glimmora')
  })

  it('reduces a Primal forme to the species it reverted from', () => {
    // Primal reversion is the same kind of in-battle state change as Mega, and
    // it arrives with no |-mega| line to cross-check against.
    expect(baseSpeciesId('Groudon-Primal')).toBe('groudon')
    expect(baseSpeciesId('Kyogre-Primal')).toBe('kyogre')
  })

  it('keeps a regional forme, which is a different Pokémon', () => {
    expect(baseSpeciesId('Ninetales-Alola')).toBe('ninetalesalola')
  })

  it('reduces an in-battle forme change to the species it changed from', () => {
    // Mega and Primal are only the best known of these; Showdown marks 128
    // formes as battle-only, and every one of them would otherwise be counted
    // as a second Pokémon in a signature.
    expect(baseSpeciesId('Palafin-Hero')).toBe('palafin')
    expect(baseSpeciesId('Terapagos-Terastal')).toBe('terapagos')
    expect(baseSpeciesId('Zacian-Crowned')).toBe('zacian')
    expect(baseSpeciesId('Aegislash-Blade')).toBe('aegislash')
  })

  it('keeps the regional forme that a battle-only forme reverts to', () => {
    expect(baseSpeciesId('Darmanitan-Galar-Zen')).toBe('darmanitangalar')
  })

  it('reverts a forme whose base is not simply its name without the suffix', () => {
    // Floette-Mega reverts to Floette-Eternal, not to Floette — stripping the
    // suffix would invent a Pokémon that was never on the team.
    expect(baseSpeciesId('Floette-Mega')).toBe('floetteeternal')
    expect(baseSpeciesId('Greninja-Ash')).toBe('greninjabond')
    expect(baseSpeciesId('Mimikyu-Busted-Totem')).toBe('mimikyutotem')
  })

  it('resolves a forme with two possible origins against the registered team', () => {
    // Zygarde-Complete can be either Zygarde or Zygarde-10% transformed, and
    // only the team the side registered says which.
    expect(baseSpeciesId('Zygarde-Complete', ['zygarde10'])).toBe('zygarde10')
    expect(baseSpeciesId('Zygarde-Complete', ['zygarde'])).toBe('zygarde')
    expect(baseSpeciesId('Necrozma-Ultra', ['necrozmaduskmane'])).toBe('necrozmaduskmane')
  })

  it('falls back to the first origin when the registered team does not say', () => {
    expect(baseSpeciesId('Zygarde-Complete')).toBe('zygarde')
  })

  it('still undoes a Mega the generated table has never heard of', () => {
    // The table is generated, so it lags a Showdown release; the suffix is the
    // fallback that keeps a brand new Mega from counting twice.
    expect(baseSpeciesId('Klefki-Mega')).toBe('klefki')
  })

  it('leaves a formeless species alone', () => {
    expect(baseSpeciesId('Toxapex')).toBe('toxapex')
  })
})

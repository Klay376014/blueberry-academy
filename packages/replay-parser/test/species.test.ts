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

  it('keeps a regional forme, which is a different Pokémon', () => {
    expect(baseSpeciesId('Ninetales-Alola')).toBe('ninetalesalola')
  })

  it('leaves a formeless species alone', () => {
    expect(baseSpeciesId('Toxapex')).toBe('toxapex')
  })
})

import { describe, expect, it } from 'vitest'
import { findReplayLinks, parseReplayLink, replayUrl } from '../../app/shared/utils/replayLink'

describe('reading a pasted replay link', () => {
  it('takes the address straight out of the browser bar', () => {
    expect(
      parseReplayLink('https://replay.pokemonshowdown.com/gen9championsvgc2026regmb-2667169457'),
    ).toEqual({
      id: 'gen9championsvgc2026regmb-2667169457',
      password: null,
    })
  })

  it('takes a bare replay id, which is what the log itself calls the battle', () => {
    expect(parseReplayLink('gen9championsvgc2026regmb-2667169457')).toEqual({
      id: 'gen9championsvgc2026regmb-2667169457',
      password: null,
    })
  })

  it('splits the password off a private replay link', () => {
    // Showdown serves a private replay at <id>-<password>pw. The password is
    // part of the address, so pasting the address is how it arrives.
    expect(
      parseReplayLink('https://replay.pokemonshowdown.com/gen9vgc2026regj-2345678901-b1cd2efpw'),
    ).toEqual({
      id: 'gen9vgc2026regj-2345678901',
      password: 'b1cd2ef',
    })
  })

  it('keeps the hyphens inside a tournament replay id', () => {
    expect(parseReplayLink('https://replay.pokemonshowdown.com/smogtours-gen9ou-799535')).toEqual({
      id: 'smogtours-gen9ou-799535',
      password: null,
    })
  })

  it('ignores what Showdown hangs off the end of its own links', () => {
    // ?p2 flips the viewer's side, #turn-3 jumps into the battle. Neither has
    // anything to do with which replay this is.
    expect(parseReplayLink('https://replay.pokemonshowdown.com/gen9ou-2667293085?p2')?.id).toBe(
      'gen9ou-2667293085',
    )
    expect(parseReplayLink('https://replay.pokemonshowdown.com/gen9ou-2667293085#turn-3')?.id).toBe(
      'gen9ou-2667293085',
    )
    expect(parseReplayLink('  https://replay.pokemonshowdown.com/gen9ou-2667293085/  ')?.id).toBe(
      'gen9ou-2667293085',
    )
  })

  it('reads the id case-insensitively, the way Showdown resolves it', () => {
    expect(parseReplayLink('Gen9OU-2667293085')?.id).toBe('gen9ou-2667293085')
  })

  it('refuses what is not a replay link at all', () => {
    // Better a message about the link than a request to Showdown for
    // something that could never be a replay.
    expect(parseReplayLink('')).toBeNull()
    expect(parseReplayLink('gen9ou')).toBeNull()
    expect(parseReplayLink('https://pokemonshowdown.com/users/notlittlestar')).toBeNull()
    expect(parseReplayLink('what a nice battle')).toBeNull()
  })
})

describe('scanning pasted text for replay links', () => {
  it('picks the replay links out of a pasted chat log', () => {
    const log = [
      '[10:23:07] @NotLittleStar: gg! https://replay.pokemonshowdown.com/gen9vgc2026regj-2345678901',
      '[10:23:19] DavoPro1214: mine was 2026-09-11, check my profile',
      '[10:23:20] DavoPro1214: https://pokemonshowdown.com/users/notlittlestar',
      '[10:24:02] @NotLittleStar: game 2 (https://replay.pokemonshowdown.com/smogtours-gen9ou-799535)',
    ].join('\n')

    expect(findReplayLinks(log)).toEqual([
      { id: 'gen9vgc2026regj-2345678901', password: null },
      { id: 'smogtours-gen9ou-799535', password: null },
    ])
  })

  it('keeps the password of a private replay beside its id', () => {
    expect(
      findReplayLinks(
        'here: https://replay.pokemonshowdown.com/gen9vgc2026regj-2345678901-b1cd2efpw thanks',
      ),
    ).toEqual([{ id: 'gen9vgc2026regj-2345678901', password: 'b1cd2ef' }])
  })

  it('names a replay once however often the text names it', () => {
    const pasted = [
      'https://replay.pokemonshowdown.com/gen9ou-2667293085',
      'https://replay.pokemonshowdown.com/gen9ou-2667293085?p2',
      'gen9ou-2667293085',
    ].join('\n')

    expect(findReplayLinks(pasted)).toEqual([{ id: 'gen9ou-2667293085', password: null }])
  })

  it('takes a bare replay id, the way a list of them is pasted', () => {
    expect(findReplayLinks('gen9ou-2667293085\nsmogtours-gen9ou-799535')).toEqual([
      { id: 'gen9ou-2667293085', password: null },
      { id: 'smogtours-gen9ou-799535', password: null },
    ])
  })

  it('reads no replay out of an address that is not a Showdown replay', () => {
    // The id grammar alone would read the last segment of any address as a
    // replay, and a forum thread is not one.
    expect(findReplayLinks('https://smogon.com/forums/threads/vgc-2026-12345')).toEqual([])
    expect(findReplayLinks('https://example.com/gen9ou-2667293085')).toEqual([])
  })

  it('reads no replay out of a date, which every chat log is full of', () => {
    // `2026-09-11` satisfies the id grammar on its own; a replay id never
    // goes without a letter.
    expect(findReplayLinks('2026-09-11 12-34 played 3 games')).toEqual([])
  })

  it('finds nothing in text that names no replay', () => {
    expect(findReplayLinks('what a nice battle')).toEqual([])
    expect(findReplayLinks('')).toEqual([])
  })
})

describe('linking back to Showdown', () => {
  it('addresses the replay itself, without the password of a private one', () => {
    // The drawer's one outbound link. A password in a shareable page would be
    // handed out with it, and the reader already has the battle.
    expect(replayUrl('gen9championsvgc2026regmb-2667169457')).toBe(
      'https://replay.pokemonshowdown.com/gen9championsvgc2026regmb-2667169457',
    )
  })
})

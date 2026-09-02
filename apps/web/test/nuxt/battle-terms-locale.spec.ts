import { describe, expect, it } from 'vitest'
import { Dex } from '@pkmn/dex'
import {
  abilityDisplayName,
  effectDisplayName,
  fieldConditionDisplayName,
  itemDisplayName,
  sourceDisplayName,
  statDisplayName,
  teraTypeDisplayName,
} from '../../app/shared/utils/battleTerms'
import { moveDisplayName } from '../../app/shared/utils/moveName'
import abilityNames from '../../app/shared/lib/dex/ability-names-zh-hant.json'
import itemNames from '../../app/shared/lib/dex/item-names-zh-hant.json'
import weatherNames from '../../app/shared/lib/dex/weather-names-zh-hant.json'
import statNames from '../../app/shared/lib/dex/stat-names-zh-hant.json'
import typeNames from '../../app/shared/lib/dex/type-names-zh-hant.json'
import en from '../../i18n/locales/en.json'
import zhTW from '../../i18n/locales/zh-TW.json'

/**
 * The lookup seams the rest of the battle vocabulary goes through, and the
 * shape of the four tables behind them. What the timeline does with them is
 * `app/features/timeline/test/localised-names.spec.ts`; whether they reach the
 * identifiers real logs put on screen is
 * `app/features/timeline/test/name-coverage.spec.ts`.
 *
 * See docs/adr/0016-localised-battle-vocabulary.md.
 */

describe('abilityDisplayName', () => {
  const OFFICIAL = {
    Regenerator: '再生力',
    'Supreme Overlord': '大將',
    'Toxic Debris': '毒滿地',
    Protosynthesis: '古代活性',
    // Showdown splits one official ability into two ids and the log sends
    // neither of them: measured, `|-ability|…|As One` 245 times over 1803
    // replays, and `asone` is not an id the dex has. The table is keyed off
    // the sources rather than off the dex so this one is reachable.
    'As One': '人馬一體',
    // The bracketed forms are Showdown's own, filling ids PokéAPI's single
    // `embody-aspect` row cannot reach.
    'Embody Aspect (Hearthflame)': '面影輝映（火灶）',
  }

  for (const [name, chinese] of Object.entries(OFFICIAL)) {
    it(`shows ${name} as ${chinese} in zh-TW`, () => {
      expect(abilityDisplayName(name, 'zh-TW')).toBe(chinese)
    })
  }

  it('leaves en on the English name the log itself carries', () => {
    for (const name of Object.keys(OFFICIAL)) expect(abilityDisplayName(name, 'en')).toBe(name)
  })

  it('reads English for a locale that has no table', () => {
    expect(abilityDisplayName('Regenerator', 'ja')).toBe('Regenerator')
  })

  it('gives back anything it does not know, rather than nothing', () => {
    expect(abilityDisplayName('notanability', 'zh-TW')).toBe('notanability')
  })
})

describe('itemDisplayName', () => {
  const OFFICIAL = {
    'Life Orb': '生命寶珠',
    Leftovers: '吃剩的東西',
    'Sitrus Berry': '文柚果',
    'Booster Energy': '驅勁能量',
    // PokéAPI's `identifier` column is `pretty-wing` where its own English
    // name is `Pretty Feather`, and the log sends the name. The join goes
    // through the English name for exactly this row's sake.
    'Pretty Feather': '美麗之羽',
  }

  for (const [name, chinese] of Object.entries(OFFICIAL)) {
    it(`shows ${name} as ${chinese} in zh-TW`, () => {
      expect(itemDisplayName(name, 'zh-TW')).toBe(chinese)
    })
  }

  it('leaves en on the English name the log itself carries', () => {
    for (const name of Object.keys(OFFICIAL)) expect(itemDisplayName(name, 'en')).toBe(name)
  })

  it('falls back to English for a Mega stone no source has a name for', () => {
    // Measured, `Staraptite` and `Glimmoranite` reach the screen and neither
    // PokéAPI nor Showdown names them. English, not a guess.
    expect(itemDisplayName('Staraptite', 'zh-TW')).toBe('Staraptite')
  })
})

describe('statDisplayName and teraTypeDisplayName', () => {
  it('says the stat a boost line named in Chinese', () => {
    expect(statDisplayName('atk', 'zh-TW')).toBe('攻擊')
    expect(statDisplayName('spa', 'zh-TW')).toBe('特攻')
    expect(statDisplayName('accuracy', 'zh-TW')).toBe('命中率')
  })

  it('says the type a Tera line named in Chinese, Stellar included', () => {
    expect(teraTypeDisplayName('Fire', 'zh-TW')).toBe('火')
    expect(teraTypeDisplayName('Stellar', 'zh-TW')).toBe('星晶')
    expect(teraTypeDisplayName('Psychic', 'zh-TW')).toBe('超能力')
  })

  it('leaves both alone in en', () => {
    expect(statDisplayName('atk', 'en')).toBe('atk')
    expect(teraTypeDisplayName('Fire', 'en')).toBe('Fire')
  })

  it('gives back an unknown code rather than nothing', () => {
    expect(statDisplayName('nope', 'zh-TW')).toBe('nope')
    expect(teraTypeDisplayName('Nope', 'zh-TW')).toBe('Nope')
  })

  it('leaves a status code alone, because no source has a name for one', () => {
    // Not an omission. Showdown's own `StatusNames` are eight nulls, PokéAPI's
    // `move_meta_ailment_names.csv` has no zh-Hant row at all, and the games
    // say `{POKEMON}被灼傷了！` rather than naming the state. Inventing 灼傷
    // here is the one thing ADR-0014 exists to refuse.
    for (const code of ['brn', 'par', 'slp', 'frz', 'psn', 'tox']) {
      expect(statDisplayName(code, 'zh-TW')).toBe(code)
      expect(teraTypeDisplayName(code, 'zh-TW')).toBe(code)
    }
  })
})

describe('effectDisplayName, the move -> ability chain', () => {
  it('says an effect string that is a move name in Chinese', () => {
    expect(effectDisplayName('Stealth Rock', 'zh-TW')).toBe('隱形岩')
    expect(effectDisplayName('Wide Guard', 'zh-TW')).toBe('廣域防守')
  })

  it('reaches the ability table for a name the move table has no row for', () => {
    // The second link. These are the two #102 had to whitelist: they arrive on
    // a `blocked by` row as `|-activate|…|ability: Supreme Overlord`.
    expect(effectDisplayName('Supreme Overlord', 'zh-TW')).toBe('大將')
    expect(effectDisplayName('Toxic Debris', 'zh-TW')).toBe('毒滿地')
    expect(effectDisplayName('Protosynthesis', 'zh-TW')).toBe('古代活性')
  })

  it('prefers the move when the dex knows the name only as a move', () => {
    // The chain's order matters only where both halves have the id, and
    // measured over the dex they never do -- no ability id is also a move id.
    // So this asserts the order is not accidentally reversed.
    expect(effectDisplayName('Substitute', 'zh-TW')).toBe('替身')
    expect(effectDisplayName('Taunt', 'zh-TW')).toBe('挑釁')
  })

  it('leaves a bare name a move and a condition are both called', () => {
    expect(effectDisplayName('confusion', 'zh-TW')).toBe('confusion')
  })

  it('leaves en on the English string in every case', () => {
    for (const name of ['Stealth Rock', 'Supreme Overlord', 'confusion', 'Protosynthesis']) {
      expect(effectDisplayName(name, 'en')).toBe(name)
    }
  })
})

describe('fieldConditionDisplayName, the link only a field condition reaches', () => {
  it("says the weather's own state name, which is not the move's", () => {
    // The case that only the hand-written head of the chain can answer. Both
    // strings are official and they are different words: the state 下雪
    // against the move 雪景, the state 下雨 against the move 求雨. The move
    // table alone would put the wrong official string on screen, and the
    // ambiguity guard leaves it in English instead.
    expect(fieldConditionDisplayName('Snowscape', 'zh-TW')).toBe('下雪')
    expect(fieldConditionDisplayName('RainDance', 'zh-TW')).toBe('下雨')
    expect(fieldConditionDisplayName('SunnyDay', 'zh-TW')).toBe('大晴天')
    expect(moveDisplayName('Snowscape', 'zh-TW')).toBe('雪景')
    expect(effectDisplayName('Snowscape', 'zh-TW')).toBe('Snowscape')
  })

  it('falls through to the move table for a field effect that is a move', () => {
    // Terrains, rooms and screens have no name of their own anywhere upstream
    // -- Showdown's `default.ts` gives them sentences and no name field -- so
    // the move name is the only official string there is, and it is the right
    // one.
    expect(fieldConditionDisplayName('Trick Room', 'zh-TW')).toBe('戲法空間')
    expect(fieldConditionDisplayName('Psychic Terrain', 'zh-TW')).toBe('精神場地')
    expect(fieldConditionDisplayName('Reflect', 'zh-TW')).toBe('反射壁')
    expect(fieldConditionDisplayName('Light Screen', 'zh-TW')).toBe('光牆')
    expect(fieldConditionDisplayName('Tailwind', 'zh-TW')).toBe('順風')
  })

  it('leaves en untouched', () => {
    for (const name of ['Snowscape', 'Trick Room', 'Reflect', 'none']) {
      expect(fieldConditionDisplayName(name, 'en')).toBe(name)
    }
  })

  it('gives back a protocol value that is nobody’s name', () => {
    // `none` is the weather being cleared. It is copy rather than a name, so
    // it is a locale string on the row and never a table entry here.
    expect(fieldConditionDisplayName('none', 'zh-TW')).toBe('none')
  })
})

describe('sourceDisplayName, what a [from] said caused a change', () => {
  it('says a namespaced source under the reader’s name for it', () => {
    expect(sourceDisplayName('ability: Regenerator', 'zh-TW')).toBe('再生力')
    expect(sourceDisplayName('item: Life Orb', 'zh-TW')).toBe('生命寶珠')
    expect(sourceDisplayName('move: Knock Off', 'zh-TW')).toBe('拍落')
  })

  it('reads a bare source as the condition it is', () => {
    // Measured over 1803 replays: of the 28 distinct bare `[from]` values the
    // two ambiguous ones are `Sandstorm` (weather damage, 869 times) and
    // `confusion`. Neither is ever a move being used, so a bare source goes
    // through the field-condition head of the chain.
    expect(sourceDisplayName('Sandstorm', 'zh-TW')).toBe('沙暴')
    expect(sourceDisplayName('Grassy Terrain', 'zh-TW')).toBe('青草場地')
    expect(sourceDisplayName('U-turn', 'zh-TW')).toBe('急速折返')
  })

  it('says the Pokémon a source named under the reader’s name for it', () => {
    // Measured, `[from] pokemon: Mimikyu-Busted` -- the one source whose
    // namespace is a species. ADR-0014's table already answers for it.
    expect(sourceDisplayName('pokemon: Pikachu', 'zh-TW')).toBe('皮卡丘')
  })

  it('keeps the whole string, namespace included, when nothing names it', () => {
    // The en output has to be byte-identical to what it was, and the prefix is
    // part of it. A zh-TW reader whose source has no name gets the same thing
    // rather than a half-stripped string.
    expect(sourceDisplayName('ability: Regenerator', 'en')).toBe('ability: Regenerator')
    expect(sourceDisplayName('item: Life Orb', 'en')).toBe('item: Life Orb')
    expect(sourceDisplayName('brn', 'en')).toBe('brn')
    expect(sourceDisplayName('brn', 'zh-TW')).toBe('brn')
    expect(sourceDisplayName('item: Staraptite', 'zh-TW')).toBe('item: Staraptite')
    expect(sourceDisplayName('recoil', 'zh-TW')).toBe('recoil')
  })
})

describe('the generated zh-Hant tables', () => {
  const TABLES = {
    'ability-names-zh-hant.json': abilityNames as Record<string, string>,
    'item-names-zh-hant.json': itemNames as Record<string, string>,
    'weather-names-zh-hant.json': weatherNames as Record<string, string>,
    'stat-names-zh-hant.json': statNames as Record<string, string>,
    'type-names-zh-hant.json': typeNames as Record<string, string>,
  }

  for (const [file, table] of Object.entries(TABLES)) {
    const entries = Object.entries(table)

    it(`${file} is a flat object keyed by Showdown id`, () => {
      expect(entries.length).toBeGreaterThan(0)
      for (const [id, name] of entries) {
        expect(id).toMatch(/^[a-z0-9]+$/)
        expect(typeof name).toBe('string')
        expect(name.length).toBeGreaterThan(0)
      }
    })

    it(`${file} is sorted by id, so a source update reads as a diff`, () => {
      const ids = entries.map(([id]) => id)
      expect(ids).toEqual([...ids].sort())
    })

    it(`${file} spells names composed, the form a keyboard produces`, () => {
      for (const [id, name] of entries) expect(name, id).toBe(name.normalize('NFC'))
    })
  }

  it('names every ability a gen 9 battle can contain', () => {
    const missing = [
      ...new Map(
        Dex.forGen(9)
          .abilities.all()
          .filter((ability) => ability.exists && ability.num > 0 && !ability.isNonstandard)
          .map((ability) => [ability.id, ability]),
      ).values(),
    ]
      .filter((ability) => !(ability.id in abilityNames))
      .map((ability) => ability.name)

    expect(missing).toEqual([])
  })

  it('names every item a gen 9 battle can contain', () => {
    const missing = [
      ...new Map(
        Dex.forGen(9)
          .items.all()
          .filter((item) => item.exists && item.num > 0 && !item.isNonstandard)
          .map((item) => [item.id, item]),
      ).values(),
    ]
      .filter((item) => !(item.id in itemNames))
      .map((item) => item.name)

    expect(missing).toEqual([])
  })

  it('names every weather Showdown can put on the field', () => {
    // The eight the game has. A ninth arriving with no name would show the
    // move's name instead, which is a different official string.
    expect(Object.keys(weatherNames)).toEqual([
      'deltastream',
      'desolateland',
      'hail',
      'primordialsea',
      'raindance',
      'sandstorm',
      'snowscape',
      'sunnyday',
    ])
  })

  it('names every stat a boost line can name, and every type a Tera line can', () => {
    for (const stat of ['atk', 'def', 'spa', 'spd', 'spe', 'accuracy', 'evasion']) {
      expect(statNames, stat).toHaveProperty(stat)
    }
    for (const type of [...Dex.types.all().map((type) => type.id), 'stellar']) {
      expect(typeNames, type).toHaveProperty(type)
    }
  })

  it('holds no English name in the ability or item table', () => {
    // A row that came out as `Regenerator` would mean the generator matched
    // the English column, and the fallback would never fire for it.
    for (const [id, name] of Object.entries(abilityNames as Record<string, string>)) {
      expect(name, id).not.toBe(Dex.abilities.get(id).name)
    }
    for (const [id, name] of Object.entries(itemNames as Record<string, string>)) {
      expect(name, id).not.toBe(Dex.items.get(id).name)
    }
  })

  it('keeps the generated vocabulary out of the i18n locales', () => {
    // The line ADR-0014 draws, restated for this ticket's tables: machine
    // generated names do not go into the files a person proofreads sentence by
    // sentence. What does belong there is the copy for the protocol values no
    // source has a name for, which is why `無` is expected to be in them.
    const locales = JSON.stringify([en, zhTW])
    for (const name of ['再生力', '生命寶珠', '古代活性', '大將', '下雪', '星晶', '攻擊']) {
      expect(locales, name).not.toContain(name)
    }
  })
})

# zh-Hant 名稱資料來源調查 — 研究筆記

- 日期：2026-09-02
- 狀態：調查完成，供 #102 / #103 決策；**這不是決定紀錄**，決定屬於 #102 / #103 的 ADR
- 相關：[ADR-0014](../adr/0014-localised-species-names.md)（#101，PR #105，尚未進 `main`）、
  #102（招式名）、#103（特性 / 道具 / 場上狀況 / 狀態）
- 放這裡的理由：這既不是設計文件（沒有要蓋的東西），也不是決定紀錄。它是**外部資料的實測
  結果** —— AGENTS.md 實作守則第一條所說「程式碼與測試讀不出來的事」中的第二類，而
  `docs/specs/` 是本 repo 唯一收「日期 + 論述」的地方。檔名用 `-research` 與設計文件區隔。

所有數字都是跑出來的，方法附在各節與附錄。所有中文名稱都是從來源檔案原樣讀出的字串，
**本文件沒有任何一個字是自行翻譯、轉換或推測的**。

---

## 0. 五行結論

1. **招式 / 特性 / 道具在第九世代是 100%。** ADR-0014「PokéAPI 的繁中資料停在第八世代」
   這句話只對**型態名**成立，對招式 / 特性 / 道具**不成立**。#102 / #103 的資料缺口是零。
2. **出現了 ADR-0014 寫作時還不存在的來源：Showdown 上游自己的 `data/text/zh-tw/`**，
   2026-08-23 才進 master。用 `toID()` 當 key、MIT 授權、與 PokéAPI 繁中逐字節相同
   （重疊 1698 筆，0 筆分歧）。它讓「join」這件事整個消失。
3. **已 commit 的物種表有 2 筆是錯的**：`Espathra` = `超能艷鴕`（官方是 `超能豔鴕`）、
   `Kingambit` = `仆刀將軍`（官方是 `仆斬將軍`）。錯誤來自 PokéAPI，Showdown 也一起錯。
   這是 ADR-0014 立志拒絕的失敗模式**經由它信任的來源進來**。
4. **有 24 筆型態名是 join 沒接上，不是資料沒有** —— 包含 ADR-0014 明文列為「已知缺口」的
   `Ogerpon-*` 面具、`Indeedee-F`、`Necrozma-Dusk-Mane`。
5. **狀態代碼（`brn` / `par` / …）真的沒有來源。** 官方只有句子沒有名詞，連 Showdown 自己都
   把 `StatusNames` 全部留 `null`。ADR-0014 不翻它們是對的，現在有第一手證據。

---

## 1. 驗證 ADR-0014 的既有數字

先獨立重跑，不採信。

```
$ git show feat/101-localised-species-names:apps/web/app/shared/lib/dex/species-names-zh-hant.json > /tmp/committed-zh.json
$ node _species.mjs        # 讀 @pkmn/dex 全部 species，比對已 commit 的表
committed entries: 1197 | Showdown species: 1417 | missing: 220
Gen 9 legal species: 911 missing zh: 107
missing by species gen: { '4': 19, '5': 7, '6': 28, '7': 26, '8': 68, '9': 72 }
```

**1197 / 1417 / 220 三個數字都成立**，ADR-0014 列的 VGC 缺口清單也全部成立。

### 但「停在第八世代」的診斷是錯的

`pokemon_form_names.csv` 的繁中列**不是按世代斷掉，是按批次斷掉**。逐 `pokemon_form_id`
掃出來：

| form id 區間                 | 內容                                                                                                                                                                            | 繁中   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| … – 10363                    | 到劍盾 DLC（`calyrex-ice`、`urshifu-rapid-strike`、`indeedee-female`）                                                                                                          | **有** |
| 10364 – 10399                | 超極巨化（`*-gmax`）、Totem                                                                                                                                                     | 無     |
| 10400 – 10440                | 洗翠 / 帕底亞那一批（`*-hisui`、`tauros-paldea-*`、`palafin-hero`、`enamorus-therian`、`tatsugiri-droopy`、`maushold-family-of-three`、`basculegion-female`、`dialga-origin`…） | **無** |
| 10441 – 10444, 10447 – 10448 | 碧之假面 DLC（`ursaluna-bloodmoon`、`ogerpon-*-mask`、`poltchageist-artisan`、`sinistcha-masterpiece`）                                                                         | **有** |
| 10445 – 10446                | `terapagos-terastal` / `terapagos-stellar`（藍之圓盤）                                                                                                                          | 無     |
| 10449 – 10550                | Alcremie 裝飾組合，以及一批**非官方**的 `*-mega`（見 §2.4）                                                                                                                     | 無     |
| 10551 – 10553                | `pyroar-female`、`frillish-female`、`jellicent-female`                                                                                                                          | **有** |

第九世代的型態**不是全缺**：碧之假面那一批（含 VGC 最在意的三個面具）一直都在。

### 24 筆是 join 沒接上

`gen-species-names-zh-hant.mjs` 用 `toId(pokemon_forms.identifier)` 當 join key，
而 PokéAPI 的 `identifier` 與 Showdown 的 forme 拼法不一致，所以**明明有的官方字串被丟掉**。

改用 PokéAPI 自己的英文 forme 名（`local_language_id=9` 的 `form_name`）對 Showdown 的
`s.forme` 做 toID 比對，取完全相等或前綴相符：

```
$ node _recover2.mjs
EXACT English-forme-name match (2, 2 gen-9-legal):
  Necrozma-Dusk-Mane  <- en "Dusk Mane"  / zh "黃昏之鬃"
  Necrozma-Dawn-Wings <- en "Dawn Wings" / zh "拂曉之翼"

PREFIX match (22, 21 gen-9-legal):
  Ogerpon-Wellspring  <- en "Wellspring Mask"  / zh "水井面具"
  Ogerpon-Hearthflame <- en "Hearthflame Mask" / zh "火灶面具"
  Ogerpon-Cornerstone <- en "Cornerstone Mask" / zh "礎石面具"
  Indeedee-F / Meowstic-F <- en "Female" / zh "雌性的樣子"
  Minior-Meteor <- en "Meteor Form" / zh "流星的樣子"
  Pikachu-{Original,Hoenn,Sinnoh,Unova,Kalos,Alola,Partner,World} <- en "* Cap" / zh "*帽子"
  Alcremie-{Ruby-Cream,Matcha-Cream,Mint-Cream,Lemon-Cream,Ruby-Swirl,Caramel-Swirl,Rainbow-Swirl}
  Darmanitan-Galar <- en "Galarian Form" / zh "伽勒爾的樣子"
```

`ogerpon-wellspring-mask` → `ogerponwellspringmask`，Showdown 是 `ogerponwellspring`；
`indeedee-female` → `indeedeefemale`，Showdown 是 `indeedeef`；`necrozma-dusk` →
`necrozmadusk`，Showdown 是 `necrozmaduskmane`。**ADR-0014「哪天官方資料補上，重跑產生器
就補上了」這句話的前提是錯的 —— 資料本來就在，是產生器接不到。**

同一個病也在招式 / 特性 / 道具上，見 §2.3。

---

## 2. PokéAPI

- `https://github.com/PokeAPI/pokeapi`，`data/v2/csv/`
- REST：`https://pokeapi.co/api/v2/`（例：`/pokemon-form/10442/` 的 `form_names` 帶 `zh-hant`）

### 2.1 定位：官方字串，社群搬運

`languages.csv` 第 4 列，**`official` 欄位是 1**：

```
$ curl -s .../data/v2/csv/languages.csv
id,iso639,iso3166,identifier,official,order
4,zh,tw,zh-hant,1,5
12,zh,cn,zh-hans,1,6
```

但搬運管道是社群 PR，**沒有逐列驗證，也沒有任何文件說明譯名怎麼來的**。
`move_names.csv` 的 commit 歷史就是一串社群貢獻。所以正確的描述是
**「官方字串，社群搬運，品質靠 PR review」** —— 不是「官方資料集」。

### 2.2 內容

`local_language_id = 4` 的列數（`awk -F, 'NR>1&&$2==4{c++}'`，master @ 2026-09-02）：

| 表                            | 繁中  | 英文 |
| ----------------------------- | ----- | ---- |
| `pokemon_species_names.csv`   | 1025  | 1025 |
| `pokemon_form_names.csv`      | 255   | 584  |
| `move_names.csv`              | 919   | 937  |
| `ability_names.csv`           | 311   | 373  |
| `item_names.csv`              | 2127  | 2176 |
| `type_names.csv`              | 21    | 21   |
| `stat_names.csv`              | 8     | 8    |
| `move_meta_ailment_names.csv` | **0** | 23   |

招式缺的 18 筆全是《寶可夢 XD》的「暗影」招式（`shadow-rush` …，本傳沒有）。
特性缺的 62 筆裡 60 筆是 `is_main_series=0`（《信長之野望》），本傳只缺 2 筆未實裝的。
道具缺的是第二／三世代的信件與 FRLG 關鍵道具，加上 §2.4 那批非官方 mega 石。

```
$ node gen.mjs
== move: total 937, zh-hant 919 —— gen 1..9 每代 0 缺，除 gen 3 的 18 筆（全 shadow-*）
== ability: total 373, zh-hant 311 —— main-series 313 筆中缺 2（eelevate、fire-mane，未實裝）
```

**`move_meta_ailment_names.csv` 一筆繁中都沒有** —— `brn` / `par` / `slp` 這類狀態，
PokéAPI 給不出繁中名。見 §7。

### 2.3 覆蓋率：join key 改對之後是 100%

PokéAPI 的 `identifier` 欄位**與它自己的英文 `name` 欄位不同步**：

```
$ grep -E '^11,' moves.csv     → 11,vice-grip,…      （英文 name 是 "Vise Grip"）
$ grep 'pretty-wing' items.csv → 612,pretty-wing,…   （英文 name 是 "Pretty Feather"）
```

改成 join **PokéAPI 自己的英文 `name`（`local_language_id=9`）→ NFD 去音標 → `toID()`**
（`Poké Ball` → `pokeball`），對 `@pkmn/dex` 的 `Dex.forGen(9)` 實測：

```
$ node _cover3.mjs
Gen 9 moves:     685/685
Gen 9 abilities: 304/310; missing: asoneglastrier, asonespectrier,
                 embodyaspect{cornerstone,hearthflame,teal,wellspring}
Gen 9 items:     249/249
```

那 6 筆不是資料缺，是 Showdown 把兩個官方特性各自拆成多個 id：PokéAPI 有
`as-one` = `人馬一體`、`embody-aspect` = `面影輝映`（各一筆）。

**場上狀況全部命中招式表**，只有兩個字串沒有，而它們不是名字：

```
trickroom 戲法空間  magicroom 魔法空間  wonderroom 奇妙空間  gravity 重力
electricterrain 電氣場地  grassyterrain 青草場地  mistyterrain 薄霧場地  psychicterrain 精神場地
tailwind 順風  reflect 反射壁  lightscreen 光牆  auroraveil 極光幕  safeguard 神秘守護
mist 白霧  luckychant 幸運咒語  stealthrock 隱形岩  spikes 撒菱  toxicspikes 毒菱
stickyweb 黏黏網  raindance 求雨  sunnyday 大晴天  sandstorm 沙暴  snowscape 雪景  hail 冰雹
desolateland 終結之地  primordialsea 始源之海  deltastream 德爾塔氣流      → 27/29
none → 無 ；snow → 無（第九世代 Showdown 送的是 Snowscape，不是 Snow）
```

太晶屬性與能力值也齊：`type_names.csv` 18 屬性 + `stellar` = `星晶`；`stat_names.csv` 的
`攻擊 / 防禦 / 特攻 / 特防 / 速度 / 命中 / 閃避`。**#103 打算手寫在 locale 檔的太晶屬性與
能力變化，其實有官方字串可查。**

**fixture 實測**（方法：走 `packages/replay-parser/test/fixtures/` 七份真實 log，抽出
`|move|`、`-ability`、`-item`／`-enditem`、`-weather`、`-sidestart`／`-sideend`、
`-fieldstart`／`-fieldend`、`-status`、`-activate`／`-start`／`-end`／`-singleturn`、
以及所有 `[from]` 的值，剝掉 `move:`／`ability:`／`item:` 前綴後正規化）：

```
$ node _fx.mjs
fixture display identifiers: 86/92 named by the move->ability->item chain
uncovered (6): brn drain fallen5 none psn recoil
```

**92 個畫面上會出現的識別字，86 個有官方繁中名。** 剩下 6 個沒有一個是名字。
#103 猜「真正需要手寫的只有 `none` 這類非招式的值」—— 實測是對的，清單就這 6 個。

### 2.4 混有非官方條目

`pokemon_forms.csv` 有 `baxcalibur-mega`、`raichu-mega-x`、`clefable-mega` 等遊戲裡
不存在的型態，`items.csv` 也有對應的 `baxcalibrite`、`clefablite`。它們在正式 API 上是活的：

```
$ curl -s https://pokeapi.co/api/v2/pokemon-form/10550/ | head -c 110
{"id":10550,"name":"baxcalibur-mega",…,"is_mega":true,"form_name":"mega",…

$ curl -s https://pokeapi.co/api/v2/item/baxcalibrite/
{"id":2275,"name":"baxcalibrite",…,"category":{"name":"mega-stones",…},…,"names":[],…
```

**危害有限**（`"names":[]`，任何語言都沒名字，查不到自然退回英文），但它證明
**PokéAPI 的資料集不等於官方資料集**。

### 2.5 曾經混有簡體 —— 而且錯誤的形狀有兩種

**（a）字形污染，2026-08-25 修掉了。** PokéAPI PR #1648
（<https://github.com/PokeAPI/pokeapi/pull/1648>，作者是 Showdown 的 Zarel）的說明原文：

> Hi! Pokémon Showdown is in the process of adding support for other languages. We were
> originally going to use PokéAPI to source species/move/ability/item names, but PokéAPI
> seems to be missing a few, so we're sourcing them from
> https://github.com/abcboy101/poke-corpus instead.
>
> **In addition to the missing ones, you also seem to be using a mixture of Simplified and
> Traditional Chinese in your Traditional Chinese translation, which I also corrected for you.**

實測驗證。判準用**第一手資料**：Unicode UCD 17.0 的 `Unihan_Variants.txt`
（<https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip>），凡 `kTraditionalVariant`
指向自身以外字元者即為簡化字（共 6044 個）。

```
$ node _hans2.mjs pre     # PR #1648 併入前，sha 890ea227
move_names.csv:            34/915  繁中列含簡化字 → 力量转换 阳春风暴 大愤慨 叶绿爆震 太晶爆发 …
item_names.csv:           281/1996                → 大金刚宝玉 净空石板 奇异球 驱劲能量 特性护具 …
pokemon_species_names.csv:  2/1025                → 铁磐岩（Iron Boulder）铁头壳（Iron Crown）
ability_names.csv:          0/311
pokemon_form_names.csv:     0/255

$ node _hans2.mjs         # 現在的 master —— 五個表都是 0 筆
```

若 #101 早一週產生表，`ironboulder` 與 `ironcrown` 就會是簡體出貨。實測已 commit 的表是
乾淨的（`鐵磐岩` / `鐵頭殼`）—— **乾淨是因為時間差，不是因為有防線。**

**（b）字彙污染，還在，而且 Unihan 抓不到。** 見 §3 —— 這是本次調查最重要的發現。

### 2.6 授權

`LICENSE.md`，BSD-3-Clause：

> Copyright (c) © 2013–2023 Paul Hallett and PokéAPI contributors
> (https://github.com/PokeAPI/pokeapi#contributing). Pokémon and Pokémon character names are
> trademarks of Nintendo.
>
> All rights reserved.
>
> Redistribution and use in source and binary forms, with or without modification, are
> permitted provided that the following conditions are met:
>
> - Redistributions of source code must retain the above copyright notice, this list of
>   conditions and the following disclaimer.
> - Redistributions in binary form must reproduce the above copyright notice, this list of
>   conditions and the following disclaimer in the documentation and/or other materials
>   provided with the distribution.
> - Neither the name of PokéAPI nor the names of its contributors may be used to endorse or
>   promote products derived from this software without specific prior written permission.

**可以把衍生表 commit 進本 repo**，條件是保留著作權聲明。現行
`gen-species-names-zh-hant.mjs` 檔頭有連結但**沒有保留這段聲明**，值得補。

### 2.7 機器可讀性與穩定性

- 固定路徑：`https://raw.githubusercontent.com/PokeAPI/pokeapi/<ref>/data/v2/csv/<file>`
- **有版本**：tag（最近 `2.9.0`，2025-01-31）與 sha 都能直接抓。實測
  `2.9.0` 是 915 筆招式、`master` 是 919 筆 —— **master 會動**，而現行產生器抓的正是
  `master`。這正是 §2.5(a) 那個時間差之所以是運氣的原因。
- Key：`identifier` slug，**不能直接當 `toID()` 用**（§2.3）。型態要 join 得靠
  `pokemon.csv` 的 `pokemon_id → species_id` 接國家圖鑑編號 + forme 描述，這段是有損的。

---

## 3. 官方台灣寶可夢圖鑑 —— 唯一的權威，也是唯一抓得到字彙錯誤的東西

- `https://tw.portal-pokemon.com/play/pokedex`

它是 Next.js App Router，**沒有 JSON API**（`/play/pokedex/api/v1/*` 一律 308 → 404），
但資料就嵌在頁面 HTML 的 React Server Component payload（`self.__next_f.push(...)`）裡，
一次 fetch 就拿得到，regex 就解得開。`robots.txt` 只 disallow `/images/` 與
`/_next/static/media/`，圖鑑頁本身可以抓。

```
$ curl -sSL -o tw_pokedex.html https://tw.portal-pokemon.com/play/pokedex   # 543,592 bytes
$ node _oracle.mjs
official TW portal: 1025 base-species names (zukan_sub_id 0)
```

記錄的形狀（原文）：

```json
{"zukan_id":"0001","zukan_sub_id":0,"pokemon_name":"妙蛙種子","pokemon_type_name":"草,毒"}
{"pokemon_ability_id":"adaptability","pokemon_ability_name":"適應力"}
```

內容：**1025 隻基礎 species + 281 個特性 + 18 個屬性。招式與道具沒有。**
特性的 key 是英文名小寫（`air lock`、`teraform zero`），join 得很乾淨。

### 3.1 已 commit 的物種表有 2 筆是錯的

```
$ node _oracle.mjs
PokeAPI zh-Hant vs official portal, base species: 1023 identical, 2 differ
  #956 PokeAPI="超能艷鴕" official="超能豔鴕"
  #983 PokeAPI="仆刀將軍" official="仆斬將軍"

ADR-0014 committed table vs official portal (base species only): 2 wrong
  Espathra  table="超能艷鴕" official="超能豔鴕"
  Kingambit table="仆刀將軍" official="仆斬將軍"
```

Showdown 上游也一起錯（它的名稱來自 PokéAPI，見 §4.3）：

```
$ grep -A2 -E '^\t(espathra|kingambit): \{' zh-tw-pokedex.ts
	espathra:  { name: "超能艷鴕", },
	kingambit: { name: "仆刀將軍", },
```

**這兩筆的意義遠大於兩筆。** `仆刀將軍` 是**簡體版的官方名（仆刀将军）換成繁體字形**；
`艷` 是 `艳` 的標準繁體字形，而台灣官方用的是 `豔`。也就是說：

**PokéAPI 的繁中欄位裡還殘留著簡繁「用字轉換」的產物，而 §2.5 的 Unihan 檢查抓不到它們
—— 因為它們每一個字都是合法的繁體字。** ADR-0014 寫「用字轉換不等於譯名轉換」時，指的是
不要自己去轉；實測顯示**上游已經替我們轉過了一部分，而且它們現在正在畫面上。**

Unihan 檢查抓字形污染，官方圖鑑抓字彙污染。**兩者都需要，而且只有後者是權威。**

### 3.2 授權：可以當驗證器，不可以當資料來源

`https://tw.portal-pokemon.com/termofuse/` 第 1 條原文：

> **1. 版權標示**
> 本網站上的所有內容資料（“資料”）的版權和許可權均屬於寶可夢公司（“本公司”），包括設計、
> 照片、圖像、文字、音樂和錄音。資料僅供個人享用，版權不得轉讓。在任何情況下，您不可以
> 拷貝、複製、修改、刊登、發佈、傳輸或散佈本網站的資料。此外，這些資料不得在其他公共
> 網絡上使用，例如網際網路。

**明文禁止拷貝、複製、修改、刊登、發佈、散佈。** 所以它不能當資料來源，
**但可以當測試用的驗證器** —— 一條「表裡的基礎 species 名與官方圖鑑逐字相符」的測試
不會把它的資料 commit 進來，只會在不符時紅燈。這個區別很重要：本 repo 要的是「不要出錯」，
而不是「多一份資料」。

香港站（`https://hk.portal-pokemon.com/play/pokedex/`）資料形狀相同、**1251 筆逐筆比對
0 差異**，所以現行官方圖鑑沒有台港分歧，2016 年的統一命名仍然成立。

`https://www.pokemon.com.hk/` **不是官方**（WordPress + Google AdSense 的同人站），
2016 年那份「151 隻中文名」公告的原始出處已經死了（`nintendo.com.hk` 301 到
`nintendo.com/hk`，`pokemon_chinese.htm` → 404）。**沒有任何現存的官方可下載名稱清單。**
Pokémon HOME / SV 官方站也沒有發佈任何字串清單。

---

## 4. Pokémon Showdown 上游 `data/text/zh-tw/`（新，ADR-0014 寫作時不存在）

- `https://github.com/smogon/pokemon-showdown/tree/master/data/text/zh-tw`
- 檔案：`pokedex.ts`、`moves.ts`、`abilities.ts`、`items.ts`、`names.ts`、`default.ts`、`tags.ts`
- 進 master：**2026-08-23**（PR #12247）；最近改動 **2026-09-01**（PR #12259）
- `sim/dex-data.ts`：`export type TextLanguage = 'en' | … | 'zh-cn' | 'zh-tw';`
  —— 它是**一級語系**，不是 side project

### 4.1 內容

用 `toID()` 當 key，形狀就是本專案要的形狀：

```ts
export const MovesText: { [id: IDEntry]: MoveText } = {
	absorb: {
		name: "吸取",
		// Official flavor text: "吸取對手的養分進行攻擊。…"
		desc: null, // NEEDS TRANSLATION
```

實測（方法：`_scan.mjs`，逐行掃頂層 tab 縮排的條目。註：**先前用非貪婪 regex 一次抓整段
body 的寫法會多算 16 筆**，因為 body 偶爾會吞掉下一個條目；逐行掃與 `grep -c 'name: "'`
一致）：

| 檔案           | 條目 | 有 `name` | `name: null`                                 |
| -------------- | ---- | --------- | -------------------------------------------- |
| `moves.ts`     | 953  | **934**   | 19（16 個 `hiddenpower<type>` + 3 個 CAP）   |
| `abilities.ts` | 322  | **317**   | 5                                            |
| `items.ts`     | 583  | **475**   | 108（幾乎全是 Mega 石）                      |
| `pokedex.ts`   | 1559 | 1092      | 467（另有 `baseSpecies` / `forme` 兩個半段） |

那 19 個 null 的招式**都不在 `Dex.moves` 的 `num > 0` 集合裡**，所以對本專案而言
**Showdown 的 951 個真實招式 id 有 950 個有名字**，唯一缺的是 `nihillight`（Champions 專屬）。

`desc` / `shortDesc` 一律 `null, // NEEDS TRANSLATION`（`moves.ts` 有 2795 處）——
**只有名字，沒有說明**。本專案只要名字，剛好。

`default.ts` 給天氣的**狀態名**（不是招式名）：

```
sandstorm 沙暴  sunnyday 大晴天  raindance 下雨  hail 冰雹  snowscape 下雪
desolateland 大日照  primordialsea 大雨  deltastream 亂流
```

注意 `snowscape` 的 `weatherName` 是 `下雪` 而招式 `Snowscape` 是 `雪景`；`raindance` 是
`下雨` 對招式的 `求雨`。兩者都是官方字串，但一個是**場上狀態**、一個是**招式**。
時間軸的天氣列說的是狀態 —— **這是 Showdown 這個來源獨有的東西。**

場地 / 房間 / 我方狀況在 `default.ts` **只有訊息句、沒有名稱欄位**
（`electricterrain: { start: "  腳下電流飛閃！", … }`），名字仍然要走招式表。

`names.ts`：`StatNames` 全譯（`atk 攻擊 / def 防禦 / spa 特攻 / spd 特防 / spe 速度 /
accuracy 命中率 / evasion 閃避率`）、`TypeNames` 全譯（含 `星晶`）。
**`StatusNames` 八筆全是 `null`**（`brn` / `par` / `slp` / `frz` / `psn` / `tox` / `fnt` /
`confusion`）。

### 4.2 覆蓋率：與 PokéAPI 聯集後第九世代 100%

```
$ node _final2.mjs
moves (all gens 951):     PokeAPI 916, Showdown 950, union 950; both 916, 分歧 0
  Showdown 獨有 (34)：超極巨化招式（gmax*）+ 10000000voltthunderbolt
  PokeAPI 獨有 (0)
  gen 9 legal (685): PokeAPI 685, Showdown 685, union 685；仍無名：none

abilities (all gens 316): PokeAPI 308, Showdown 316, union 316; both 308, 分歧 0
  Showdown 獨有 (8)：asoneglastrier=人馬一體（雪暴馬） embodyaspectteal=面影輝映（碧草） …
  gen 9 legal (310): PokeAPI 304, Showdown 310, union 310；仍無名：none

items (all gens 580):     PokeAPI 521, Showdown 475, union 522; both 474, 分歧 0
  Showdown 獨有 (1)：stick=大蔥
  PokeAPI 獨有 (47)：全部是 Mega 石（venusaurite、charizarditex…）
  gen 9 legal (249): PokeAPI 249, Showdown 249, union 249；仍無名：none

species: Showdown 1067/1417；ADR-0014 表 1197/1417；union 1216/1417
  both 1048；基礎 species 名分歧 0
  Showdown 獨有 19 筆（7 筆 gen-9-legal）
  ADR-0014 獨有 149 筆
```

三個關鍵事實：

- **重疊的 1698 筆（916 + 308 + 474）逐字節相同，零分歧。** 不是巧合 —— 見 §4.3。
- **Showdown 把 PokéAPI join 不到的 6 筆特性補齊了**，用官方的括號寫法
  `面影輝映（碧草）`、`人馬一體（雪暴馬）`。第九世代因此三個都是 100%。
- **物種表反過來：Showdown 比現行表差 130 筆**，`ninetalesalola` 這類阿羅拉／伽勒爾型態
  它全是 `null`。它只補得上 7 筆第九世代合法的洞。

### 4.3 可信度：它是 PokéAPI 的投影，不是獨立權威

`data/text/README.md` 原文：

> Text is official where possible - from the most recent game with that text. That means
> Champions if possible, falling back to SV, etc.
>
> Translated names and descriptions sourced from PokeAPI/pokeapi commit
> `c0a9bc75af3a455cdfa27dde21e4ec95aedd3f25`
>
> Translated battle messages in Champions sourced from projectpokemon/champout commit
> `0c1141656e1a66ae304ac3ee1e7126a00914d1f2`
>
> Translated battle messages from oldgens sourced from abcboy101/poke-corpus commit
> `9dbc7fdc8bf49042d8ae47a42fed67c94903a4b5`

**名稱來自 PokéAPI；poke-corpus 只提供舊世代的戰鬥訊息。** 而它引用的 PokéAPI commit
`c0a9bc75` 早於 PR #1648，所以 §3.1 那兩個字彙錯誤它照樣繼承（實測確認）。

好處是「投影到 `toID()`」這件事它已經幫我們做完，而且做得比我們的 join 正確。

### 4.4 是真的繁體，還是簡體轉的？

這是本專案最在意的那條線。`moves.ts` 檔頭有一句容易誤讀的註解：

```
// Fixed formulas mirror zh-cn/moves.ts (converted); boilerplate is shared verbatim across
//   entries — QC one, fix all. Cross-references generated from zh-tw name fields.
```

**這句管的是 `desc` 的公式樣板，不是 `name`。**（同段還說「Cross-references generated
from zh-tw name fields」，即說明文反過來引用名稱欄位。）三個實測：

1. **`name` 與 PokéAPI 繁中逐字節相同、0 筆分歧**（§4.2），而那份是 `official=1` 的資料。
2. **Unihan 檢查全數乾淨**：`moves.ts` / `abilities.ts` / `items.ts` 的 zh-tw `name`
   0 筆含簡化字。
3. **存在字彙層級（而非字形層級）的差異**，純轉換做不到。例如 `bugmemory`：
   zh-cn `虫子存储碟` / zh-tw `蟲子記憶碟` —— `存储` 與 `記憶` 是不同的詞。
   `porygon2` zh-tw `多邊獸Ⅱ` / zh-cn `多边兽２型`；`ogerpon` zh-tw `厄鬼椪` /
   zh-cn `厄诡椪`。

**判定：`data/text/zh-tw/` 的 `name` 是真的繁體官方名，不是簡繁轉換。**
但它繼承了 PokéAPI 那 2 筆字彙錯誤（§3.1）—— 「不是轉換」與「沒有錯」是兩件事。

### 4.5 ⚠️ 未併入的 PR #12278 不能用

`https://github.com/smogon/pokemon-showdown/pull/12278`（open，branch `prelim-translation`）
把 `pokedex.ts` 的 null 從 467 降到 56、`items.ts` 從 108 降到 2。**但作者自己說：**

> "These preliminary translations are a mix of Google Translate, other online translation
> software, looking up terms on various pokemon wikis in various languages, a lot of other
> googling, some informal feedback... **They should NOT be considered "good"**; they're
> mostly just here as a starting point."

新字串標 `// NEEDS QC`（376 隻）或 `// NEEDS QC: unofficial`（29 隻）。
例如 `taurospaldeacombat = 帕底亞肯泰羅・鬥戰` 標的就是 `NEEDS QC: unofficial`。

**這正是 ADR-0014 拒絕的東西，只是換了個上游。盯著它，不要 pin 它。**
本專案要 pin 的是 master 上已併入、且不帶 QC 標記的部分。

### 4.6 授權

`LICENSE`，MIT：

> The MIT License (MIT)
>
> Copyright (c) 2011-2026 Guangcong Luo and other contributors http://pokemonshowdown.com/
>
> Permission is hereby granted, free of charge, to any person obtaining a copy of this
> software and associated documentation files (the "Software"), to deal in the Software
> without restriction, including without limitation the rights to use, copy, modify, merge,
> publish, distribute, sublicense, and/or sell copies of the Software…
>
> The above copyright notice and this permission notice shall be included in all copies or
> substantial portions of the Software.

**可以 commit 衍生表**，保留聲明即可。名稱表在 MIT 的 server repo 裡；**client repo 是
AGPL-3.0**，不要從那邊拿。本 repo 已經依賴 `@pkmn/dex`（MIT，同一份上游資料），
所以這不是新的授權面。

### 4.7 機器可讀性與穩定性

- 固定路徑：`https://raw.githubusercontent.com/smogon/pokemon-showdown/<sha>/data/text/zh-tw/<file>.ts`
  （sha pin 實測可用；六個檔 488KB，比 PokéAPI 需要的六個 CSV 944KB 少一半）
- **Key 就是 `toID()`，不需要 join。** 這消掉 §2.3 全部的 join 病。
- **不在 npm 上。** `pokemon-showdown@0.11.11`（2026-07-28）的 tarball 裡 `data/text/`
  沒有語系子目錄。必須從 GitHub raw 抓。
- **不穩定**：8/23 進、9/1 又改、9/2 還有 open PR。它是 in-progress 的工作。
- 格式是 TypeScript 而非 JSON。逐行掃可行（`_scan.mjs` 約 20 行），但它是「解析別人的
  原始碼」，上游改排版就會壞 —— 需要一條「解出來的筆數不得低於 N」的斷言。

---

## 5. `@pkmn/*`

**沒有任何非英文文字資料。** `@pkmn/dex/data/` 只有英文 JSON；`pkmn/ps` 全 repo 找不到
`i18n` / `translations` / `zh-tw`。`@pkmn` 移植上游資料時刻意丟掉整個 `data/text`
（連英文說明都不留）。

它在本題的角色仍然關鍵，但是當**分母**：`@pkmn/dex` 是「Showdown 會送出哪些 id」的權威，
本文件所有覆蓋率的分母都是它。

---

## 6. 其他來源

### 6.1 `kwsch/PKHeX` —— 品質最好，授權最糟

`PKHeX.Core/Resources/text/other/zh-Hant/text_*_zh-Hant.txt` + `text/items/`。
索引對齊的純文字（第 N 行 = 內部 id N），來自遊戲自己的 zh-Hant 本地化文本。

```
$ 逐檔行數：Species 1025, Moves 920, Abilities 310, Types 18, Forms 1141, Items 2684
$ node（比對官方圖鑑）
PKHeX zh-Hant species vs official TW portal: 1025 identical, 0 differ
$ sed -n '957p;984p' Species.txt →  超能豔鴕 / 仆斬將軍     ← §3.1 那兩筆它是對的
$ grep 面具 Forms.txt → 碧草面具 水井面具 火灶面具 礎石面具 ；赫月 ；太晶形態
                        上弓姿勢 下垂姿勢 平挺姿勢
```

**它是唯一與官方圖鑑 1025 筆全對的資料集，而且型態標籤覆蓋到第九世代。**

**授權 GPL-3.0**（`LICENSE`）。把衍生表 commit 進本 repo 是實質的 copyleft 問題 ——
GPL 對「從 GPL 資料檔產生的資料檔」的射程有爭議，而爭議本身就是不該踩的東西。

**判定：不採用為資料來源，但它是很好的第二個驗證器**（離線、不受 §3.2 那條使用條款拘束的
是它的檔案本身仍受 GPL 拘束 —— 所以連驗證都最好用官方圖鑑，PKHeX 只當交叉確認）。

### 6.2 `abcboy101/poke-corpus` —— 官方遊戲文本，授權更糟

`NOTES.md` 說明它的來源是 ROM／訊息檔萃取（`xytext` / `pk3DS` / `pkNX` 的共通格式、
GB/GBC/GBA 用 `pret` 反編譯的格式）—— **是官方遊戲文本，不是社群翻譯也不是 wiki**。

- 格式：`corpus/<Collection>/<lang>_<file>.txt`，純 UTF-8、不壓縮，
  平行的 `qid_*.txt` 提供 label（`sv.monsname.MONSNAME_1017`）當 join key。
- `src/res/corpus.json` 的 `languages` 把 `zh-Hans` / `zh-Hans-CN` / `zh-Hant` 列為
  **三個並列的語系槽** —— 轉換器產不出三個。SV `common` 60486 行中 33311 行不同，
  且有字彙級差異（`WAZANAME_492` Foul Play `欺詐` / `移花接木`）。**真的是分別萃取的。**
- **本文件列的每一個缺口它都有**（讀自 `corpus/HOME/zh-Hant_megaturtle_nx.txt`）：
  `ZKN_FORM_1017_000..003` = 碧草面具 / 水井面具 / 火灶面具 / 礎石面具、
  `ZKN_FORM_1024_000..002` = 普通形態 / 太晶形態 / 星晶形態、
  `ZKN_FORM_964_000/001` = 平凡形態 / 全能形態、`ZKN_FORM_978_*` = 上弓／下垂／平挺姿勢、
  `ZKN_FORM_925_*` = 三隻家庭 / 四隻家庭、`ZKN_FORM_905_*` = 化身形態 / 靈獸形態。
- **陷阱**：HOME 的 `monsname` 按國家圖鑑編號索引，**SV 的不是**（Ogerpon 在 HOME 是
  1017、在 SV 是 1011；106 個索引在 917–1025 區間分歧）。要用 HOME 那份。
- **型態名只有後綴標籤，沒有組合好的顯示名。** 「厄鬼椪」與「水井面具」是兩筆記錄，
  沒有任何一筆是「厄鬼椪（水井面具）」—— 組合是 Showdown 自己發明的（也是它標
  `NEEDS QC` 的原因）。ADR-0014 的括號規則因此不是誰的疏漏，**官方就是分開給的**。

**授權 GPL-3.0，且沒有任何 code / text 的區分或例外**：`LICENSE` 與 gnu.org 的
GPL-3.0 逐字節相同（僅標題行少 20 個前導空白），`README.md` / `NOTES.md` 搜
`licen|copyright|GPL|permission|redistribut` **零命中**，`corpus/` 底下沒有任何 notice 檔。

**判定：不採用。** 它是品質最高的來源，也是唯一能補完第九世代型態的來源，但
（a）GPL-3.0 涵蓋整棵樹、無 carve-out，（b）真正的權利人是 TPC 而 abcboy 無權授權，
（c）要自己寫國家圖鑑編號 ↔ `toID()` 的對照與型態名組合。

### 6.3 52poke（神奇宝贝百科）—— 唯一有招式／道具雙欄的 wiki，但不能用

`https://wiki.52poke.com/api.php`（MediaWiki 1.43.9）。**沒有 Cargo / SMW / Wikibase，
`Special:Export` 回 403，沒有 dump** —— 只能走 Revisions API 讀 wikitext。

它的用語列表頁**把簡繁兩個官方版本存在不同欄位**（`|編號|繁體(任天堂)|簡體(任天堂)|tw=…|hk=…`），
不是轉換：招式 935 列、特性 312 列、道具 2425 列、狀態 117 列、寶可夢 1027 列，
而且斜體標示代理商譯名、未填表示「暂无官方中文译名」—— **逐筆標了出處。**
它是**唯一一個同時有台灣官方招式 + 道具 + 狀態的來源。**

但它的**渲染**是轉換 + 覆寫表。`神奇宝贝百科:译名标准` 原文：

> 神奇宝贝百科支持简体字（zh-Hans）与繁体字（zh-Hant）两种汉字书写系统，并允许读者自动
> 转换。**神奇宝贝百科不将简体字与繁体字视为不同的语言或方言，并且不进行本地化，请理解
> 这一点和存在不同本地化团队的商业作品的区别。**

授權 `神奇宝贝百科:版权声明` 原文：

> **文字内容** [[神奇宝贝百科]]原创文字内容默认基于 **CC BY-NC-SA** 许可协议 […]
> **非商业性使用 — 您不得将神奇宝贝百科的内容用于商业目的。**
> **免责声明** 宝可梦（…）相关的商标权和其它知识产权归任天堂株式会社，The Pokémon
> Company，Creatures，GAME FREAK等企划单位所有。**相关权利不属于以上许可协议授权范围。**

`神奇宝贝百科:机器读取守则` 原文：

> 不得并行读取神奇宝贝百科，连续请求必须等待上一请求完成，并且**间隔时间须超过 500 毫秒**。
> **除已申请的机器人账号外，禁止使用 `action=parse` MediaWiki API 读取渲染后的页面内容。**

而且 `robots.txt` 直接把 AI agent 擋掉（實測）：

```
$ curl -s https://wiki.52poke.com/robots.txt | grep -A1 -E 'ClaudeBot|anthropic-ai'
User-agent: anthropic-ai
Disallow: /
User-agent: ClaudeBot
Disallow: /
```

**判定：不採用。** CC BY-NC-SA 的 non-commercial 條款、`action=parse` 禁令、500ms 節流、
以及擋 AI agent 的 robots.txt，加起來讓它不適合當產生器的來源。而且它是 **wiki text**，
不是官方字串 —— 它自己就說「不进行本地化」。

### 6.4 `SyaOtiLan/pokemon-showdown-zh-hans` —— 確認是簡體

ADR-0014 的判斷成立。`localization/generated/*.json` 是 `{id, name, zhHans, source}` 陣列，
`id` 就是 `toID()`；species 1418、moves 951、abilities 311、items 581。
**每個欄位都叫 `zhHans`；repo 內搜 `zh-Hant` / `繁體` / `繁体` 零命中，fork 數 0。**

出處（README 原文）：

> 名称以当前 Showdown 数据为基准，依次使用人工修正、原汉化脚本、形态组合和 PKHeX
> 简体中文列表补齐。

即「人工修正 → 舊漢化 userscript → 型態組合 → PKHeX 簡中清單」。鏈條末端是遊戲文本，
但中間有人工與 userscript，**屬於社群翻譯**。授權 **AGPL-3.0**。

三個獨立理由否決：簡體、社群翻譯、AGPL（對公開網站是 copyleft 陷阱）。
**繁體對應專案不存在**（`gh search repos "pokemon-showdown zh"` 只有它，fork 清單為空）。

### 6.5 ⚠️ `sindresorhus/pokemon` —— 看起來最像正統，錯 8%

`data/zh-hant.json`，MIT，npm 上很多人依賴。**1025 筆，與官方圖鑑比對 81 筆不同**，
而且錯的方式是「2016 年統一前的舊譯名」：

```
$ node（比對官方圖鑑）
sindresorhus/pokemon zh-hant.json entries: 1025
differ from official TW portal: 81 of 1025
  #154 repo="大菊花"   official="大竺葵"
  #167 repo="線球"     official="圓絲蛛"
  #196 repo="太陽精靈" official="太陽伊布"
  #197 repo="月精靈"   official="月亮伊布"
  #199 repo="河馬王"   official="呆呆王"
  #214 repo="赫拉剋羅斯" official="赫拉克羅斯"
```

只有 species，沒有招式／特性／道具，README 也沒說譯名出處。**明確不要用。**
記在這裡是因為它是這個題目裡最容易誤入的陷阱。

### 6.6 掃過但不適用

- `projectpokemon/za-textport`（MIT，Legends Z-A datamine）—— species 與 PKHeX 0 差異，
  授權好得多，但只涵蓋 Z-A 的內容（會空掉 18 個 Z 招式），不是完整表。**值得再看一次
  的候選**，如果 GPL 是唯一的阻礙。
- `42arch/pokemon-dataset-zh`（MIT，★107）—— 自述「简体中文JSON数据集」，檔名都是簡體，
  完全沒有 zh-Hant。
- `pagefaultgames/pokerogue-locales` 的 `zh-Hant/move.json` —— 同人遊戲的語系檔，出處不明。
- `duanxr/PTCG-CHS-Datasets`、`type-null/PTCG-database` —— 集換式卡牌，不是本傳用語表。

---

## 7. 沒有好來源的東西

**狀態代碼的 chip 名稱（`brn` / `par` / `slp` / `frz` / `psn` / `tox` / `fnt`）。**

- PokéAPI：`move_meta_ailment_names.csv` 繁中 **0 筆**。
- Showdown：`names.ts` 的 `StatusNames` 八筆全 `null, // NEEDS TRANSLATION`。
- 遊戲本身不用名詞講狀態，它講句子。`default.ts` 的 `brn.start` = `{POKEMON}被灼傷了！`、
  `brn.damage` = `{POKEMON}受到了灼傷的傷害！` 是官方句子，但**句子塞不進
  `StateChips.vue` 的三字元 chip**。

**結論：官方沒有這種字串，誰翻都是自己翻。** ADR-0014 把它們留作識別碼是對的，
而且現在有第一手證據 —— **連 Showdown 自己都留 `null`。**

**協定機制值（`recoil` / `drain` / `fallen5` / `none`）。** 同上，官方只有句子。
`fallen5` 是 Showdown 內部的計數器表示法，遊戲裡不存在這個概念。

**組合好的型態顯示名。** poke-corpus（§6.2）證明官方**分開給**基礎名與型態標籤，
沒有任何一份官方資料給「厄鬼椪（水井面具）」這種組合字串。所以 ADR-0014 說
「括號是這支產生器唯一貢獻的字元」不只是實作選擇，**它是唯一可能的做法** ——
除了 Showdown 客戶端也在做同一件事這個旁證之外，沒有官方答案可抄。

---

## 8. 建議

### 8.1 #102 / #103 應該用什麼

**主表：Showdown 上游 `data/text/zh-tw/`，pin sha，只取 master 上沒有 `NEEDS QC` 標記的
部分。補漏：PokéAPI，pin tag 或 sha。**

順位與 ADR-0014 同一個精神（官方為主、衝突時官方贏），但兩邊都是官方字串、實測零分歧，
所以「衝突」在實務上不會發生 —— 順位只決定誰填空。

| 表   | 主                                 | 補                               | 第九世代    |
| ---- | ---------------------------------- | -------------------------------- | ----------- |
| 招式 | Showdown `moves.ts`（950/951）     | PokéAPI（916）                   | **685/685** |
| 特性 | Showdown `abilities.ts`（316/316） | PokéAPI（308）                   | **310/310** |
| 道具 | Showdown `items.ts`（475）         | PokéAPI（521，補 47 顆 Mega 石） | **249/249** |

**場上狀況不需要第四張表**，#103 設計的 fallback 鏈是對的，只要前面多接一段：

```
Showdown default.ts 的 weatherName  →  招式表  →  特性表  →  手寫表
```

第一段是新增的，理由見 §4.1：天氣列說的是狀態（`下雪`）不是招式（`雪景`）。
手寫表實測只需要裝 6 個非名稱的值，其中 `brn` / `psn` 依 ADR-0014 本來就不翻，
真正要寫的是 `none` / `recoil` / `drain` / `fallen5` —— 而官方沒有名詞可用（§7），
所以它們是**文案**，該進 `i18n/locales/zh-TW.json` 而不是產生出來的表。

**太晶屬性與能力值變化改成從來源產生，不要手寫。** Showdown `names.ts` 的 `TypeNames`
與 `StatNames` 都是官方全譯（§4.1），手寫等於自己翻一份官方已經有的東西。
**狀態 chip 維持手寫**，因為官方真的沒有（§7）—— 這兩件事 #103 目前放在同一句話裡，
應該拆開。

**#103 的把關測試照做，而且它現在有明確的預期值**：92 個識別字、允許落空 6 個、
落空的是哪 6 個。測試該把這 6 個寫成白名單，多一個就紅燈。

### 8.2 取捨

**選 Showdown 為主的代價：它是 in-progress 的工作。** 8/23 進、9/1 改、9/2 還有 open PR，
而且不在 npm 上、格式是 TypeScript。pin sha 之後可控（重跑產生器是刻意動作，ADR-0014
已立此原則），但升版時要人看 diff，而且要防 §4.5 那個 PR 的內容悄悄進來 ——
**產生器應該直接拒絕任何帶 `NEEDS QC` 註解的條目**，這樣「上游併入機器翻譯」會變成
少幾筆退回英文，而不是靜靜地把猜測放上畫面。

**選 PokéAPI 為主的代價更高**：join 是有損的（實測丟掉 6 筆特性、24 筆型態），
而丟掉的方式是靜靜退回英文，沒人會發現。

**兩邊都要的代價：產生器要讀兩種格式（CSV 與 TypeScript）。** 逐行掃 `data/text/*.ts`
可行（`_scan.mjs` 約 20 行），但它是「解析別人的原始碼」。傾向逐行掃 + 一條
「解出來的筆數不得低於 N」的斷言，讓上游改排版變成測試紅燈而不是靜靜少一半。
（本次調查在這件事上先踩了一次：非貪婪 regex 抓整段 body 的寫法多算 16 筆，
`grep -c 'name: "'` 才對得上。這正是那條斷言要防的。）

**bundle 成本這一輪可以確定不是問題。** ADR-0014 說「招式與特性表比這份大得多」，
把 lazy load 的決定留給 #102 / #103。實測**它說錯了**：

```
$ node _size.mjs
moves       900 entries  raw 17KB  gzip 11KB
abilities   308 entries  raw  6KB  gzip  4KB
items       521 entries  raw 10KB  gzip  6KB
species    1197 entries  raw 26KB  gzip 14KB   ← 已 commit 的那份
```

三張新表合計 33KB raw / 21KB gzip，**比寶可夢名稱表一份還小**（中文名字短、英文 id 長，
每筆比英文表便宜）。四張表全部靜態 import 約 54KB / gzip 後 35KB。
ADR-0014 留下的「三份一起看才知道該切在哪裡」現在有答案了：**不用切。**

### 8.3 ADR-0014 的物種表要不要改

要，四件事，其中三件是 bug。

**（1）修 2 筆錯的名字，並加一條對官方圖鑑的驗證測試。**
`espathra` 應為 `超能豔鴕`、`kingambit` 應為 `仆斬將軍`（§3.1）。這是 ADR-0014 存在的
理由本身出了問題：**「看起來像官方、其實是簡體用字轉換」的東西，經由它信任的來源進來了。**
§2.5 的 Unihan 檢查抓不到它們（每個字都是合法繁體字），唯一抓得到的是官方圖鑑。
驗證測試不會把官方資料 commit 進來（§3.2 的使用條款因此不成問題），
它只在不符時紅燈並印出該修的 id。

**（2）把 join key 從 `identifier` 改成 PokéAPI 自己的英文 `name`，並先 NFD 去音標。**
回收 24 筆官方名，23 筆第九世代合法，包含 ADR-0014 明文列為「已知缺口」的
`Ogerpon-Wellspring`／`-Hearthflame`／`-Cornerstone`、`Indeedee-F`、
`Necrozma-Dusk-Mane`／`-Dawn-Wings`（§1）。ADR-0014 的「後果」一節要改寫。

**（3）加一條簡體字形檢查測試。** 判準用 Unicode UCD 的 `Unihan_Variants.txt`
（`kTraditionalVariant` 指向非自身者即簡化字），斷言表裡 0 筆命中。§2.5(a) 證明上游
確實會混簡體進繁中欄位，而現行表乾淨純粹是時間差。這條測試守的正是 ADR-0014 的核心
主張，而且**不需要任何判斷 —— 判準來自 Unicode，不是我們**。它與（1）互補：
**Unihan 抓字形，官方圖鑑抓字彙，缺一不可。**

**（4）產生器 pin ref，不要抓 `master`。** `2.9.0` 與 `master` 實測差 4 筆招式；
`master` 在 2026-08-25 之前會出簡體。ADR-0014「跑出來的東西也就是已經 committed 的那一份」
這個保證，在抓 `master` 的前提下是假的。

**可以順手做、但不急的一件事**：從 Showdown `pokedex.ts` 補那 7 筆第九世代合法的洞
（`Tauros-Paldea-*` 三筆、`Darmanitan-Galar` / `-Galar-Zen`、`Ogerpon-*-Tera`）。
`Darmanitan-Galar-Zen` 的 `forme` 是單一官方字串 `達摩模式（伽勒爾的樣子）`，
`Tauros-Paldea-Combat` 是 `鬥戰種（帕底亞的樣子）` —— **官方自己就用括號把「地區 + 模式」
裝在一個字串裡**，ADR-0014「一個括號只裝得下一個說明」的限制因此可解。
組字串時要避免套出巢狀括號，那是產生器的事不是資料的事。

**明確不建議的事**：

- 把物種表換成以 Showdown 為主（覆蓋率倒退 130 筆，阿羅拉／伽勒爾型態全掉）。
- 用簡體來源轉繁（§6.4）。ADR-0014 的立場不變，而且現在多兩個理由：AGPL，
  以及 §3.1 證明了轉換出來的東西**確實會錯，而且錯得看不出來**。
- 用 PKHeX 或 poke-corpus（§6.1、§6.2）。它們品質最好，也是唯一能真正補完第九世代型態
  的來源，但都是 GPL-3.0 且無 code/text 區分。**這是本調查最遺憾的一項** ——
  最好的資料有最壞的授權。若哪天需要那 100 筆左右的型態名，
  `projectpokemon/za-textport`（MIT，§6.6）是唯一值得再查的方向。

### 8.4 誠實的「沒有來源」清單

| 需要的東西                                            | 有沒有官方來源                                                      |
| ----------------------------------------------------- | ------------------------------------------------------------------- |
| 第九世代招式 / 特性 / 道具名                          | **有，100%**                                                        |
| 天氣 / 場地 / 房間 / 我方狀況名                       | **有，100%**（天氣另有專用的狀態名）                                |
| 太晶屬性、能力值名                                    | **有，100%**                                                        |
| 基礎 species 名（1025 隻）                            | **有，100%**，但要對官方圖鑑驗證（現行表錯 2 筆）                   |
| 第九世代型態名                                        | **部分**。碧之假面那批有；洗翠／帕底亞／藍之圓盤那批只在 GPL 來源裡 |
| 組合好的型態顯示名                                    | **沒有。官方分開給，括號只能自己加**                                |
| 狀態 chip（`brn` / `par` / …）                        | **沒有。官方只有句子，Showdown 自己也留 null**                      |
| 協定機制值（`recoil` / `drain` / `fallen5` / `none`） | **沒有**                                                            |

---

## 附錄：重現方法

調查腳本寫在 `apps/web/` 底下（`@pkmn/dex` 裝在那裡），**刻意不 commit** ——
它們是一次性量測工具，不是產品程式碼。

| 量測           | 做法                                                                                                                                                                                                                                                                   |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| fixture 識別字 | 走 `packages/replay-parser/test/fixtures/*.json` 的 `log`，按協定行的 cmd 分類收集 `-ability` / `-item` / `-weather` / `-sidestart` / `[from]` 等的值                                                                                                                  |
| PokéAPI        | `curl raw.githubusercontent.com/PokeAPI/pokeapi/<ref>/data/v2/csv/{move,ability,item}_names.csv`、`{moves,abilities,items}.csv`、`pokemon{,_forms,_form_names,_species_names}.csv`、`languages.csv`、`type_names.csv`、`stat_names.csv`、`move_meta_ailment_names.csv` |
| Showdown       | `curl raw.githubusercontent.com/smogon/pokemon-showdown/<sha>/data/text/zh-tw/*.ts`，**逐行**掃頂層 tab 縮排條目的 `name` / `baseSpecies` / `forme`（不要用非貪婪 regex 抓整段 body）                                                                                  |
| 官方圖鑑       | `curl -A "Mozilla/5.0" https://tw.portal-pokemon.com/play/pokedex`，regex 抓 RSC payload 的 `{"zukan_id":…,"zukan_sub_id":0,"pokemon_name":…}`                                                                                                                         |
| 分母           | `@pkmn/dex` 的 `Dex.forGen(9).{moves,abilities,items,species}.all()`，濾 `exists && num > 0 && !isNonstandard`                                                                                                                                                         |
| 簡體字形檢查   | `https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip` 的 `Unihan_Variants.txt`，取 `kTraditionalVariant` 非自身者（6044 個）                                                                                                                                      |

本次調查所用的 pin：
PokéAPI `master` @ 2026-09-02（以及 `2.9.0`、`890ea227` 做對照）、
Showdown `2f5b273925862ac242b419086c1e7a8868b51da1`、
PKHeX `a595033bc255ca1a172a0aded0eb73eb82f1b2d8`、
Unicode UCD 17.0（`Unihan_Variants.txt`，2025-07-24）、
官方台灣圖鑑頁 fetch @ 2026-09-02（543,592 bytes）。

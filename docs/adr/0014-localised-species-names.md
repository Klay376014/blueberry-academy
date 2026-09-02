# ADR-0014：寶可夢名稱進 i18n，招式與狀態代碼不進

- 狀態：Accepted
- 日期：2026-09-02
- 相關：#101、#102、#103；推翻主設計文件 §3 的一句話

## 脈絡

主設計文件 §3 寫著：

> 寶可夢 / 招式 / 道具名稱**永遠只顯示英文**，不進 i18n —— 它們是識別碼不是文案。

這句話當時同時包了兩件事，而它們並不同一：

1. **識別碼不能翻。** `battles.team_signature` 是 `toID()` 後的英文 id 串接，翻譯它
   等於毀掉隊伍分組。這件事今天依然成立，永遠成立。
2. **給人看的字也不翻。** 這件事在時間軸（#90 之後）站不住。中文使用者讀
   `Ninetales-Alola 換成 Pikachu` 時，句子的兩個名詞是他在遊戲裡沒見過的字串；
   而 VGC 的中文玩家平常說的是「阿羅拉九尾」。

#101 只推翻第 2 點。

另一個限制沒有變：SPA 跑在 Workers 免費方案上（見主設計文件「免費版的架構後果」與
`scripts/gen-species-names.mjs` 的檔頭），所以譯名**不能執行期查詢** —— 一次查表就吃掉
50 個 subrequest 之一，換來的是每次部署之間都不會變的資料。

## 決定

### 哪些用語本地化，哪些留作識別碼

| 用語                                                     | 這張票之後                | 理由                                                                           |
| -------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------ |
| 寶可夢名（畫面上）                                       | **本地化**                | 給人看的字。#101                                                               |
| 寶可夢 id（`toID()`、signature、DB 欄位、icon 表的 key） | **識別碼，永不翻**        | 翻了隊伍分組就散掉（CONTEXT.md「隊伍的同一性」）                               |
| 招式名                                                   | 留作識別碼，**#102 再議** | 同樣是給人看的字，但表與這張票的表是兩份資料，分票做                           |
| 道具名 / 特性名                                          | 留作識別碼，**#103 再議** | 同上                                                                           |
| 狀態與能力值代碼（`brn`、`atk`、`Tera Fire`）            | **識別碼，不翻**          | 它們是 Showdown 協定的值，畫面上就是三個字母的 chip，`StateChips.vue` 靠它排版 |
| 賽制 id（`gen9championsvgc2026regmb`）                   | **識別碼，不翻**          | 它是篩選器的值也是 DB 的欄位                                                   |

**譯名不進 `i18n/locales/*.json`。** 語系檔是給人手寫、逐句校對的文案；1200 筆機器產生的
名稱放進去會把它變成沒人讀得完的東西，也讓 diff 失去意義。名稱走**產生出來的對照表**
（`app/shared/lib/dex/species-names-zh-hant.json`），與英文名表放在一起。
`test/nuxt/species.spec.ts` 的「keeps Pokémon names out of the i18n locales」守著這條線。

### 資料來源：官方為主，社群補漏

1. **主表：PokéAPI 的官方繁中字串**（`data/v2/csv/`，`local_language_id = 4`）。這是
   The Pokémon Company 自己的遊戲文本，玩家在遊戲裡看到的就是這些字。
2. **補漏：Showdown 中文化社群資料**，只填官方沒有的 id；**衝突時官方贏**。

第 2 點目前**沒有實作**，理由是實測找不到繁中的社群來源。找到的是
`SyaOtiLan/pokemon-showdown-zh-hans`：

```
$ gh api repos/SyaOtiLan/pokemon-showdown-zh-hans/contents/localization/README.md --jq .content | base64 -d | head -1
# Pokémon Showdown 简体中文资源
```

它的產出檔一律叫 `*.zh-Hans.json`／`catalog.zh-Hans.json`，是簡體。把簡體轉繁體會產出
**看起來像官方、其實不是官方**的名字（用字轉換不等於譯名轉換），這正是本專案不做的事。
所以順位保留在紀錄裡，等有繁中來源時接在官方後面即可，程式碼裡不預先長出一個沒有輸入的
分支。

### 產生器與涵蓋率

`apps/web/scripts/gen-species-names-zh-hant.mjs`，`pnpm --filter web gen:species-names-zh-hant`
重跑，輸出進版控、按 id 排序、一行一筆（與 `gen-species-names.mjs` 同一個
serialiser，兩份表 diff 起來長得一樣）。

CSV 是**執行時抓**而不是 vendor 一份快照：三個 CSV 加起來約 1.5MB，換來的答案約 50KB，
而重跑是刻意的動作（dex 升版、新世代），不在 install 或 build 的路徑上。任何人只要有網路
都跑得起來，跑出來的東西也就是已經 committed 的那一份。

實測輸出：

```
$ node scripts/gen-species-names-zh-hant.mjs
wrote 1198 zh-Hant names to species-names-zh-hant.json (1025 base species, 173 formes;
219 of Showdown's 1417 species left to the English fallback)
```

官方繁中資料有兩種形狀，產生器據此分流：

- `pokemon_species_names.csv` —— 1025 隻基礎 species 的**完整名**，全部有。
- `pokemon_form_names.csv` —— 型態那一欄有時是**完整名**（`超級妙蛙花`），有時只是
  **型態的說明**（`阿羅拉的樣子`）。判準是「基礎名是不是它的子字串」：是就照用，不是就
  照遊戲自己的呈現方式加括號 —— `九尾（阿羅拉的樣子）`、`土地雲（靈獸形態）`。
  **括號是這支產生器唯一貢獻的字元**，兩邊的字都是官方的。

## 後果

**219 個 id 沒有繁中名，退回英文。** PokéAPI 的繁中型態資料停在第八世代前後，所以
第九世代的型態全在這裡面 —— 對 VGC 有感的是 `Ogerpon-*`、`Terapagos-*`、`Palafin-Hero`、
`Indeedee-F`、`Tauros-Paldea-*`、`Maushold-Four`、`Tatsugiri-*`、`Basculegion-F`、
`Enamorus-Therian`、`Necrozma-Dusk-Mane`。中文畫面上這些會是英文名，這是**已知缺口而不是
bug**：查不到就退回英文、英文也查不到就退回 raw id，猜一個譯名才是靜靜地錯。哪天官方
資料補上（或出現繁中社群來源），重跑產生器就補上了。

**接縫是三個函式**（`app/shared/utils/speciesName.ts`，Nuxt auto-import）：

| 函式                             | 回傳                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `speciesName(id)`                | 官方英文名，查不到回 raw id。**行為與這張票之前完全相同** |
| `speciesDisplayName(id, locale)` | 該語系的名字 → 英文名 → raw id                            |
| `speciesLabel(id, locale)`       | `顯示名 (英文名)`，兩者相同時只有一個                     |

`LOCALISED` 只有 `zh-TW` 一個 key。`nuxt.config.ts` 新增語系而還沒產生表時，它讀到的是
英文而不是空白。

**英文名沒有從畫面上消失，它退到 icon 上。** 時間軸與 FieldBar 的寶可夢本來就只有 icon
沒有文字，`aria-label` / `title` 是它唯一說得出名字的地方；中文語系下它說
`九尾（阿羅拉的樣子） (Ninetales-Alola)`。這是刻意的：使用者讀時間軸時常常同時開著
Showdown 的 replay，而 Showdown 只講英文。

**en 語系一字未變**，`app/features/timeline/test/localised-names.spec.ts` 的
`the timeline in en` 兩條測試就是為了釘住這件事而存在的（接縫本身與表的形狀在
`test/nuxt/species-locale.spec.ts`；元件測試進 feature 底下是
`test/architecture.spec.ts` 的規則要求的）：

```
$ pnpm --filter web exec vitest run test/nuxt/species-locale.spec.ts app/features/timeline/test/localised-names.spec.ts
Test Files  2 passed (2)
     Tests  24 passed (24)
```

**簽章那條路徑沒有被碰到。** `battle-only-formes.ts`（ADR-0008）與
`packages/replay-parser` 完全沒有進到這張票，本地化只發生在 `apps/web/app/shared/utils/`
與兩個時間軸元件裡。時間軸顯示當下形態的規則也沒變 —— 表是按當下形態的 id 查的，
`Ninetales-Alola` 查到的就是阿羅拉九尾。

## 為什麼不把譯名塞進語系檔

看起來最省事：已經有 `zh-TW.json` 了，多 1200 個 key 而已。代價是那個檔案從此不能用眼睛
讀完，人工校對的文案與機器產生的名稱混在一起，任何一次 dex 升版都會在 review 裡蓋掉真正
的文案改動。名稱與 icon 表本來就是同一批資料的兩個投影（`gen-species-names.mjs` 一次走完
dex 產出兩張表），它們該待在一起。

## 替代方案

- **執行期打 PokéAPI** —— 永遠最新，但每個名字一次 subrequest，Workers 免費方案 50 個的
  上限下這是不可能的；且離線／PokéAPI 掛掉時整個畫面沒有名字
- **把簡體社群資料轉成繁體** —— 涵蓋率會漂亮很多（那份資料有第九世代），但轉出來的
  名字不是官方譯名，而使用者無從分辨哪些是真的。缺口留著、退回英文，至少是誠實的
- **只翻基礎 species，型態一律英文** —— 少掉「括號是誰加的」這個爭議，但
  `Ninetales-Alola` 這種在 VGC 極常見的形態就永遠是英文，而官方明明有兩半字可用
- **等官方繁中資料補齊第九世代再做** —— 這張票是 #102/#103 的地基，等下去等於三張票
  一起停住

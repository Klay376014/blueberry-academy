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

### 資料來源：官方台灣圖鑑逐位元組為準，PokéAPI 是量產來源

1. **量產來源：PokéAPI 的繁中字串**（`data/v2/csv/`，`local_language_id = 4`）。1025 隻
   基礎 species 加 172 個型態，一次抓完。
2. **權威：官方台灣寶可夢圖鑑**（`https://tw.portal-pokemon.com/pokedex/`）。**兩者不一致
   時，官方圖鑑的字串贏，一個字都不讓。** 這些字進
   `apps/web/scripts/species-names-zh-hant-official.mjs`，每一筆帶著它的圖鑑編號與 URL。

**第 2 點是這份 ADR 原本沒有的，而它是被實測推翻後補上的。** 原文寫著「PokéAPI 這是
The Pokémon Company 自己的遊戲文本，玩家在遊戲裡看到的就是這些字」—— 這句話**不是逐筆
成立的**。1025 隻基礎 species 全量比對官方圖鑑，2 筆不符：

```
$ pnpm --filter web verify:species-names-zh-hant     # 修正前的表
compared 1025 base species against https://tw.portal-pokemon.com/pokedex/: 2 deviate, 0 absent from the table
  deviate #956 espathra: table=超能艷鴕 official=超能豔鴕
  deviate #983 kingambit: table=仆刀將軍 official=仆斬將軍
```

兩筆的性質不同，而其中一筆正是本 ADR 明文要拒絕的那個失敗模式：

|          | `#983 Kingambit`                | `#956 Espathra`                             |
| -------- | ------------------------------- | ------------------------------------------- |
| 官方台灣 | `仆斬將軍`                      | `超能豔鴕`                                  |
| PokéAPI  | `仆刀將軍`                      | `超能艷鴕`                                  |
| Unihan   | `刀` 與 `斬` **無任何變體關係** | `艷`／`豔` 經 `艶` 互為變體                 |
| 性質     | **不同的詞**                    | **同一個詞的不同字形**（官方用罕見的 `豔`） |

`#983` 是關鍵那一筆：PokéAPI 同一列的 zh-Hans 是 `仆刀将军`，它的 zh-Hant 值就是那個值
做字形轉換。也就是說 **PokéAPI 的 zh-Hant 欄位不是均勻的官方台灣文本，其中夾著「簡體名
換字形」** —— 而「把簡體轉繁體會產出看起來像官方、其實不是官方的名字」正是本 ADR 下面
拒絕社群簡體資料的理由。同一個瑕疵從被信任的來源進來了，而且沒有任何東西攔得住它，因為
當時表的正確性只跟 PokéAPI 自己比。

**新的保險是一支獨立的驗證器**（見下節），不是更多的來源。

#### Showdown 上游的 `data/text/zh-tw/` 不算第二票

ADR 原文說「實測找不到繁中的社群來源」，這一句在 2026-08-23 之後不再成立：Showdown 上游
自己有 `data/text/zh-tw/`，用 `toID()` 當 key。但**它不是獨立佐證**，它的 README 寫著資料
從哪裡來：

```
$ curl -sSL https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/README.md | grep -i 'sourced from PokeAPI'
Translated names and descriptions sourced from PokeAPI/pokeapi commit c0a9bc75af3a455cdfa27dde21e4ec95aedd3f25

$ curl -sSL https://raw.githubusercontent.com/smogon/pokemon-showdown/master/data/text/zh-tw/pokedex.ts | grep -E '^\s*(espathra|kingambit):' -A2
	espathra: {
		name: "超能艷鴕",
	kingambit: {
		name: "仆刀將軍",
```

它連上面那 2 筆偏差都一起帶著。所以**「PokéAPI 與 Showdown 一致」不是交叉驗證，它是同一
份資料被數了兩次** —— 任何拿兩者相符當作正確性證據的推論都是無效的，包含這份 ADR 原本
「這是官方遊戲文本」那句話所隱含的自信。要真的驗證，就得問一個不是從 PokéAPI 抄來的來源，
而目前只有官方圖鑑符合這個條件。（Showdown zh-tw 對招式／特性／道具的價值是 #102 / #103
的題目，不在這張票裡。）

至於**簡體社群資料**（`SyaOtiLan/pokemon-showdown-zh-hans`，`*.zh-Hans.json`）：仍然不用，
理由不變 —— 用字轉換不等於譯名轉換，`#983` 就是它會長什麼樣子的現成例子。

#### 官方圖鑑是驗證器，不是資料來源

它的使用條款第 1 條明文禁止拷貝、複製、修改、刊登、發佈、散佈其內容，所以那 1025 個字串
**不會被 commit 進這個 repo**。進版控的只有「PokéAPI 與它不符的那幾個 id」—— 那是一份
bug 回報，不是一份資料集的副本。這也是為什麼修正走 override 表而不是換來源。

### 第三層來源：姊妹專案的手維護表，只補洞（#115）

PokéAPI 的繁中**型態**資料實質停在第八世代，而時間軸畫的是**當下型態** —— 帶厄鬼椪的隊
每一場都會出現 `Ogerpon-Wellspring`，跳跳鯨變身後是 `Palafin-Hero`。所以那批缺口不是邊角，
是固定露在畫面上的英文。

同一台機器上的姊妹專案 `PokemonTool-DamageCalculator` 有一份 1250 筆的繁中名表
（`app/locales/zhHant.json` 的 `pokemon`），補得上其中 80 個型態。它在優先序裡**排最後**，
理由是它的性質與前兩層不同：

| 層級                     | 是什麼                            | 地位                     |
| ------------------------ | --------------------------------- | ------------------------ |
| 官方台灣圖鑑             | 權威，逐位元組為準                | 只當驗證器（不可再散布） |
| PokéAPI                  | 官方字串的社群搬運                | 量產來源                 |
| DamageCalculator zh-Hant | **repo owner 自維護，出處無記錄** | 只補前兩層沒有的 id      |

那份檔案 git 上是 2026-04-19 隨一次 Nuxt 升版進來的，之後有 `fix: Surf in Chinese` 這類
手改 commit，**沒有記錄它的來源**。但它顯然不是 PokéAPI 的下游：`kingambit` 在那裡是
`仆斬將軍`，也就是官方的正確譯名，而 PokéAPI 與 Showdown 在這一筆都是錯的。基礎種比對
1025 筆：985 筆與本表相同、34 筆它沒有、6 筆不同 —— 而那 6 筆裡 5 筆是它把型態寫進基礎名
（`Ogerpon` → `厄鬼椪（碧草面具）`），真正的分歧只有 `Espathra`（它 `超能艷鴕`，官方
`超能豔鴕`）。**這一筆就是「只補洞、永不覆寫」的理由**：讓它覆寫會把已經對齊官方的名字改壞。

兩邊的 key 命名不同（Showdown 的 `ogerponwellspring` vs `@smogon/calc` 的
`ogerpon-wellspring-mask`、`indeedee-female`、`maushold-family-of-four`），沒有規則能互轉，
所以對照方式是：候選 = 以基礎種 id 開頭的 key，再要求**型態的每個詞都以完整的詞出現在該
key 裡**，且**只能命中一個**。命中兩個或零個就報出來而不選 —— `Necrozma-Dusk-Mane` 是
「零個」的實測例子（那份表把它鍵成 `necrozma-dusk`，`mane` 在任何 key 裡都不存在）。

三條規則各自擋掉一種在 review 中實際發生過的錯配：

1. **候選若本身是「別的物種的 id」就先剔除。** 沒有這條，`Darmanitan-Galar`（型態 `Galar`）
   會同時命中 `darmanitan-galar-standard` 與 `darmanitan-galar-zen`、因歧義而放棄，於是畫面
   上出現英文的 `Darmanitan-Galar` 配上中文的達摩模式 —— 正是本文件想避免的「一半翻一半沒
   翻」。而 `-zen` 那個 key 不是歧義的證據，它已經被 `Darmanitan-Galar-Zen` 認領了。
2. **型態詞要比對完整的詞，不是子字串。** `Meowstic-M-Mega` 的 `m` 曾經比中通用的
   `meowstic-mega` —— 那是另一隻寶可夢的條目。
3. **性別型態的單字母另有對照**（`F`→`female`、`M`→`male`）。性別是 dex 裡唯一用單一字母
   表示的型態，而單一字母正是最容易誤中長字的東西 —— 所以它需要規則，而不是靠子字串巧合
   命中（`Indeedee-F` 之前就是靠巧合）。

**名字相撞就跳過。** 那份表裡 `Avalugg-Hisui` 是 `冰岩怪`，也就是基礎種自己的名字（型態詞
掉了）；照收會讓兩隻不同的寶可夢同名，正是組合規則讓掉 `Darmanitan-Galar-Zen` 的那個病
（而那一筆本身現在由這層來源補上了 —— 它有完整的名字 `達摩狒狒（達摩模式-伽勒爾）`）。
實測共擋掉三筆：`Avalugg-Hisui`、`Eevee-Starter`、`Pikachu-Starter`。這條防護是機制而不是
記憶 —— `species-locale.spec.ts` 的「表裡沒有重複的名字」因此依然成立。

**不 vendor 進本 repo。** 它屬於另一個專案，複製過來就是分叉。路徑可用 `CALC_ZH_HANT`
覆寫，預設是相對於本 repo 的姊妹目錄；**檔案不存在時產生器照樣跑完**（那 80 筆退回英文並
印出訊息），所以沒有那個 checkout 的人仍然重跑得出一份完整可用的表。

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
wrote 1277 zh-Hant names to species-names-zh-hant.json (1025 base species, 172 formes,
80 formes gap-filled; 140 of Showdown's 1417 species left to the English fallback)
official Pokédex overrides: 2 entries, 2 of which PokéAPI still disagrees with
gap-filled from the calculator's table: 80 formes
  skipped Avalugg-Hisui: 冰岩怪 already names another Pokémon
  skipped Eevee-Starter: 伊布 already names another Pokémon
  skipped Pikachu-Starter: 皮卡丘 already names another Pokémon
  still English (137): Absol-Mega-Z, Alcremie-Caramel-Swirl, ...
left to the English fallback for having a forme the bracket cannot hold: Darmanitan-Galar-Zen
```

**修正走產生器，不是手改 JSON。** 官方圖鑑的字串放
`scripts/species-names-zh-hant-official.mjs`，產生器在**組合任何名字之前**就把它們換進
PokéAPI 的資料裡（所以由該基礎名組出來的型態也跟著修正），重跑不會把修正吃掉。那個檔案
裡的每一個字都是從 `source` 那個 URL 原樣讀出來的官方字串 —— **沒有經過翻譯、音譯或字形
轉換**，這條規則寫在檔頭，而且沒有 URL 的名字不准加進去。產生器還會拿 `zukanId` 對
`@pkmn/dex` 的圖鑑編號：URL 指到別隻的 override 會讓整支 script 停下來，而不是靜靜地改錯
一隻。

`corrections` 那個數字（上面的 `2 of which PokéAPI still disagrees with`）是刻意印出來
的：哪天 PokéAPI 自己修好了，它會掉到 0，那時該筆 override 就可以移除。

官方繁中資料有兩種形狀，產生器據此分流：

- `pokemon_species_names.csv` —— 1025 隻基礎 species 的**完整名**，全部有。
- `pokemon_form_names.csv` —— 型態那一欄有時是**完整名**（`超級妙蛙花`），有時只是
  **型態的說明**（`阿羅拉的樣子`）。判準是「基礎名是不是它的子字串」：是就照用，不是就
  照遊戲自己的呈現方式加括號 —— `九尾（阿羅拉的樣子）`、`土地雲（靈獸形態）`。
  **括號是這支產生器唯一貢獻的字元**，兩邊的字都是官方的。

**一個括號只裝得下一個說明，所以「地區 + 模式」的型態一律跳過。** 這條是 review 抓出來
的實測錯誤（#101 code review，finding 1）：PokéAPI 給 `Darmanitan-Galar-Zen` 的那一列只
說了模式（`達摩模式`），組出來是 `達摩狒狒（達摩模式）` —— 與烏黑的 `Darmanitan-Zen`
**逐位元組相同**，而伽勒爾那隻的官方名是 `伽勒爾達摩狒狒（達摩模式）`。這正是本 ADR 要
拒絕的「靜靜地錯」，所以型態字串同時帶 `Alola`／`Galar`／`Hisui`／`Paldea` 與別的成分時
就不收，退回英文。

`Urshifu-Rapid-Strike`（`武道熊師（連擊流）`）這種**好幾個字但只有一件事**的型態不受影
響 —— 那一列的說明就是它的全部。判準寫成「型態字串切開後多於一段，且其中一段是地區」，
不是「多於一段」：後者會連 `武道熊師（連擊流）`、`花舞鳥（啪滋啪滋風格）` 一起丟掉，實測
少 4 筆。

表裡**沒有任何重複的值**（`test/nuxt/species-locale.spec.ts` 的「names no forme twice」守
著）：一個譯名出現兩次，就是某個組合把區別掉在地上了。

### 驗證器：`verify:species-names-zh-hant`

`apps/web/scripts/verify-species-names-zh-hant.mjs`：抓官方圖鑑列表頁**一次**，解出
RSC payload（`self.__next_f.push`，欄位 `zukan_id` / `zukan_sub_id` / `pokemon_name`；
`zukan_sub_id == 0` 是基礎 species），把 1025 筆與 committed 的表逐位元組比對，印出每一筆
偏差，有偏差就 exit 1。

```
$ pnpm --filter web verify:species-names-zh-hant
compared 1025 base species against https://tw.portal-pokemon.com/pokedex/: 0 deviate, 0 absent from the table
```

三個實作上的坑，都是實測踩到的：

- **`/play/pokedex` 回 308 到 `/pokedex/`，不跟 redirect 只拿到 9 個 byte。** 那會解出 0 筆
  記錄、印出 0 筆偏差，長得跟通過一模一樣。所以 script 硬寫著「基礎 species 必須是 1025
  筆」，解不到就 throw —— 這條 assert 存在的唯一理由就是讓「沒抓到」不能假裝成「沒問題」。
- **沒有 JSON API。** `/play/pokedex/api/v1/?pokemon_no=0956` 這種路徑拿不到名字，資料只在
  頁面 HTML 的 RSC payload 裡。
- **官方圖鑑對型態名沒有意見**：同一隻的型態記錄（`zukan_sub_id != 0`）沿用基礎名，所以
  驗證只覆蓋 1025 隻基礎 species，172 個組合出來的型態名它驗不到。

**它刻意不在 unit test 裡。** `vp run -r test:unit` 必須是 hermetic 的：CI 不去爬第三方
網站，也不因為 `tw.portal-pokemon.com` 慢就變紅燈。它是跟產生器並排的手動動作 —— 重跑
產生器之後、dex 升版、新世代時各跑一次。測試套件裡守著的是**表自己的形狀**（排序、無重複
值、基礎 species 全覆蓋、NFC），外加 `test/nuxt/species-locale.spec.ts` 把這兩筆修正後的
字串釘死，那一半是 hermetic 的，兩者分工不重疊。

## 後果

**140 個 id 沒有繁中名，退回英文**（修訂：#115 之前是 220）。中文畫面上這些會是英文名，
這是**已知缺口而不是 bug**：查不到就退回英文、英文也查不到就退回 raw id，猜一個譯名才是
靜靜地錯。

剩下的 140 個裡，會真的出現在對戰畫面上的只有少數 —— 絕大多數是 Mega、超極巨化、霸主
（前世代限定，第九世代的 replay 不會有），以及純外觀型態（Vivillon 的 20 種花紋、
阿爾宙斯 17 屬性、Alcremie 的奶油、皮卡丘的帽子、Deerling 四季）。**仍然缺、而且會上畫面**
的是 `Necrozma-Dusk-Mane` / `-Dawn-Wings`（計算機那份把它們鍵成 `necrozma-dusk`，型態詞
`mane` 在任何 key 裡都找不到，所以對照不起來）、以及 `Ogerpon-*-Tera` 四個（那份沒有太晶化
後的條目）。

**同一族的型態要嘛整族有名字、要嘛整族沒有。** 缺得整齊比缺得像對的好，而
`species-locale.spec.ts` 現在把達摩狒狒與超能妙喵那兩對釘成「兩邊有無一致」，因為那正是
review 抓到的錯配長出來的樣子。

**接縫是三個函式**（`app/shared/utils/speciesName.ts`，Nuxt auto-import）：

| 函式                             | 回傳                                                      |
| -------------------------------- | --------------------------------------------------------- |
| `speciesName(id)`                | 官方英文名，查不到回 raw id。**行為與這張票之前完全相同** |
| `speciesDisplayName(id, locale)` | 該語系的名字 → 英文名 → raw id                            |
| `speciesLabel(id, locale)`       | `顯示名 · 英文名`，兩者相同時只有一個                     |

`LOCALISED` 只有 `zh-TW` 一個 key。`nuxt.config.ts` 新增語系而還沒產生表時，它讀到的是
英文而不是空白。

**英文名沒有從畫面上消失，它退到 icon 上。** 時間軸與 FieldBar 的寶可夢本來就只有 icon
沒有文字，`aria-label` / `title` 是它唯一說得出名字的地方；中文語系下它說
`九尾（阿羅拉的樣子） · Ninetales-Alola`。這是刻意的：使用者讀時間軸時常常同時開著
Showdown 的 replay，而 Showdown 只講英文。

分隔用**點而不是括號**：表裡有大量譯名自己就帶括號（`九尾（阿羅拉的樣子）`），
再包一層括號讀起來像嵌套。

**en 語系一字未變**，`app/features/timeline/test/localised-names.spec.ts` 的
`the timeline in en` 兩條測試就是為了釘住這件事而存在的（接縫本身與表的形狀在
`test/nuxt/species-locale.spec.ts`；元件測試進 feature 底下是
`test/architecture.spec.ts` 的規則要求的）：

```
$ pnpm --filter web exec vitest run test/nuxt/species-locale.spec.ts app/features/timeline/test/localised-names.spec.ts
Test Files  2 passed (2)
     Tests  29 passed (29)
```

**`SpeciesParty` 的 label 也本地化了，但 signature 沒有。** 這一條是 review 期間改的
（#101 code review，finding 4）：`BattleDrawer` 把那排六隻畫在時間軸正上方，label 留英文
會讓 zh-TW 的螢幕閱讀器使用者在同一個畫面聽到「Pikachu, Ninetales-Alola」與
「皮卡丘 …… 九尾（阿羅拉的樣子）」兩套名字講同一場對戰。那個字串本來就已經是文案 ——
它會被 `t('battle.absentPokemon', …)` 包起來 —— 而不是 signature。

**`signature` prop、`toID()` 的 id、DB 欄位、隊伍分組完全沒有變**，本地化只發生在「說出
來的那句話」上。`test/nuxt/species-locale.spec.ts` 的 `SpeciesParty` 四條測試同時釘住
en 的輸出沒動、zh-TW 說中文、以及 prop 仍然是 `pikachu|ninetalesalola`。

**簽章那條路徑沒有被碰到。** `battle-only-formes.ts`（ADR-0008）與
`packages/replay-parser` 完全沒有進到這張票，本地化只發生在 `apps/web/app/shared/utils/`
與兩個時間軸元件裡。時間軸顯示當下形態的規則也沒變 —— 表是按當下形態的 id 查的，
`Ninetales-Alola` 查到的就是阿羅拉九尾。

**表是靜態 import，bundle 成本這一輪不處理。** 這份 JSON 約 50KB（gzip 前），跟英文名表
與 icon 表一樣被靜態 import 進 chunk，en 使用者也載得到。review 提過改成按語系 lazy load
（#101 code review，finding 3），**刻意留著不做**：招式與特性表（#102 / #103）比這份大得
多，三份一起看才知道該切在哪裡。這是留給 #102 / #103 的未決問題，不是沒想到。

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

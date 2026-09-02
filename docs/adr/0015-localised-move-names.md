# ADR-0015：招式名進顯示層，而且沒有權威可以驗

- 狀態：Accepted
- 日期：2026-09-02
- 相關：#102；延伸 [ADR-0014](0014-localised-species-names.md)；資料實測
  [docs/specs/2026-09-02-zh-hant-name-sources-research.md](../specs/2026-09-02-zh-hant-name-sources-research.md)

## 脈絡

ADR-0014 把「識別碼不能翻」與「給人看的字也不翻」拆開，只推翻了後者的物種那一半，並在
表格裡把招式名記成「留作識別碼，**#102 再議**」。這份 ADR 就是那個再議的結果：**招式名
是給人看的字，和寶可夢名同一個性質**，所以走同一條路 —— 產生出來的對照表 + 顯示層查表，
不進語系檔、不執行期查詢。

範圍是 #102 的四個地方：招式列自己的名稱，以及三種**本身就是招式名的效果字串** ——
單回合效果生效（`effectStarted`）、被擋下（`effectHeld`）、我方場地效果的展開與結束
（`sideEffectStarted` / `sideEffectEnded`，log 裡是 `-sidestart` / `-sideend`）。解析器的
`effectNameOf` 已經剝掉 `move:` / `ability:` / `item:` 前綴，所以這四種走同一次查表 ——
**代價是那次查表看不出來 log 有沒有說過命名空間**，下面「log 沒說命名空間的字」那一節就是
這件事的帳。

## 決定

### 資料來源：PokéAPI 是量產來源，Showdown 上游只補洞，而且不算第二票

順位沿用 ADR-0014 的精神：

1. **量產來源：PokéAPI 的繁中 `move_names.csv`**（`local_language_id = 4`）。
2. **補洞：Showdown 上游 `data/text/zh-tw/moves.ts`**（ADR-0014 寫作時還不存在，
   2026-08-23 才進 master），只填 PokéAPI 沒有的 id。

**Showdown 這一票不增加任何可信度。** 它自己的 `data/text/README.md` 寫著
`Translated names and descriptions sourced from PokeAPI/pokeapi commit c0a9bc75`，
也就是說它的名稱欄位就是 PokéAPI 的投影。它買到的是**join 的便利**（key 就是 `toID()`），
以及 PokéAPI 的 join 接不到的那批 id，**買不到第二份佐證**。所以

> **「PokéAPI 與 Showdown 一致」不是交叉驗證，它是同一份資料被數了兩次。**

這句話在 ADR-0014 已經對物種表講過一次（`#956` / `#983` 兩筆偏差兩邊都帶著），對招式表
一樣成立，而且沒有第三個來源可以打破平手。

### 沒有 oracle：這是與 #101 最重要的不對稱

ADR-0014 的保險是**官方台灣寶可夢圖鑑**（`verify:species-names-zh-hant`）—— 一個不是從
PokéAPI 抄來的來源。**招式沒有這個東西**：官方圖鑑列表頁的 RSC payload 只有 species 與
特性，沒有招式。實測過的替代品全部不能用（研究筆記 §6）：wiki 是社群內容、poke-corpus 與
PKHeX 是 GPL-3.0、簡體來源做字形轉換會產出「看起來像官方、其實不是官方」的名字 ——
`kingambit` 就是那個失敗模式的現成標本。

所以這張票**明文承認它驗不了**：

| ADR-0014（物種）                      | 本 ADR（招式）             |
| ------------------------------------- | -------------------------- |
| 有權威可比對（官方圖鑑 1025 筆）      | **沒有任何權威**           |
| `verify:` script 逐位元組比對、印偏差 | 不存在，而且**不假造一個** |
| 守的是「字對不對」                    | 只守得到「有沒有字」       |

**不做的事，明文記下來**：不爬 wiki、不機器翻譯、不音譯、不做簡繁字形轉換。缺就退回英文。

### log 沒說命名空間的字，只要是歧義字就不查表

**這是這張票唯一一個真的畫錯字的缺陷。** `-singleturn` / `-activate` / `-sidestart` /
`-sideend` 四種行的效果字串，log **有時候帶前綴、有時候不帶**，而解析器的 `effectNameOf`
把前綴剝掉之後兩者長得一模一樣。於是任何 `toID()` 撞到招式 id 的裸字串都會被改寫成那個
招式的名字 —— 實測 `|-activate|p2b: Garchomp|confusion`（混亂中無法行動）在 zh-TW 上畫成
**「被念力擋下」**，念力是招式 Confusion，不是狀態混亂。

先量再決定。量的是「畫面上會出現的四種行」的效果字串，來源兩份：committed fixture
9 份，以及新抓的 502 份公開 ladder / Bo3 replay（`gen9championsvgc2026regmb` +
`…bo3`，抓完只用來量，沒有進 repo）。

| 語料         | 相異字串 | 帶前綴                         | 裸的 | 裸且有歧義           |
| ------------ | -------- | ------------------------------ | ---- | -------------------- |
| fixture 9 份 | 20       | 13（11 `move:` 2 `ability:`）  | 7    | **1（`confusion`）** |
| 新抓 502 份  | 52       | 44（32 `move:` 12 `ability:`） | 8    | **1（`confusion`）** |

兩份語料都沒有出現過 `item:` 前綴，也沒有出現過「帶前綴但前綴與 dex 不符」的字串 ——
**log 說是招式的，dex 也都認為是招式**。合起來 10 個相異的裸字串，9 個是無歧義的招式名
（`Protect`、`Wide Guard`、`Quick Guard`、`Spikes`、`Stealth Rock`、`Toxic Spikes`、
`Reflect`、`Helping Hand`、`Skill Swap`），只有 `confusion` 一個是歧義字。
**「裸的就不查」不是選項**：那 9 個是畫面上絕大多數的效果字串（`Protect` 一個字串在
502 場裡出現 1397 次是裸的、42 次帶前綴）。

第二次量的是歧義本身有多大。`@pkmn/dex` 的 935 個招式 id 與**非招式**的 id 相撞的只有 7 個：

| 撞到什麼                       | id                                                                |
| ------------------------------ | ----------------------------------------------------------------- |
| `Dex.data.Conditions`（35 筆） | `confusion` `raindance` `sunnyday` `sandstorm` `hail` `snowscape` |
| 道具                           | `metronome`（道具節拍器 / 招式揮指）                              |
| 特性                           | 無                                                                |

**`disable` / `attract` / `taunt` / `encore` / `curse` / `substitute` 不在裡面，而且不該在。**
它們的異常狀態就是那個招式帶來的（Showdown 把 volatile 定義在 move 自己身上，不在
`conditions.ts`），所以那些位置上招式名**就是**正確的名字。`Dex.conditions.get()` 會對
`stealthrock` 也回 `exists: true`，正是因為它連招式一起查 —— 判準必須是
`Dex.data.Conditions` 的 key，不是那個 getter。這件事把「歧義」從一個看起來很寬的家族收成
7 個 id。

**決定：`effectDisplayName` 對這 7 個 id 拒絕查表，原樣回傳英文。** 名單由
`scripts/gen-ambiguous-move-ids.mjs` 從 `@pkmn/dex` 推導、寫成
`app/shared/lib/dex/ambiguous-move-ids.json`（committed 的理由與名稱表一樣：`@pkmn/dex` 是
devDependency，不進 bundle），`test/nuxt/move-locale.spec.ts` 再推導一次比對，所以 dex 升版
把歧義集擴大時是紅燈而不是畫錯字。**招式列自己的名稱不受影響** —— 真的用了念力的那一列
走 `moveDisplayName`，那裡的命名空間沒有疑問。

**沒有做的是把命名空間從解析器帶出來。** 讓 `effectNameOf` 除了剝掉的名字之外再回一個
`'move' | 'ability' | 'item' | null`，然後只查 log 說是招式的那些 —— 這是 #103 建
招式→特性→狀態那條鏈時需要的形狀，但**對 #102 今天量到的資料一個字都改不了**：兩份語料
合起來 58 個相異字串裡，「帶前綴且有歧義」是 0 個，所以前綴買到的資訊全部落在裸字串規則
（也就是上面那 7 個 id）已經處理完的地方。代價那一側是實的：`TimelineEvent` 的公開型別
多一個欄位、`parse-timeline` 的 committed snapshot 27 處要改、`RowNote.params`
（`Record<string, string>`）要多帶一個不是給 `t()` 看的鍵。**#103 需要那條鏈時再做，
屆時它有 measured 的理由**：`-start` 行實測就是同一批字彙兩種寫法都有 ——
`move: Taunt` 20 次、`move: Yawn` 29 次帶前綴，而 `Encore` 63 次、`confusion` 10 次、
`Disable` 7 次、`Substitute` 10 次是裸的。

### 代替 oracle 的是涵蓋率把關，它守的是另一個洞

`app/features/timeline/test/name-coverage.spec.ts`：走
`packages/replay-parser/test/fixtures/` 的九份真實 log（第九份
`gen9championsvgc2026regmb-2674380893` 是為上面那個缺陷加的，它帶著
`|-activate|p2b: Garchomp|confusion`），把時間軸兩個詳細度下**畫面上會出現的每個識別字**
收集起來，對每個類別問兩個問題。fixture 是 committed 的，`@pkmn/dex` 是 devDependency，
所以它 hermetic，屬於 `vp run -r test:unit`（ADR-0014 立的規矩：會連網的東西留在 script 裡）。

實測（`pnpm --filter web exec vitest run app/features/timeline/test/name-coverage.spec.ts`，
1530 列）：

| 類別                                    | fixture 出現的字串數 | 表命中 | 畫面上是中文 |
| --------------------------------------- | -------------------- | ------ | ------------ |
| 招式列自己的名稱                        | 77                   | 77     | 77           |
| `effectStarted` / `effectHeld`          | 9                    | 7      | **6**        |
| `sideEffectStarted` / `sideEffectEnded` | 4                    | 4      | 4            |
| 去重後的聯集                            | **80**               | **78** | **77**       |

英文的 3 個都在 `EXPECTED_GAPS` 裡，都是 #103 的字彙：`Supreme Overlord` 與 `Toxic Debris`
是**特性名**，從 `|-activate|…|ability: Supreme Overlord` 進到「被 X 擋下」那一列，表根本
沒有它們；`confusion` 是**狀態名**，表有它的 id 但那是招式念力的名字，所以被歧義守衛
拒掉。這是「表命中 78、畫面上 77」那一格的差。白名單**而不是容許數量**：多一個就紅燈。
另有一條測試守著白名單不會過期（該字串已被補上、或 fixture 不再吐它，都會紅燈）。

**第二個問題是這一輪加的：「字對不對」的一個下限。** 只問涵蓋率的話，
**一個被改錯的名字讀起來跟蓋到了一樣** —— `confusion` 查得到 `念力`，涵蓋率報表上它是
命中。所以每個類別多一條斷言：**凡是畫面上被改寫的字串，`@pkmn/dex` 必須認為它是招式、
而且只是招式**。`confusion → 念力 (dex: move+condition)` 就是它在守衛拆掉時印出來的東西
（實測，把守衛拿掉這條就紅）。

這條把關測試守的仍然**不是「這個中文字是不是官方的字」** —— 那件事沒有 oracle，這一節
開頭那張表就是在說這件事。它守的是「字有沒有到畫面上」加上「到畫面上的字是不是從對的
命名空間拿的」，與 ADR-0014 的 `verify:species-names-zh-hant` 的分工不變。

### 表對整個 dex 的涵蓋率

```
$ pnpm --filter web gen:move-names-zh-hant
wrote 934 zh-Hant names to move-names-zh-hant.json (901 from PokéAPI, 33 filled in from
Showdown; 1 of Showdown's 935 moves left to the English fallback)
left to the English fallback: Nihil Light

$ pnpm --filter web gen:ambiguous-move-ids
wrote 7 ambiguous move ids to ambiguous-move-ids.json: confusion, hail, metronome,
raindance, sandstorm, snowscape, sunnyday
```

- **`@pkmn/dex` 的 935 個招式（`exists && num > 0`，去重後）有 934 個有名字。**
- **第九世代合法招式 685 個，685 個都有。**（`test/nuxt/move-locale.spec.ts` 守著）
- 唯一沒有的是 `Nihil Light`（`nihillight`，Champions 專屬）：PokéAPI 沒有這一列，
  Showdown 的 `moves.ts` 也沒有這個條目。它在中文畫面上是英文名，**是已知缺口不是 bug**。

**`Dex.moves.all()` 會重複計數。** 它回 951 個條目、935 個不同的 id（一個別名一個條目），
所以產生器與測試都先去重。研究筆記 §4.2 的「Showdown 950 / union 950」正是被這件事墊高
的 —— 934 個有名字的條目不可能覆蓋 950 個 id。**本 ADR 的數字以去重後為準。**

### 兩個上游的 ref 都 pin 住，不抓 `master`

ADR-0014 的產生器抓 PokéAPI `master`，而它承諾「跑出來的東西也就是已經 committed 的那
一份」—— 抓 `master` 的前提下這個承諾是假的。實測：PokéAPI 的 `move_names.csv` 繁中欄位
**在 2026-08-25 之前有 34 筆是簡化字**（研究筆記 §2.5，Unicode UCD 的
`Unihan_Variants.txt` 為判準），修掉它的是上游一個 PR，不是我們有防線。所以

- PokéAPI pin `c8dbd727fffc44783653e899ef2700c72e5449cf`
- Showdown pin `2f5b273925862ac242b419086c1e7a8868b51da1`

byte-stability 實測：連跑兩次，`cmp` 相同。

### 解析別人的 TypeScript：一條下限斷言

Showdown 的 `moves.ts` 不在 npm 上，格式是 TypeScript。產生器**逐行**掃頂層條目
（非貪婪 regex 抓整段 body 會多算，研究筆記 §4.1 踩過），並且

- **拒絕任何帶 `NEEDS QC` 註解的名字。** 上游有一個 open PR（#12278）把 Google 翻譯的字串
  標成 `NEEDS QC` 準備併進來，作者自己說 "They should NOT be considered good"。這條規則
  讓那件事發生時的結果是「少幾筆退回英文」，而不是靜靜把猜測放上畫面。
- **兩條下限，各守一種壞法。** 條目數少於 900 就 throw，**抓到的 `name:` 行少於 900 也
  throw**。兩者獨立：條目 pattern 失效會把整張表帶走（第一條看得到），而上游只改
  `name:` 那一行的排版時條目全部還在、名字全部不見（**只有第二條看得到**，而且那 34 筆
  Showdown 補的洞裡沒有一個是第九世代合法招式，所以測試也不會叫）。實測這個 ref 是
  953 個條目、934 個有名字；兩條下限都刻意壓在實測值以下 —— 釘死在 934 會讓上面那條
  `NEEDS QC` 規則（本來只該讓幾筆退回英文）第一次生效就變成 throw。
- **key 允許被引號包住。** `"10000000voltthunderbolt"` 是唯一一個 —— 只認未引號 key 的
  pattern 剛好會丟掉它，而它是真的招式。

### join 走 PokéAPI 自己的英文名，不走 `identifier`

`moves.csv` 的 `identifier` 與它自己的英文 `name` 欄位不同步（`11,vice-grip` 的英文名是
`Vise Grip`），而 Showdown 的 id 是英文名做 `toID()` 來的。所以 join 走
**英文 `name`（`local_language_id = 9`）→ NFD 去音標 → `toID()`**。這是研究筆記 §8.3(2) 對
ADR-0014 開的同一張處方，在這裡是新寫的而不是修的。

**而 PokéAPI 的 CSV 是有引號的。** `move_names.csv` 在這個 pin 的 ref 上第 7907 行是
`719,9,"10,000,000 Volt Thunderbolt"`，全檔**就這一行**帶引號（實測）。裸 `split(',')`
把英文名截成 `"10`，於是 719 那一列從 join 裡掉出去 —— 讀取器改成認 `"` 括起來的欄位
（`""` 是欄位內的引號，行尾還在引號裡就 throw）之後，`千萬伏特` 是 PokéAPI 自己給的：
產生器的計數從「900 from PokéAPI, 34 filled in from Showdown」變成「901, 33」，而
**輸出的位元組一個字沒變** —— 這一筆本來是被 Showdown 的 fallback 剛好補上同一個值，所以
它在畫面上一直是對的、只是來源記錯了。

### 接縫：兩個函式，招式名的輸入已經是英文名

`app/shared/utils/moveName.ts`（Nuxt auto-import 之外，顯式 import）：

| 函式                              | 回傳                                                                 |
| --------------------------------- | -------------------------------------------------------------------- |
| `moveDisplayName(name, locale)`   | 該語系的招式名 → 傳進來的英文名                                      |
| `effectDisplayName(name, locale)` | 同上，但歧義 id 直接退回英文；這是 #103 的 fallback 鏈要長出來的地方 |

**與 `speciesDisplayName` 的差別是刻意的**：物種接縫吃的是 id（`ninetalesalola`），所以要
一張英文名表才退得回英文；招式接縫吃的是 log 已經給的英文名（`Wide Guard`），**英文
fallback 就是參數本身**，不需要第二張表。查不到就原樣回傳 —— 不是空白、不是猜測。

`effectDisplayName` 今天是 `moveDisplayName` 加一道歧義守衛（見上面「log 沒說命名空間的
字」）。它存在的理由是 #103：特性表、道具表與手寫的場上狀況表要接成一條鏈，而那條鏈的
位置在這裡，不在元件裡 —— 守衛拒掉的那 7 個 id 正是那條鏈的第一批客戶。

哪個 message key 的 `effect` 參數是招式名，寫在
`app/features/timeline/utils/rowMessage.ts` 的一個集合裡（四個 key）。**`weather`、
`fieldEffectStarted`、`fieldEffectEnded` 從這裡看形狀一模一樣，刻意不在集合裡** ——
它們是 #103 的，而且天氣列說的是**狀態名**（`下雪`）不是招式名（`雪景`），兩者都是官方
字串但不是同一個字。

### 表是靜態 import，bundle 這一輪確定不切

ADR-0014 把這個問題留給 #102 / #103，理由是「招式與特性表比物種表大得多，三份一起看才知道
該切在哪裡」。**實測那個前提是錯的**：

```
$ node -e '…gzipSync…'
move-names-zh-hant.json      934 entries   raw 27,972 B   gzip 12,103 B
species-names-zh-hant.json  1197 entries   raw 36,569 B   gzip 14,780 B
```

招式表 gzip 後 12KB，**比物種表小**（中文名字短、英文 id 長）。#103 的兩張表按研究筆記
§8.2 的量測合計約 10KB gzip。所以四張表全部靜態 import 大約是 35KB gzip，

**決定：靜態 import，不做按語系 lazy load。** 理由是 12KB 換不到那條非同步邊界與它的
載入狀態，而時間軸就是這個 app 的主畫面，表在那裡一定要在。**不再往下做**（AGENTS.md：
不要為了讓決定看起來完整而多做）。ADR-0014 留下的未決問題到這裡結案。

## 後果

- **en 一字未變。** `app/features/timeline/test/localised-names.spec.ts` 的
  `a move on the timeline in en` 兩條，加上 `name-coverage.spec.ts` 每個類別的
  `leaves … untouched in en`，就是為了釘住這件事。
- **row model 沒有變。** `TimelineRow.move` 仍然是 log 給的英文名，本地化只發生在
  `EventRow.vue` / `RowNotes.vue` 畫它的時候。解析器（`packages/replay-parser`）的原始碼
  完全沒有被碰到 —— 只多了一份 fixture 與 `package.test.ts` 裡它的那一行。
- **招式名沒有像物種名那樣保留英文並排。** 物種的英文名退到 icon 的 `aria-label`／`title`
  上（ADR-0014），因為 icon 是它唯一說得出名字的地方；招式列上就是文字本身，再並排一份
  英文會讓每一列變兩倍長。要對照 Showdown replay 的人在同一列上有招式的位置與順序可以對。
- **`vp run -r test:unit` 沒有新增任何網路依賴。** 兩個產生器都是手動動作，量測用的 502 份
  replay 沒有進 repo，把關測試用的是 committed fixture 加 devDependency 的 `@pkmn/dex`。
- **`gen:ambiguous-move-ids` 不連網。** 它只讀 `@pkmn/dex`，所以與招式名表不同，它可以在
  任何時候重跑並被測試比對。

### #103 繼承的洞（實測，不是猜的）

1. **`fieldEffectStarted` / `fieldEffectEnded`**：fixture 出現 `Psychic Terrain` 與
   `Trick Room`，兩者都在招式表裡查得到，**但不在 #102 的四個 key 裡，所以畫面上還是英文**。
   #103 只要把 key 加進 `rowMessage.ts` 的集合就好，一行。
2. **`effectHeld` 上的特性名**：`Supreme Overlord`、`Toxic Debris`（見上面的白名單）。
3. **`effectHeld` 上的狀態名**：`confusion`（同一份白名單）。歧義守衛把它從「被念力擋下」
   改回「被 confusion 擋下」，**這是把錯字換成缺字，不是把它填好** —— 混亂這個狀態的官方
   中文字要等 #103 的狀態表。守衛拒掉的另外 6 個 id
   （`raindance` `sunnyday` `sandstorm` `hail` `snowscape` `metronome`）也在等同一批表，
   而前 5 個正是本 ADR 一開始就講過的那個分別：天氣說的是狀態名（`下雪`）不是招式名
   （`雪景`），現在守衛讓那條路實際上走不通，而不是靠一個集合的成員資格擋著。
4. **FieldBar 的 `screens` 與 `fieldEffects` chips**：`Reflect`、`Light Screen` 這些
   side condition 的 chip 直接印字串，沒有經過任何查表。它們也是招式名。
5. 天氣列、狀態 chip、能力變化、太晶屬性、`[from]` 來源字串、失去道具列 —— #103 的正題。

## 替代方案

- **以 Showdown 為主、PokéAPI 補洞**（研究筆記 §8.1 的建議）。招式表上兩者實測零分歧，
  所以差別只在誰填空；選 PokéAPI 為主是為了與 ADR-0014 的順位一致 —— 兩張表由同一個順位
  規則產生，比兩張表各有一套規則好。代價是要多寫一段 join（§2.3 那個病），實測回收得到
  第九世代 100%，所以代價付得起。
- **假造一個 oracle**（爬 wiki、拿 52poke 的招式欄、簡繁轉換）。這正是 ADR-0014 存在的
  理由要拒絕的東西：轉出來的名字使用者無從分辨真假，而 `仆刀將軍` 證明它會錯得看不出來。
- **等有繁中招式權威再做**。目前沒有任何跡象會出現，而 #103 疊在這張票上。
- **把招式名塞進 `i18n/locales/*.json`**。934 筆機器產生的名稱會把人工校對的文案檔淹掉，
  理由與 ADR-0014「為什麼不把譯名塞進語系檔」一字不改。

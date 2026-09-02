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
`effectNameOf` 已經剝掉 `move:` / `ability:` / `item:` 前綴，所以這四種走同一次查表。

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

### 代替 oracle 的是涵蓋率把關，它守的是另一個洞

`app/features/timeline/test/name-coverage.spec.ts`：走
`packages/replay-parser/test/fixtures/` 的八份真實 log，把時間軸兩個詳細度下**畫面上會出現
的每個識別字**收集起來，斷言每一個都查得到 zh-TW 名。fixture 是 committed 的，所以它
hermetic，屬於 `vp run -r test:unit`（ADR-0014 立的規矩：會連網的東西留在 script 裡）。

實測（`pnpm --filter web exec vitest run app/features/timeline/test/name-coverage.spec.ts`）：

| 類別                                    | fixture 出現的字串數 | 表命中 |
| --------------------------------------- | -------------------- | ------ |
| 招式列自己的名稱                        | 72                   | 72     |
| `effectStarted` / `effectHeld`          | 8                    | **6**  |
| `sideEffectStarted` / `sideEffectEnded` | 4                    | 4      |
| 去重後的聯集                            | **74**               | **72** |

落空的 2 個是 `Supreme Overlord` 與 `Toxic Debris` —— **它們是特性名**，從
`|-activate|…|ability: Supreme Overlord` 進到「被 X 擋下」那一列。特性是 #103 的字彙，
所以它們寫成一份 `EXPECTED_GAPS` **白名單而不是容許數量**：多一個就紅燈。另有一條測試
守著白名單不會過期（該字串已被補上、或 fixture 不再吐它，都會紅燈）。

這條把關測試**守的是「有沒有字」而不是「字對不對」**，這是它與 ADR-0014 的
`verify:species-names-zh-hant` 的分工，兩者不重疊、也不能互相取代。

### 表對整個 dex 的涵蓋率

```
$ pnpm --filter web gen:move-names-zh-hant
wrote 934 zh-Hant names to move-names-zh-hant.json (900 from PokéAPI, 34 filled in from
Showdown; 1 of Showdown's 935 moves left to the English fallback)
left to the English fallback: Nihil Light
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
- **解出來的條目數少於 900 就 throw。** 上游改排版時要紅燈，不要靜靜少一半。
  實測這個 ref 是 953 個條目、934 個有名字。
- **key 允許被引號包住。** `"10000000voltthunderbolt"` 是唯一一個 —— 只認未引號 key 的
  pattern 剛好會丟掉它，而它是真的招式。

### join 走 PokéAPI 自己的英文名，不走 `identifier`

`moves.csv` 的 `identifier` 與它自己的英文 `name` 欄位不同步（`11,vice-grip` 的英文名是
`Vise Grip`），而 Showdown 的 id 是英文名做 `toID()` 來的。所以 join 走
**英文 `name`（`local_language_id = 9`）→ NFD 去音標 → `toID()`**。這是研究筆記 §8.3(2) 對
ADR-0014 開的同一張處方，在這裡是新寫的而不是修的。

### 接縫：兩個函式，招式名的輸入已經是英文名

`app/shared/utils/moveName.ts`（Nuxt auto-import 之外，顯式 import）：

| 函式                              | 回傳                                           |
| --------------------------------- | ---------------------------------------------- |
| `moveDisplayName(name, locale)`   | 該語系的招式名 → 傳進來的英文名                |
| `effectDisplayName(name, locale)` | 同上，但這是 #103 的 fallback 鏈要長出來的地方 |

**與 `speciesDisplayName` 的差別是刻意的**：物種接縫吃的是 id（`ninetalesalola`），所以要
一張英文名表才退得回英文；招式接縫吃的是 log 已經給的英文名（`Wide Guard`），**英文
fallback 就是參數本身**，不需要第二張表。查不到就原樣回傳 —— 不是空白、不是猜測。

`effectDisplayName` 今天就只是 `moveDisplayName`。它存在的理由是 #103：特性表、道具表與
手寫的場上狀況表要接成一條鏈，而那條鏈的位置在這裡，不在元件裡。

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
  `EventRow.vue` / `RowNotes.vue` 畫它的時候。解析器（`packages/replay-parser`）完全沒有
  被碰到。
- **招式名沒有像物種名那樣保留英文並排。** 物種的英文名退到 icon 的 `aria-label`／`title`
  上（ADR-0014），因為 icon 是它唯一說得出名字的地方；招式列上就是文字本身，再並排一份
  英文會讓每一列變兩倍長。要對照 Showdown replay 的人在同一列上有招式的位置與順序可以對。
- **`vp run -r test:unit` 沒有新增任何網路依賴。** 產生器是手動動作。

### #103 繼承的洞（實測，不是猜的）

1. **`fieldEffectStarted` / `fieldEffectEnded`**：fixture 出現 `Psychic Terrain` 與
   `Trick Room`，兩者都在招式表裡查得到，**但不在 #102 的四個 key 裡，所以畫面上還是英文**。
   #103 只要把 key 加進 `rowMessage.ts` 的集合就好，一行。
2. **`effectHeld` 上的特性名**：`Supreme Overlord`、`Toxic Debris`（見上面的白名單）。
3. **FieldBar 的 `screens` 與 `fieldEffects` chips**：`Reflect`、`Light Screen` 這些
   side condition 的 chip 直接印字串，沒有經過任何查表。它們也是招式名。
4. 天氣列、狀態 chip、能力變化、太晶屬性、`[from]` 來源字串、失去道具列 —— #103 的正題。

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

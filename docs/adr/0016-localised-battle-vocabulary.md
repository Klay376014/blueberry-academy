# ADR-0016：剩下的對戰用語，以及為什麼命名空間不從解析器帶出來

- 狀態：Accepted
- 日期：2026-09-02
- 相關：#103；延伸 [ADR-0014](0014-localised-species-names.md) 與
  [ADR-0015](0015-localised-move-names.md)；資料實測
  [docs/specs/2026-09-02-zh-hant-name-sources-research.md](../specs/2026-09-02-zh-hant-name-sources-research.md)

## 脈絡

ADR-0014 把「識別碼不能翻」與「給人看的字也不翻」拆開，#101 推翻了物種那一半，#102 推翻了
招式那一半。剩下的是這一張票：**特性、道具、場上狀況（天氣／場地／房間／我方狀況）、
能力值名、太晶屬性，以及 `[from]` 標出的來源。** 走同一條路 —— 產生出來的對照表 + 顯示層
查表，不進語系檔、不執行期查詢。

ADR-0015 留了一份「#103 繼承的洞」清單，五項全部在這張票裡結案。它也留了一個要在這裡決定
的問題：**要不要把 log 的命名空間從解析器帶出來。** 下面第一節就是那個決定，而它的答案
與 ADR-0015 的預期相反。

## 決定

### 命名空間不從解析器帶出來，因為實測它是不可靠的訊號

ADR-0015 記著「#103 需要那條鏈時再做，屆時它有 measured 的理由」，附的證據是
`-start` 行上 `move: Taunt` 20 次、`move: Yawn` 29 次帶前綴，而 `Encore` 63 次、
`confusion` 10 次、`Disable` 7 次、`Substitute` 10 次是裸的。**那個摘要漏掉了同一個字彙
兩種寫法都有這件事，而那正是決定性的一半。**

重新量。語料：committed fixture 9 份，以及新抓的 **1546 份公開 ladder / Bo3 replay**
（`gen9championsvgc2026regmb`、`…bo3`、`gen9vgc2026regi`，抓完只用來量，沒有進 repo）。
量的是畫面上會出現的八種行（`-singleturn` `-activate` `-start` `-end` `-sidestart`
`-sideend` `-fieldstart` `-fieldend`）的效果字串，以及所有 `[from]` 的值。

```
=== 1546 份 replay
效果字串：13,781 次出現，118 個相異名稱（帶前綴 7,803 次，裸的 5,978 次）
  同一個名稱出現過兩種寫法：15 / 118
  log 說的命名空間與 dex 不符：0
  dex 對同一個 id 給出多於一個命名空間：1（confusion = move + condition，而它永遠是裸的）
```

那 15 個兩種寫法都有的名稱，以及 dex 對它們的判斷：

| 名稱                                                                                                                         | log 的寫法      | dex     |
| ---------------------------------------------------------------------------------------------------------------------------- | --------------- | ------- |
| `Protect`（`-singleturn` 裸 3770 / `move:` 116）                                                                             | 裸 + `move:`    | move    |
| `Protosynthesis`（`-end` 裸 108 / `-activate` `ability:` 71）                                                                | 裸 + `ability:` | ability |
| `Quark Drive`（裸 44 / `ability:` 30）                                                                                       | 裸 + `ability:` | ability |
| `Orichalcum Pulse`（裸 40 / `ability:` 6）                                                                                   | 裸 + `ability:` | ability |
| `Slow Start`（裸 10 / `ability:` 5）                                                                                         | 裸 + `ability:` | ability |
| `Misty Terrain`（`-fieldstart` `move:` / `-fieldend` 裸）                                                                    | 裸 + `move:`    | move    |
| 另外 9 個（`Wide Guard` `Substitute` `Quick Guard` `Safeguard` `Sand Tomb` `Fire Spin` `Whirlpool` `Attract` `Infestation`） | 裸 + `move:`    | move    |

**決定：不帶。** 三個理由，全部是量出來的：

1. **前綴不是命名空間的函數，是「Showdown 哪一段程式碼送出這一行」的函數。** 15 個名稱
   兩種寫法都有，其中 4 個是特性 —— 也就是這張票的正題。若把「只查 log 說了命名空間的
   那些」當規則，`Protosynthesis` 會在 71 次出現時是中文、108 次出現時是英文。**同一個
   效果在相鄰兩列讀起來不一樣，比一律英文更糟。**
2. **前綴買到的資訊，dex 已經全部給了。** 那 15 個裡每一個，dex 都只給一個命名空間
   （表格最右欄），所以「前綴說是特性」與「dex 說只可能是特性」是同一個答案。而
   **log 說的命名空間與 dex 不符是 0 次**（118 個相異字串、`[from]` 的 108 個相異帶前綴
   值，兩邊都是 0）。
3. **dex 唯一判不出來的那個 id，log 也從來不說。** `confusion` 是 condition 混亂也是招式
   念力，1546 份語料裡它出現 87 次（`-activate` 35、`-start` 35、`-end` 17）
   **全部是裸的**。所以「帶前綴」對它一個字都幫不上。

代價那一側 ADR-0015 已經記過（`TimelineEvent` 公開型別多一個欄位、`parse-timeline` 的
committed snapshot 要動、`RowNote.params` 要多帶一個不是給 `t()` 看的鍵），這次不必付。
**`packages/replay-parser` 在這張票裡一行都沒有改。**

**取而代之的是 message key。** 那條鏈要知道「這是什麼種類的識別字」，而
`rowMessage.ts` 的 key 就是答案：key 是從協定行的**行別**推導的（`-ability` → `ability`、
`-enditem` → `lostItem`、`-weather` → `weather`、`-fieldstart` → `fieldEffectStarted`），
而行別不會說謊。前綴會不會出現是隨機的，行別不是。所以查表的分派表以 key 為鍵，
不以參數形狀為鍵 —— `weather`、`fieldEffectStarted`、`effectHeld` 從形狀上看一模一樣，
卻要三種不同的查法。

### 一個例外：`[from]` 的命名空間本來就在，所以就讀它

這是量的時候才發現的、而 ADR-0015 沒有講的事：解析器的 `effectNameOf` 剝前綴，但
**`sourceOf` 不剝** —— 它把整個欄位原樣交出來，所以 `HealthChange.from` 是
`"item: Life Orb"` 而不是 `"Life Orb"`。

```
=== [from]（1546 份）
出現次數：帶命名空間 7,833，裸的 4,924
相異值 136：ability 56、move 32、item 19、pokemon 1、裸 28
log 說的命名空間與 dex 不符：0
```

所以 `sourceDisplayName` 是**唯一一個讀 log 自己的命名空間**的接縫，而它讀得起
——「不從解析器帶出來」與「用已經帶出來的那一個」不衝突，前者說的是不要新增欄位。

**裸的 `[from]` 走場上狀況那條鏈的頭**（見下節），理由也是量的：28 個裸值裡 dex 判為歧義
的只有兩個，`Sandstorm`（天氣傷害，869 次）與 `confusion`（9 次），**兩個都不是「某隻用了
那個招式」**。其餘裸值是招式（`Grassy Terrain` 484、`Parting Shot` 275、`U-turn` 84…）
或沒有名字的機制值（`Recoil` 899、`drain` 491、`brn` 818、`psn` 572、`lockedmove` 43、
`recoil` 14、`stealeat` 2、`gem` 1）。

還有一個 log 送、而 `effectNameOf` 根本沒在剝的第四個命名空間：**`pokemon:`**
（`[from] pokemon: Mimikyu-Busted`，14 次）。它是物種名，ADR-0014 的表已經回答得了，
所以順手接上。

### 查表的鏈：場上狀況 → 招式 → 特性 → 英文 → raw id

票上寫的是「招式 → 特性 → 手寫的場上狀況表」。**實測之後順序反了一半，而那一半是重點。**

`effectDisplayName`（裸的效果字串，`-singleturn` / `-activate` 那一批）
= **招式表 → 特性表 → 英文**。

- `Toxic Debris`、`Supreme Overlord`、`Protosynthesis`、`Quark Drive`、`Illusion`
  這些 #102 的白名單客戶，第二段就接到了。
- **加上特性表沒有帶來任何新的歧義**：`gen-ambiguous-move-ids.mjs` 實測「招式 id 與特性
  id 相撞」是 **0** 個（研究筆記與該產生器的輸出都是這個答案），所以「招式優先」這個順序
  在真實資料上永遠不會被行使。測試裡有一條釘住它沒有被反過來寫。
- 歧義守衛不變：dex 對同一個 id 給出多於一個命名空間就原樣退回英文。

`fieldConditionDisplayName`（天氣列、`fieldEffectStarted` / `fieldEffectEnded`、
`sideEffectStarted` / `sideEffectEnded`、FieldBar 的 `screens` 與 `fieldEffects` chips、
以及裸的 `[from]`）= **天氣狀態表 → `effectDisplayName`**。

天氣狀態表在前面，而且**只有場上狀況這幾個接縫到得了它**。理由是官方有兩個不同的字：

| id          | 場上狀態（Showdown `default.ts` 的 `weatherName`） | 招式名（PokéAPI / Showdown `moves.ts`） |
| ----------- | -------------------------------------------------- | --------------------------------------- |
| `snowscape` | **下雪**                                           | 雪景                                    |
| `raindance` | **下雨**                                           | 求雨                                    |
| `sunnyday`  | **大晴天**                                         | 大晴天（同）                            |
| `sandstorm` | **沙暴**                                           | 沙暴（同）                              |

兩邊都是官方字串，但天氣列說的是狀態。**8 個天氣 id 全部也是招式 id**，所以
`effectDisplayName` 的歧義守衛把它們全部拒掉 —— 這正是 ADR-0015 說的「守衛讓那條路實際上
走不通」，而天氣狀態表就是走得通的那一條。**這是票上「只有手寫表才命中」那個驗收案例的
實體**（`fieldConditionDisplayName('Snowscape') = 下雪`，而
`moveDisplayName('Snowscape') = 雪景`、`effectDisplayName('Snowscape') = Snowscape`，
三條斷言並排寫在 `test/nuxt/battle-terms-locale.spec.ts` 裡）。

場地、房間、我方狀況**沒有自己的名字**：Showdown 的 `default.ts` 只給它們句子
（`electricterrain: { start: "  腳下電流飛閃！" }`），沒有 name 欄位。所以它們落到招式表，
而招式名是唯一存在的官方字串、也是對的那一個（`戲法空間`、`精神場地`、`反射壁`、`光牆`、
`順風`）。

**票上設想的「手寫的場上狀況表」實際上是空的。** 需要人寫的值只有 `none`（天氣結束）
與 `Recoil` / `drain` / `flinch` 這類機制值，而它們**不是名字，是文案** —— 官方對它們
只有句子（研究筆記 §7）。所以 `none` 走 `battle.event.weatherCleared` 這個語系鍵
（`timelineRows.ts` 依值選 key，與 `statRose` / `statFell` 同一個做法），其餘的一律退回
英文並列在把關測試的白名單裡。

### 資料來源與涵蓋率

順位沿用 ADR-0014 / ADR-0015，不重議：**PokéAPI 的繁中 `*_names.csv`（`local_language_id = 4`）
是量產來源，Showdown 上游 `data/text/zh-tw/` 只補 PokéAPI 沒有的 id。** Showdown 的名稱
就是 PokéAPI 的投影（`data/text/README.md`：`sourced from PokeAPI/pokeapi commit c0a9bc75`），
所以**兩者一致不是交叉驗證，是同一份資料被數了兩次**。

| 表           | 來源                                   | 實測輸出   | dex 涵蓋率  | 第九世代     |
| ------------ | -------------------------------------- | ---------- | ----------- | ------------ |
| 特性         | PokéAPI 310 + Showdown 8               | **318 筆** | **316/316** | **310/310**  |
| 道具         | PokéAPI 521 + Showdown 1               | **522 筆** | 522/580     | **249/249**  |
| 天氣狀態名   | Showdown `default.ts` 的 `weatherName` | **8 筆**   | 8/8         | 8/8          |
| 能力值名     | Showdown `names.ts` 的 `StatNames`     | **8 筆**   | —           | 7/7 可變化的 |
| 太晶屬性     | Showdown `names.ts` 的 `TypeNames`     | **19 筆**  | —           | 19/19        |
| **狀態代碼** | **沒有來源**                           | **不做表** | —           | —            |

```
$ pnpm --filter web gen:ability-names-zh-hant
wrote 318 zh-Hant names to ability-names-zh-hant.json (310 from PokéAPI, 8 filled in from Showdown)
covers 316 of the dex's 316 abilities

$ pnpm --filter web gen:item-names-zh-hant
wrote 522 zh-Hant names to item-names-zh-hant.json (521 from PokéAPI, 1 filled in from Showdown)
covers 522 of the dex's 580 items
left to the English fallback: Absolite Z, Barbaracite, …, Staraptite, …, PSN Cure Berry

$ pnpm --filter web gen:battle-terms-zh-hant
wrote 8 weather state names, 8 stat names and 19 type names from Showdown's zh-tw text
```

道具落空的 58 筆是 **46 顆 Champions 世代的 Mega 石**（`Staraptite`、`Glimmoranite`…，
兩個來源都沒有）加 **12 個第二世代的果實與飾品**（`Gold Berry`、`Pink Bow`…）。
`Staraptite` 與 `Glimmoranite` 實測會出現在畫面上，所以這是**已知缺口而不是 bug**：
退回英文，不猜。

#### 兩個表的 domain 不一樣，而那是量出來的

特性表的 domain 是**兩個來源給了名字的所有 id**，不是 dex 的特性清單。理由：
實測 1803 份 replay，log 送 `|-ability|…|As One` **245 次**，而 `asone` **不是
`@pkmn/dex` 有的 id** —— Showdown 把那一個官方特性拆成 `asoneglastrier` 與
`asonespectrier`。以 dex 為 domain 會把畫面真正需要的那個名字丟掉。PokéAPI 有 `as-one`
那一列（`人馬一體`），走英文名 join 就進來了。

道具表**不能**這樣做：PokéAPI 的 `item_names.csv` 涵蓋整個道具目錄（招式學習器、信件、
活動門票），兩個來源的聯集是 **2055 筆**，對上真正能出現在對戰 log 裡的 580 個。實測
1546 份 replay 裡 76 個相異道具**全部是 dex 有的 id**，沒有 `As One` 的對應案例。所以
道具表的 domain 是「dex 的道具 ∪ Showdown 檔案自己的 id」，522 筆而不是 2055 筆 ——
1500 筆招式學習器的名字是白花的 bundle。

#### 能力值與太晶屬性從來源產生，不手寫 —— 這是與票上的計畫不同的地方

票上寫「狀態、能力變化、太晶屬性的表小到不值得進產生器，直接寫在 locale 檔裡」。
實測之後只有**狀態**該那樣做，另外兩個不該：Showdown `names.ts` 的 `StatNames` 與
`TypeNames` 是官方全譯（含 `stellar = 星晶`），手寫等於用眼睛抄 34 個官方字串，
而**抄錯與決定在 diff 上長得一模一樣**，沒有任何測試分得出來。產生它們的代價是一支
產生器，回收的是「這 34 個字都有出處，而且重跑會逐位元組重現」。

（`StatNames` 另外帶一個 `stats: "能力"`，上游註解說明它是句子裡的「能力」而不是某個
能力值的名字，所以產生器只取 `-boost` / `-unboost` 行能送出的那 8 個 id。）

#### 狀態代碼：官方真的沒有，所以留 Showdown 的識別碼

這一條是**明文的不做**，而且是第一手證據：

```
$ curl .../data/text/zh-tw/names.ts | sed -n '/StatusNames/,/};/p'
export const StatusNames: { [id: string]: TranslationString } = {
	brn: null, // NEEDS TRANSLATION
	par: null, // NEEDS TRANSLATION
	slp: null, // NEEDS TRANSLATION
	frz: null, // NEEDS TRANSLATION
	psn: null, // NEEDS TRANSLATION
	tox: null, // NEEDS TRANSLATION
	fnt: null, // NEEDS TRANSLATION
	confusion: null, // NEEDS TRANSLATION
};
```

PokéAPI 的 `move_meta_ailment_names.csv` 繁中 **0 筆**。遊戲本身不用名詞講狀態，它講句子
（`default.ts`：`brn.start = "{POKEMON}被灼傷了！"`），而句子塞不進 `StateChips.vue` 的
chip。**所以 `brn` / `par` / `slp` / `frz` / `psn` / `tox` 與 `confusion` 在中文畫面上
仍然是 Showdown 的識別碼。**

這**沒有滿足這張票的一條驗收條件**（「zh-TW 下狀態 chip …… 顯示中文」）。取捨是明擺的：
唯一能讓那一格變中文的辦法是自己翻一個，而那正是 ADR-0014 存在的理由要拒絕的東西 ——
使用者無從分辨那個字是不是官方的。`仆刀將軍` 是那個失敗模式的現成標本。**缺得誠實比
錯得漂亮好。**

`confusion` 因此也仍然是 #102 留下的那個缺字而不是錯字：歧義守衛把它從「被念力擋下」
改回「被 confusion 擋下」是對的，而**混亂這個狀態的官方中文字不存在**，不是等下一張票。

#### 這一次有 oracle，但只有一半

ADR-0015 最重要的不對稱是「招式沒有任何權威可以驗」。**特性有**：官方台灣寶可夢圖鑑的
列表頁除了 1025 隻物種之外，還帶著特性名，key 是英文名小寫
（`{"pokemon_ability_id":"adaptability","pokemon_ability_name":"適應力"}`）。

```
$ pnpm --filter web verify:ability-names-zh-hant
compared 280 of the table's 318 abilities against https://tw.portal-pokemon.com/pokedex/: 0 deviate, 0 absent from the table
```

**280 筆，0 筆偏差。** 所以不需要 override 表（物種那邊有一份，因為那邊有 2 筆偏差）。

三件要誠實說的事：

- **是 280 而不是 281。** 研究筆記同一天記的是 281，今天實測 280（頁面 523,053 bytes，
  筆記記的是 543,592）。**頁面自己會動**，所以驗證器的下限壓在 250 而不是釘死 —— 釘死會
  讓「TPC 發佈了一個新特性」變成紅燈。
- **它只覆蓋 280/318。** 蓋不到的 38 筆包含 Showdown 補的那 8 筆
  （`asoneglastrier`、`embodyaspect*`…），也就是**最需要被驗的那一批沒被驗到**。
- **道具與招式完全沒有 oracle。** 那個頁面裡 `pokemon_item_id` 與 `pokemon_move_id`
  各出現 0 次（實測）。

它仍然是**驗證器不是資料來源**（ADR-0014 §3.2：使用條款明文禁止拷貝、散佈），所以那
280 個字串一個都沒有進 repo，而且**刻意不在 unit test 裡** —— `vp run -r test:unit` 必須
是 hermetic 的。頁面的抓取與解析從 `verify-species-names-zh-hant.mjs` 抽到
`scripts/tw-pokedex.mjs`，兩支驗證器共用它，所以**同一個頁面只有一份 fetcher**。

#### 兩個上游的 ref 都 pin 住

新的三支產生器都 pin sha（PokéAPI `c8dbd727…`、Showdown `2f5b2739…`，與 ADR-0015 的招式
表同一組）。理由不變：「重跑會產出已經 committed 的那一份」這個承諾在抓 `master` 的前提下
是假的，而 PokéAPI 的繁中欄位在 2026-08-25 之前有簡化字。

**byte-stability 實測**：五張表各連跑兩次，`diff` 全部相同。

> `gen-species-names-zh-hant.mjs` 仍然抓 `master`，這張票**沒有動它** —— 那是 ADR-0014
> 的決定，另案追蹤。

### 接縫：`battleTerms.ts`，而 `effectDisplayName` 從 `moveName.ts` 搬了過來

ADR-0015 寫著「那條鏈的位置在這裡（`moveName.ts`），不在元件裡」。前半對，後半的「這裡」
在鏈長出特性表與天氣表之後就不成立了 —— 那個檔案叫 moveName。所以

| 檔案                              | 內容                                                                                                                                                                        |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/shared/utils/moveName.ts`    | `moveDisplayName` 一個函式（招式名就是招式名）                                                                                                                              |
| `app/shared/utils/battleTerms.ts` | 五張表，加上 `abilityDisplayName` / `itemDisplayName` / `statDisplayName` / `teraTypeDisplayName` / `effectDisplayName` / `fieldConditionDisplayName` / `sourceDisplayName` |

依賴是單向的（`battleTerms` → `moveName` + `speciesName`），沒有環。#102 寫在
`test/nuxt/move-locale.spec.ts` 裡關於效果接縫的斷言**留在原地**，只改 import ——
那些斷言仍然在守它們原本要守的東西。

**所有查表的英文 fallback 都是「原樣回傳參數」**，因為 log 給的已經是英文名。查不到不是
空白、不是猜測。`sourceDisplayName` 多一條：查不到時回傳**整個原字串（含命名空間前綴）**,
這既讓 en 逐位元組不動，也是 zh-TW 該有的答案 —— 把 `item: Staraptite` 半剝成
`Staraptite` 會丟掉那一行僅剩的資訊。

### 把關測試就是驗收測試

`app/features/timeline/test/name-coverage.spec.ts` 從 3 個類別長到 **13 個**，走同樣的
9 份 committed fixture，而且新增了 `fieldSnapshots` 那一段 —— **FieldBar 的 chips 不在
任何一列上**，只走 rows 的話它們永遠不會被檢查到（ADR-0015 列的第 4 個洞就是這樣漏的）。

實測（`pnpm --filter web exec vitest run app/features/timeline/test/name-coverage.spec.ts`，
1530 列、201 個 field snapshot、61 條斷言）：

| 類別                              | 相異字串 | 畫面上是中文 | 留英文                       |
| --------------------------------- | -------- | ------------ | ---------------------------- |
| 招式列自己的名稱                  | 77       | 77           | —                            |
| 單回合效果 / 被擋下               | 9        | 8            | `confusion`                  |
| 我方場地效果展開／結束            | 4        | 4            | —                            |
| 全場效果展開／結束                | 2        | 2            | —                            |
| 天氣                              | 2        | 2            | —                            |
| 特性發動列                        | 3        | 3            | —                            |
| 失去道具列                        | 4        | 4            | —                            |
| `[from]` 的來源                   | 12       | 8            | `Recoil` `brn` `drain` `psn` |
| 無法行動的原因                    | 1        | 0            | `flinch`                     |
| 能力值名                          | 6        | 6            | —                            |
| 太晶屬性                          | 2        | 2            | —                            |
| FieldBar 的 screens / field chips | 6        | 6            | —                            |
| 狀態 chip                         | 4        | 0            | `brn` `par` `slp` `tox`      |
| **去重後的聯集**                  | **113**  | **104**      | **9**                        |

留英文的 9 個就是 `EXPECTED_GAPS`，**每一個都是「官方沒有這個名詞」而不是「表還沒補」**。
#102 的三個白名單客戶：`Supreme Overlord` 與 `Toxic Debris` 被特性表接走了，`confusion`
留著。

**「字對不對」那一半改了形狀。** #102 的版本問「凡是被改寫的字串，dex 必須認為它只是
招式」—— 加了特性、道具、天氣、能力值之後那條斷言必然紅。取而代之的是兩問：

1. **每個類別只准從它自己的表拿名字。**「畫面上被改寫成的那個字串，必須是這個類別允許的
   表裡的某個值。」查表接錯線（把道具接到特性表）在涵蓋率報表上與接對了長得一模一樣，
   這條看得到。
2. **log 沒說命名空間的那幾個類別，才問 dex。** 天氣、特性列、道具列、能力值、太晶屬性、
   `[from]` 的行別本身就把命名空間定了，dex 在那裡沒有有用的意見（`Ice` 是道具、
   `Psychic` 是招式 —— 太晶屬性那一格問 dex 只會得到噪音）。**裸的效果字串那一個類別
   照舊問**，而且那是唯一真的有風險的地方。

另外兩條沿用：`EXPECTED_GAPS` 不准過期（實測有效 —— 我從大語料帶進來的 `frz`、
`fallen5`、`recharge`、`none` 四個，這條當場抓出來，因為這 9 份 log 沒有它們），
以及每個類別「en 逐字不動」。

**一件實測到的事：`-start` / `-end` 兩種行解析器根本沒讀**（`timeline.ts` 只有
`-singleturn` 與 `-activate`）。所以 `Encore`、`perish3`、`typechange`、`fallenN`、
`protosynthesisspe` 這些大語料裡很多的字串**永遠到不了畫面**。它們不在白名單裡，
而且不該在。

### bundle：靜態 import，不切

```
ability-names-zh-hant.json   318 entries  raw  9,288 B  gzip  4,478 B
item-names-zh-hant.json      522 entries  raw 16,644 B  gzip  6,102 B
weather-names-zh-hant.json     8 entries  raw    212 B  gzip    172 B
type-names-zh-hant.json       19 entries  raw    383 B  gzip    261 B
stat-names-zh-hant.json        8 entries  raw    165 B  gzip    134 B
                                   合計   raw 26,692 B  gzip 11,147 B
四張大表全部（含物種與招式）        raw 91,233 B  gzip 37,938 B
```

研究筆記 §8.2 估這三張表約 10KB gzip，**實測 10.9KB**。ADR-0015 估四張全部約 35KB gzip，
**實測 37KB**。決定與 ADR-0015 一字不改：**靜態 import，不做按語系 lazy load**，
理由同樣是 11KB 換不到那條非同步邊界與它的載入狀態。**不再往下做。**

## 後果

- **en 一字未變。** `localised-names.spec.ts` 新增的
  `the rest of the vocabulary in en` 把 8 種列的輸出逐字釘死
  （`Regenerator`、`lost its Life Orb`、`weather · Snowscape`、`weather · none`、
  `Trick Room up`、`atk +1`、`terastallized Fire`、`100% → 90% item: Life Orb`），
  加上 FieldBar 的 chips，再加上把關測試每個類別的「en 逐字不動」。
- **`packages/replay-parser` 完全沒有被碰到。** 這是「不帶命名空間」那個決定的直接後果：
  `TimelineEvent` 的公開型別沒變，`parse-timeline` 的 committed snapshot 一個位元組都沒動。
- **`timelineRows.ts` 只多了一個依值選 key 的分支**（`none` → `weatherCleared`）。
  row model 其餘部分不變，`TimelineRow` 仍然帶 log 給的英文識別字，本地化只發生在元件裡。
- **兩個新的語系鍵是文案而不是名字**：`battle.event.weatherCleared`（天氣結束）與
  `battle.drawer.tera`（chip 上的「太晶」二字，本來硬寫成英文 `Tera`）。
  `battle-terms-locale.spec.ts` 有一條守著**產生出來的名字不會流進語系檔**。
- **`vp run -r test:unit` 沒有新增任何網路依賴。** 三支產生器與新的驗證器都是手動動作，
  量測用的 1803 份 replay 沒有進 repo，把關測試用的是 committed fixture 加
  devDependency 的 `@pkmn/dex`。
- **狀態 chip 仍然是英文，而這是決定。** 見上面「狀態代碼」那一節；這是這張票唯一一條
  沒有滿足的驗收條件，理由是官方沒有那個字。

### 與 #110 的交界

#110 正在把兩支產生器重複的 CSV 讀取器合成一份
（`apps/web/scripts/pokeapi-csv.mjs`，匯出 `splitRow` / `parseCsv` / `fetchCsv(base, name)`）。
那個分支還沒進 `main`，而這張票的兩支產生器要讀 PokéAPI 的 CSV，所以：

- **`scripts/pokeapi-csv.mjs` 在這個分支上也被建立了**，API 與 #110 說的逐字相同
  （`fetchCsv` 收兩個參數，base URL 是參數，好讓每支產生器各自 pin ref）。
  兩邊都新增同一個檔案，merge 時會衝突，**解法是採用 #110 的版本** —— 這張票依賴的
  只有那三個 export 的形狀。
- **`gen-move-names-zh-hant.mjs` 這張票一行都沒有改**，它自己的 `splitRow` 留在原地由
  #110 移除。
- Showdown 的 TypeScript 掃描器同理抽成 `scripts/showdown-text.mjs`（三支新產生器共用），
  而 `gen-move-names-zh-hant.mjs` 的那一份**刻意留著沒有合過來** —— 那個檔案正在被 #110
  改，多一個衝突換不到什麼。這是一筆明知的重複，記在這裡而不是留在原始碼裡。

## 替代方案

- **把命名空間從解析器帶出來，只查 log 說了命名空間的那些。** 上面第一節就是它的帳：
  15/118 個名稱兩種寫法都有，所以同一個效果會時中時英；而前綴買到的資訊 dex 全部已經給了
  （不符 0 次），dex 判不出來的那一個 log 又永遠不說。
- **把狀態 chip 翻成中文**（灼傷／麻痺／睡眠／冰凍／中毒／劇毒／混亂）。這些字在中文玩家
  之間確實通用，但**沒有一份官方來源給出它們**，而使用者無從分辨畫面上哪些字是官方的。
  ADR-0014 的整個立場就是拒絕這個。
- **能力值與太晶屬性手寫進語系檔**（票上的計畫）。34 個字用眼睛抄，抄錯與決定在 diff 上
  沒有分別。有來源就從來源產生。
- **道具表收兩個來源的聯集**（與特性表一致）。2055 筆對 522 筆，多出來的 1500 筆是招式
  學習器與活動門票，永遠不會出現在對戰 log 裡。一致性不值 1500 筆 bundle。
- **假造一個道具／招式的 oracle**（爬 wiki、簡繁轉換）。ADR-0015 已經拒絕過，理由不變。
- **等官方補上狀態名詞再做這張票。** 沒有任何跡象會出現，而其餘 104 個識別字今天就能讀。

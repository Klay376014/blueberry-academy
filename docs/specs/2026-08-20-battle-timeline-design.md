# 對戰流程時間軸 — 設計文件

- 日期：2026-08-20
- 狀態：已定案，待實作
- 相關文件：[replay 分析主設計](2026-08-16-replay-analytics-design.md)、[CONTEXT.md](../../CONTEXT.md)、[實作守則](../../AGENTS.md)
- 實作票：A/B/C 三張 GitHub issue，A 可獨立進行

這份文件記錄「為什麼」。實作步驟見 GitHub issues，領域詞彙見 CONTEXT.md。

---

## 1. 目標

讓使用者在站內把一場 replay 的**過程**掃過一遍，而不必到 Showdown 上拖進度條。

Showdown 的 replay 播放器是為了重現對戰而設計的：一次一個動作、附動畫、要等。想知道
「第 3 回合到底發生了什麼」得從頭播或反覆拖曳。站內的時間軸走相反的路 —— **一次把整場
攤平**，逐回合、逐動作列出，配合圖示讓人一眼掃過節奏。想看動畫時再跳回 Showdown。

這是主設計文件之外的**第 5 個視角**，不在 MVP 範圍。優先序：解析器（A 票）現在做，
前端（C 票）排在 #17 之後。

### 明確不做的事

**因果歸屬。** 時間軸只把 log 的行對齊到回合並重排，不推論「這 68% 是誰造成的」。
實測證實招式傷害的 `|-damage|` **不帶** `[from]`，唯一的歸屬方式是「往前找最近一個
`|move|`」—— 那是一條會在範圍招、反傷、同回合連續事件上出錯的規則，而它正是
主設計文件 §6「MVP 不做 KO 歸因」拒絕過的東西。

後果是畫面比較鬆散：`Sacred Sword` 一行，`Iron Hands 100% → 32%` 下一行，
而不是 `Gholdengo → Iron Hands  Sacred Sword  -68%`。**這是刻意接受的取捨。**

**時間軸不進資料庫。** 它是從 Storage 的 raw log 現解出來的衍生資料，開抽屜時才算一次。

---

## 2. 硬點（皆為實測，非預想）

以下觀察全部來自 `packages/replay-parser/test/fixtures/` 的七份真實 replay，
共 2307 行、58 種不同的訊息型別（Showdown 完整協議約 120 種）。

1. **`|-damage|` 給的是「剩多少」，不是「扣了多少」。** 實測
   `|-damage|p2b: Gholdengo|90/100`。要顯示差值必須自己記住前一個值，
   所以解析器得維護一份場上 HP 狀態。

2. **HP 欄位不是純數字。** 實測有 `93/100 brn`（附狀態）、`0 fnt`（倒下）、
   以及一行語意不明的 `50/100g`。只能取斜線前的數字，其餘容錯略過。

3. **公開 replay 兩邊都是百分比**（`x/100`），不是絕對值，所以不需要 maxhp。

4. **綽號是常態，不是例外。** 事件行只帶綽號：`|-damage|p2a: nothing new there|38/100`
   完全看不出是哪隻。物種只在該位置最近一次 `|switch|` 的第 2 欄出現過。平手那份
   fixture 有 39 行綽號。**解析器必須自己維護「場上位置 → 物種」的對照。**

5. **範圍招的目標 log 說得出來。** `|move|p1b: Garchomp|Earthquake|p2a: Basculegion|[spread] p2a,p2b`，
   實測 12 行。這不是推論，是 log 自己講的，所以可以放心用。

6. **`[from]` 標出了非招式傷害的來源。** 實測 `[from] brn`、`[from] item: Life Orb`、
   `[from] ability: Regenerator`。招式傷害沒有這個標記 —— 見「明確不做的事」。

7. **`[silent]` 的行 Showdown 自己也不顯示**，不該出現在畫面上。

8. **行序就是執行序。** 速度已由伺服器解算完畢，解析器不必也不該自己排先攻後攻。

9. **每回合帶 `|t:|` unix timestamp**（實測 217 行）。相減就是該回合的思考時間，
   這是 Showdown 自己不顯示、而攤平視圖能給的東西。

10. **Illusion 讓畫面上的名字是假的。** `|-end|...|Illusion` 與 `|replace|` 之前，
    那個位置顯示的是被冒名的那隻，對手當時也是這樣被騙的。

---

## 3. 設計

### 介面

```ts
parseTimeline(log: string): BattleTimeline
```

與 `parseReplay` **完全獨立**，各自 `tokenizeLog` 一次。兩者在不同時間點被呼叫 ——
`parseReplay` 在匯入時跑上千次，`parseTimeline` 在使用者開抽屜時跑一次 —— 合成一個函式
只會逼匯入路徑做它不需要的工。

`BattleTimeline` 頂層**只有 `turns`**。抽屜標頭要的「vs 誰、勝負、format」在 `battles`
列裡已經有了；讓 timeline 也帶一份等於同一個事實有兩個來源，而它們會不一致 ——
DB 那份是匯入當時的解析結果，timeline 這份是現在解的。單一真實來源是 DB 列。

### 事件流是扁平的

每個回合是一串扁平的事件，每個事件帶 `actor` 與 `targets`；群組與排版交給 UI。

巢狀結構（`Action { move, results: [] }`）等於把「哪些結果屬於這個招式」這條歸屬規則
烘進型別裡，之後想改就得改型別。扁平的話，歸屬始終是 UI 的顯示決定，不是資料的性質。

### 未知的型別要保留，不能丟

只解析畫面要用的型別：`move`、`switch`/`drag`/`replace`/`swap`、`-damage`/`-heal`、
`faint`、`-terastallize`/`-mega`/`detailschange`/`-formechange`、`-crit`/`-supereffective`/
`-resisted`/`-immune`/`-miss`/`-fail`、`-status`、`-weather`、`-boost`/`-unboost`、`cant`、
`-singleturn`/`-activate`、`-sidestart`/`-sideend`、`-enditem`、`-ability`、`-mustrecharge`。

其餘一律保留為 `{ kind: 'unknown', raw }`，UI 預設不顯示。理由與 gametype-agnostic
同一條：**不認得的東西要留著而不是消失**，否則 Showdown 加一種訊息、使用者就少看到一段，
而「這回合怎麼空了」是不可追查的 bug。

`cant`（麻痺、畏縮、飽了）在清單裡，因為它是「這隻這回合什麼都沒做」的唯一解釋；
少了它，畫面上會有一個無故消失的行動。

**這份清單在實作後依實測擴充過一次。** 拿一場全新的天梯 replay 試跑，132 個事件裡有
31 個落進 `unknown`，其中 `-activate`（守住擋下攻擊）、`-singleturn`（守住生效）、
`-sidestart`/`-sideend`（光牆、反射、順風）、`-enditem`（吃樹果）、`-ability`（特性發動）、
`-mustrecharge`（破壞光線後的硬直）**都是 Showdown 畫面上真的會顯示的東西**。少了它們，
畫面會出現「A 使出寄生種子 → 然後什麼都沒有」這種看起來像招式憑空消失的段落。
補進去之後同一場的 `unknown` 從 31 降到 11，剩下的是 `poke`/`player`/`rule`/`upkeep`/
`j`/`l` 這些本來就不該顯示的。

`swap`（Ally Switch）與 `-formechange`（Aegislash、Mimikyu、Morpeko 的型態切換）也不在
原始清單上，但它們**會改變場上狀態** —— 不讀的話後續事件會掛到錯的那隻身上，或整場
繼續叫它 Aegislash-Shield。這兩個是 code review 抓出來的。

### 顯示名：物種與綽號都給

事件同時帶物種與綽號，UI 預設顯示物種。綽號對**自己的**隊伍反而比物種好認
（`did you calc that?` 一看就知道是哪隻），對手的綽號則毫無資訊 —— 兩個都給，
UI 才有得選；只給物種的話這個選擇權就永久關掉了。

### 形態顯示當下的，不還原

簽章一律還原成 base species（`scrafty`），但畫面上第 2 回合 Mega 之後那隻**就是**
Scrafty-Mega。這正是 timeline 與 `ParsedBattle` 的分工：

|            | `ParsedBattle`                          | `BattleTimeline`                |
| ---------- | --------------------------------------- | ------------------------------- |
| 回答的問題 | 這是誰的哪支隊、結果如何                | 當時畫面上發生了什麼            |
| 形態       | 還原成 base species（同一隻不能算兩次） | 顯示當下形態（Mega 就是發生了） |
| Illusion   | 把冒名者從 bring 撤掉，只留真身         | 保留當時的假名，另附真身        |
| 去向       | 寫進 `battles` 各欄位                   | 不進 DB，開抽屜時現解           |

`battle-only-formes.ts` 那張還原表在 timeline 這條路徑上完全不該被呼叫。

### HP 狀態綁在場上位置

差值要靠前後相減，但綽號會重複、Illusion 會騙人，所以狀態綁**位置**（`p1a`），
每次 `switch`/`drag`/`replace` 用該行自己帶的 HP 重設。`|switch|` 本來就帶當前 HP
（`|switch|p1a: Scrafty|Scrafty-Mega, L50, F|93/100 brn`），所以換下場再換回來不需要記憶。

### Illusion 保留當時的謊言

`|replace|` 之前那個位置的事件**不回頭改寫**，而是另帶真身欄位。

timeline 要回答的是「當時發生了什麼」，而當時發生的事情就包含「你以為那是 Whimsicott」。
改寫成真身會抹掉這場對戰最關鍵的一個資訊；但只留假名又會讓「Whimsicott 為什麼會用不該會的招」
變成無解的畫面。兩個都輸出。

### 開場是第 0 回合

`|turn|1` 之前的 `|switch|` 放進 `turns[0]`，`number` 為 0。UI 一路 `v-for` 印下去即可；
另開一個 `lead` 欄位會讓開場變成模板裡的 `v-if`。

### 壞掉的 log 回傳部分結果

截斷或損毀時解出多少算多少，不丟例外。與主設計 §8「批次匯入永不整批失敗」同精神：
timeline 是唯讀展示，半條時間軸仍然有用；而真正壞掉的 log 在匯入時就已經被
`parse_error` 記錄過了。

### `PARSER_VERSION` 不涵蓋 timeline

timeline 不進 DB，改它不影響任何已存的列。`PARSER_VERSION` 只涵蓋寫進 `battles` 的欄位，
這一點要寫在 `src/version.ts` 裡 —— 否則每次調時間軸都會觸發一次沒必要的全量 re-parse。

---

## 4. 前端

### 進入點：儀表板上的抽屜

儀表板新增「最近對戰」列表區塊，點一列開 shadcn-vue 的 Sheet，不換頁。抽屜狀態綁在
`?battle=<replayId>` query 上 —— 網址仍可分享、上一頁可關抽屜，等於補回專屬 route 的
兩個好處，代價只是一個 query 參數。

Bo3 的抽屜可切換到同一 `series_id` 的其他 game。

### raw log 的取得

從 Storage 抓 `{user_id}/{replay_id}.json.gz`，用瀏覽器原生的
`DecompressionStream('gzip')` 解壓，不引入解壓函式庫。實測 log 約 5.5–30KB，
gzip 後更小，一次性延遲可接受。

### 圖示：外連 Showdown 的 icon sheet

`play.pokemonshowdown.com/sprites/pokemonicons-sheet.png` 是一張 sprite sheet，用 CSS
`background-position` 定位，一隻 40×30px。零儲存、自動跟上新寶可夢。

代價明列：多一個外部依賴（他們改路徑或擋熱連就破圖）、需要設定 CSP、離線看不到圖。
需要一張 species id → sheet 座標的對照表，與 #22 的 id → 正式英文名共用同一支產生器。

事件語意圖示用已在依賴裡的 lucide（倒下、太晶、換人）。

---

## 5. 測試策略

沿用現有七份 fixture，不新增。它們已經涵蓋 Illusion、Mega、Primal、平手、認輸、
單打、長局（31 回合）與開放隊表 Bo3。

**snapshot 只存一份完整的。** 最短的 Bo3 fixture（5 回合）存完整 snapshot，
其餘用具名斷言（事件總數、某回合的事件序列、某個硬點的行為）。

理由：31 回合的完整事件流 snapshot 約 1500–2500 行，七份加起來上萬行的 `.snap`
沒有人看得動 —— 而看不動的 snapshot 等於沒有審查，改壞了也會被一路 `-u` 過去。
一份看得完的完整 snapshot，加上會失敗的具名斷言，比一萬行的 diff 有效。

未知型別**照原樣**進那份 snapshot。濾掉的話，snapshot 就證明不了「保留了未知型別」
這件事 —— 而它正是最容易在未來某次重構中被悄悄弄丟的性質。

---

## 6. 決策紀錄

| #   | 決策                | 選擇                                  | 否決的替代方案                                |
| --- | ------------------- | ------------------------------------- | --------------------------------------------- |
| T1  | 渲染粒度            | 完整動作流（招式 + 傷害）             | 回合摘要條；關鍵時刻時間軸                    |
| T2  | 解析時機            | 開抽屜時從 raw log 現解               | 匯入時存進 `details` jsonb；兩層混合          |
| T3  | 進入點              | 儀表板抽屜 + `?battle=` query         | 專屬 route `/battles/:replayId`               |
| T4  | 圖示來源            | 外連 Showdown icon sheet              | 打包進 `public/`；只用語意圖示                |
| T5  | 傷害歸屬            | **不歸屬**，純時序兩行                | 規則式歸給最近的 `\|move\|`；歸屬並標記可信度 |
| T6  | 事件結構            | 扁平 `Event[]`                        | 巢狀 `Action { results }`                     |
| T7  | 型別涵蓋            | 只解畫面要用的，其餘保留為 `unknown`  | 全部 58 種都結構化；未知直接丟棄              |
| T8  | A 票範圍            | 完整做，先釘死 `BattleTimeline` 型別  | 縮到只解三種型別；延後到 B 完成               |
| T9  | HP 差值             | 解析器維護狀態並輸出前後值            | UI 自己累積                                   |
| T10 | 版本                | timeline 變更不 bump `PARSER_VERSION` | 一起 bump                                     |
| T11 | 顯示名              | 物種與綽號都輸出，預設顯示物種        | 只給物種；只給綽號                            |
| T12 | 形態                | 顯示當下形態，不還原                  | 一律 base species；base + 標記                |
| T13 | HP 追蹤鍵           | 場上位置，switch 時重設               | 個體（side + 綽號）                           |
| T14 | 範圍招              | `targets: string[]`，單體是長度 1     | `target` + `spreadTargets` 兩個欄位           |
| T15 | 開場                | `turns[0]`，`number` 為 0             | 另開 `lead` 欄位；併進 turn 1                 |
| T16 | 思考時間            | 進 timeline（`turn.startedAt`）       | 不進，YAGNI                                   |
| T17 | snapshot            | 只有最短 fixture 存完整份             | 全部存；只存壓縮摘要                          |
| T18 | 詞彙                | 加進 CONTEXT.md                       | 只寫在 package README                         |
| T19 | Illusion            | 保留當時的假名，另附真身              | 回頭改寫成真身；不處理                        |
| T20 | 未知型別的 snapshot | 照原樣進                              | 序列化時濾掉；只存型別名                      |
| T21 | 函式關係            | 兩個獨立函式，各自 tokenize           | `parseAll(log, meta)`                         |
| T22 | 頂層欄位            | 只有 `turns`                          | 帶 gameType/players/winner                    |
| T23 | 壞 log              | 回傳部分結果，不丟例外                | 丟例外                                        |

---

## 7. 實作票

| 票  | 內容                                              | 相依      |
| --- | ------------------------------------------------- | --------- |
| A   | `parseTimeline`：parser package 的第二個輸出      | 無        |
| B   | `useBattleLog`：從 Storage 取 gzip raw log 並解壓 | #7、#11   |
| C   | 「最近對戰」列表 + 對戰流程抽屜                   | A、B、#22 |

#22（species id → 正式英文名）加做一份 id → icon sheet 座標的對照表，不另開票。

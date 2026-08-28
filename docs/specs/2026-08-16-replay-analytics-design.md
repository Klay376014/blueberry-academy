# Showdown Replay 對戰分析 — 設計文件

- 日期：2026-08-16
- 狀態：已定案，待實作
- 相關文件：[CONTEXT.md](../../CONTEXT.md)、[實作守則](../../AGENTS.md)
- 實作票：GitHub issues #1–#17（`ready-for-agent`），依相依順序執行

這份文件記錄「為什麼」。實作步驟見 GitHub issues，領域詞彙見 CONTEXT.md。

---

## 1. 目標

讓 VGC 玩家把自己的 Pokémon Showdown replay 匯入後，分析：

1. **勝率走向** — 隨時間的勝率曲線、rating 變化、連勝連敗
2. **優勢與劣勢隊伍** — 哪支登錄隊伍表現好，以及每支隊「選出哪 4 隻」的勝率

排在後面（資料模型須預留，MVP 不實作）：

3. 對手 matchup 勝率（「我怕什麼」）
4. 個別寶可夢貢獻度（「哪隻在拖累我」）

### 明確不做的事

**因果歸因。** 分析深度定位在**純敘述統計**，不做「你第 3 回合不該換 Incineroar」這類
規則式或 LLM 歸因。敘述統計嚴格來說回答不了「輸贏主因」，它只能給出強烈暗示
（例如「你帶 Torkoal 的場次勝率 32%，不帶是 58%」）。這是刻意的範圍限制；資料模型
不會因為未來要加歸因而需要重來。

**未登入試用。** 不提供「貼一個連結、不登入看單場解析」的入口。那是一條獨立的無狀態
程式路徑（不寫 DB、不需身分、UI 也不同），為一個沒有明確需求的入口增加維護分支。

---

## 2. 已驗證的外部事實

以下都是實測結果，不是假設。設計高度依賴它們，若日後行為改變需重新評估。

| 事實                                                                                                                                                  | 驗證方式                                                                                                                   | 對設計的影響                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `<replay-url>.json` 回傳 metadata + 完整 log                                                                                                          | 直接 curl 兩個 replay                                                                                                      | 不需要爬 HTML                                                              |
| Showdown replay API **CORS 對所有來源開放**（`access-control-allow-origin` 回應請求來源）                                                             | 帶 `Origin: http://localhost:5173` 請求                                                                                    | **瀏覽器可直接抓取**，是全前端匯入的前提                                   |
| `search.json?user=<id>&page=N` 分頁：offset 為 `50*(page-1)` 但每次取 51 筆 → **相鄰頁重疊一筆**；不滿 51 筆即為最後一頁                              | 比對 page 1 尾與 page 2 首（重疊 1 筆，unique 93 而非 94）；讀 `server/replays.ts:159`                                     | 合併分頁時**必須以 id 去重**；終止條件用「不滿 51」比等 `[]` 少一次請求    |
| `page > 100` 直接回 `[]`；`page=0` 回的不是 JSON                                                                                                      | 讀 `server/replays.ts:158`；實測 page 0 與 100–102                                                                         | 分頁**從 1 起算**；單一查詢上限約 5001 筆，超量須用 `format` 分批          |
| `search.json` 對 `private` 做**精確比對 `= 0`**；`private` 是分級：0 公開 / 1 私人（有 password）/ 2 私人（**無** password）/ 3 已刪除 / 10 autosaved | 讀 `server/replays.ts:41,163`                                                                                              | 非 `private:0` 的場次一律抓不到；`private:2` 連 URL 都取不到               |
| 私人 replay 的取用形式是 `<id>-<password>pw.json`（`pw` 後綴不可省）                                                                                  | 以真實 `private=1` 私人 replay 實測：**未帶任何 cookie** 取得完整 log （`formatid=gen9championsvgc2026regmb`，3424 bytes） | **匯入流程可行**；批次貼連結入口必須能解析帶 `-…pw` 的完整連結             |
| `/api/replays/searchprivate` 可列出自己的私人 replay，但**需 Showdown 登入且回應無 CORS header**                                                      | 未登入回 `]{"actionerror":"Access denied: You must be logged in."}`；三次請求皆無 `access-control-allow-origin`            | **前端無法使用**；`search.json` 的 `private=1` 參數被忽略（byte 比對相同） |
| 不存在的 replay id 回 **HTTP 404 + 空 body**（不是 JSON 錯誤物件）                                                                                    | 請求一個假 id                                                                                                              | 匯入的錯誤處理不能假設失敗回應是 JSON                                      |
| 清單的 `format` 是**顯示名稱**（`[Gen 9] Anything Goes`）；`format_id` 只在單場 `<id>.json` 的 `formatid` 欄位                                        | 對照 `search.json` 與 `<id>.json` 的 keys                                                                                  | `battles.format_id` 只能在抓到單場 JSON 後才填得出來                       |
| `search.json` 另支援 `format=<format_id>`、`username2`、`byRating` 參數                                                                               | 實測 `format` 篩選有效；讀 `server/replays.ts:153`                                                                         | 匯入 UI 可提供選填的賽制篩選以減少抓取量                                   |
| replay 只在**有人執行 `/savereplay`** 或伺服器開 `Config.autosavereplays` 時上傳；隱藏房間**仍會**產生 replay（`private=1` + password）               | 讀 `server/room-battle.ts:872`、`server/rooms.ts:2067`                                                                     | **沒有使用者可及的強制存檔機制**；隱藏場次是「查不到」而非「沒紀錄」       |
| `Config.forcedpublicprefixes`：特定名稱前綴的 **rated** 場次強制公開，免疫 `/modjoin`、`/hideroom`、`/ionext`                                         | 讀 `config-example.js:503`、`room-battle.ts:1118`、`username-prefixes.ts:9,99`                                             | 僅 global staff 可設、**10 天過期**、僅 rated 生效 → **本專案無法利用**    |
| Cloudflare Workers 免費版：**50 subrequest/請求、CPU 10ms**；付費版：10,000 subrequest、CPU 5 分鐘                                                    | Cloudflare 官方 limits 文件                                                                                                | **免費版無法在 server 端做匯入或解析**                                     |
| Workers 兩個方案都只允許 **6 個同時對外連線**；HTTP 請求 **無 wall-clock 上限**                                                                       | 同上                                                                                                                       | 並發上限設 5                                                               |
| `pokemonshowdown.com/users/<id>.json` 只有 `username / userid / registertime / group / ratings`，**無 bio 欄位**                                      | 直接 curl 並列出 keys                                                                                                      | **無法驗證 Showdown 帳號擁有權**                                           |
| 同一支 API 提供官方各賽制 ELO/GXE/勝負場數                                                                                                            | 同上                                                                                                                       | 未來可做「replay 覆蓋率」對帳                                              |
| Vite+ 官方支援 Nuxt（`vp create nuxt` shorthand、`@nuxt/test-utils` 專屬 lint 例外）                                                                  | 讀 `node_modules/vite-plus/docs`                                                                                           | 換 Nuxt 不會破壞現有工具鏈                                                 |

---

## 3. 技術棧

| 層        | 選擇                                                 | 理由                                                                                                                              |
| --------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 前端框架  | **Nuxt**（取代現有裸 Vue 3）                         | 檔案路由、i18n 模組、未來公開分享頁的 SSR、以及升級付費版後現成的 server route。趁專案還只有 3 個 `.vue` 檔時搬遷最便宜           |
| 工具鏈    | **保留 Vite+ (`vp`)**                                | Vite+ 官方支援 Nuxt，無須放棄現有的 lint/fmt/staged 設定                                                                          |
| 渲染模式  | **`ssr: false`（SPA）**                              | 登入後的私人儀表板，SEO 無價值；SSR 渲染含圖表的頁面很可能超過免費版 10ms CPU 上限，導致整站 500。未來可用 route rules 逐頁開 SSR |
| 後端 / DB | **Supabase**（Postgres + Auth + Storage）            | 認證與部署是純成本，外包掉；Postgres 的 JSONB 讓「分析維度還在演化」不必每次跑 migration                                          |
| 登入      | **Google（MVP）→ Discord（後續）**                   | Discord 是寶可夢對戰社群的實質標準，但 Google 覆蓋更廣先做。不開密碼登入                                                          |
| 部署      | **Cloudflare Workers 免費版**（先驗證成效）          | 見下方「免費版的架構後果」                                                                                                        |
| UI        | **Tailwind + shadcn-vue**                            | 資料密集儀表板需要表格/篩選器/下拉/日期範圍/tooltip；shadcn-vue 是複製原始碼進專案，客製時不會撞到抽象牆                          |
| 圖表      | **unovis**                                           | shadcn-vue 的 Chart 元件底層就是它，主題與 tooltip 樣式自動一致                                                                   |
| i18n      | **`@nuxtjs/i18n`，介面英文為主、中文語系檔同步維護** | VGC 一級資料本來就是英文；但 i18n 事後補是惡夢，第一天上幾乎零成本                                                                |

寶可夢 / 招式 / 道具名稱**永遠只顯示英文**，不進 i18n —— 它們是識別碼不是文案。

### 免費版的架構後果（重要）

Workers 免費版的 50 subrequest 與 10ms CPU 限制，**反轉了原本的匯入架構**。

原先選 Nuxt 的理由之一是「server 端保管金鑰、跑批次匯入」。但在免費版前提下：

- Worker 抓不了 1000 場 replay（50 subrequest 上限）
- Worker 連解析一場 log 都很勉強（10ms CPU）
- 瀏覽器**沒有**這兩個限制，而且 Showdown 的 CORS 對它開放
- Supabase 有 RLS，前端拿使用者自己的 JWT + anon key 寫入即可，**不需要 `service_role`**

因此匯入是**全前端**執行的：瀏覽器翻分頁、抓 replay、跑 parser、直寫 Supabase，
Worker 完全不參與。這不只是將就 —— 沒有 subrequest 限制、沒有 CPU 限制、進度回饋
天然即時、失敗重試就在使用者面前。代價是分頁必須開著，這對「一次性灌歷史 + 之後偶爾
同步」的使用模式完全可接受。

日後升級付費版要搬到 server 端時，`parseReplay()` 是同一個 package，搬的只是呼叫端。

---

## 4. 架構

```
packages/replay-parser/          純 TS、零 runtime 依賴、可完全獨立測試
  src/protocol.ts                逐行 tokenize Showdown protocol
  src/replay.ts                  狀態機：重播 log、追蹤場上狀態
  src/summarize.ts               → ParsedBattle
  src/species.ts                 型態還原（Mega/Primal → base species）
  test/fixtures/                 真實 replay 存檔

packages/battle-row/             ParsedBattle → battles 列的對應（純 TS）
  src/index.ts                   battleRowOf / unparsedRowOf、BattleRow

apps/web/                        Nuxt (ssr: false)
  app/pages/                     頁面薄殼；跨 feature 的組合只在這裡（ADR-0013）
  app/features/ingest/composables/useShowdown.ts
                                 抓取（分頁、並發上限、退避重試）
  app/features/ingest/composables/useIngest.ts
                                 抓 → 存 raw → 解析 → upsert（用 battle-row 對應）
  app/features/stats/composables/useStats.ts
                                 查詢與統計
  app/shared/api/                Supabase 資料存取與 Showdown 的外部型別
  server/api/                    MVP 幾乎為空，保留給升級付費版後

scripts/                         本機維運腳本，自成 workspace 套件（不上線）
  reparse.ts                     從 Storage 的 raw log 重建全部衍生資料

Supabase
  profiles                       使用者 ↔ 多個 Showdown 別名
  battles                        混合模型主表
  storage: replay-logs/          原始 log（gzip）
```

`replay-parser` **不知道 Supabase、Nuxt、HTTP 的存在**。它的介面是
`parseReplay(log: string, meta: ReplayMeta): ParsedBattle`。這讓它能用純 fixture 測試，
也是整個系統唯一有複雜邏輯的地方。

### 資料流

```
使用者輸入 Showdown 名稱（或貼一批 replay 連結）
  → 瀏覽器翻 search.json 全部分頁（page 從 1 起，取回不滿 51 筆即停）
  → 以 id 去重（相鄰頁必定重疊一筆）
  → 過濾掉 DB 已有的 replay id
  → 逐筆抓 <id>.json（並發上限 5）
  → raw log gzip 後存 Storage       ← 先存
  → parseReplay() → ParsedBattle    ← 後解析
  → 解析「我是哪一邊」→ upsert battles
  → 即時更新進度條與逐筆結果清單
```

**先存 raw、後解析**是整個設計的保險絲：解析失敗不會導致要重抓，解析器改版後可以整批
re-parse 而不必再碰 Showdown。

---

## 5. 資料模型

採**混合模型**：已知會拿來切片的維度升成正規化欄位並建索引，其餘進 JSONB。

理由是它精準對應現況 —— 視角 1、2 的維度已確定（升欄位），視角 3、4 還沒定案
（先躺在 JSONB 裡，等真要做時再升欄位並用 re-parse 腳本回填）。

### `profiles`

| 欄位                 | 型別                   | 說明                               |
| -------------------- | ---------------------- | ---------------------------------- |
| `id`                 | uuid PK → `auth.users` |                                    |
| `showdown_usernames` | `text[]`               | 別名清單，比對時走 `toID()` 正規化 |

### `battles`

| 欄位                                                      | 型別             | 用途                                                                          |
| --------------------------------------------------------- | ---------------- | ----------------------------------------------------------------------------- |
| `user_id`, `replay_id`                                    | uuid, text       | `unique(user_id, replay_id)`，防重複匯入                                      |
| `played_at`, `format_id`, `rated`, `game_type`            |                  | 視角 1、全域篩選器                                                            |
| `rating`, `rating_delta`                                  | int, null 允許   | rating 曲線                                                                   |
| `regulation`                                              | generated column | 從 `format_id` 去 `bo[23]$` 派生。**不參與隊伍識別、UI 不使用**，純為未來保險 |
| `series_id`                                               | text, null 允許  | Bo3 母對戰 id，供「依 series 聚合」使用                                       |
| `my_side` (`p1`/`p2`), `my_username`, `opponent_username` |                  | 身分判定；`my_side` 為 null = spectated                                       |
| `result` (`win`/`loss`/`tie`)                             |                  | 核心指標；spectated 時為 null                                                 |
| `team_signature`, `bring_signature`                       | text             | 視角 2。`bring_signature` 是實際現身的集合，長度可能 < teamsize               |
| `bring_complete`                                          | boolean          | 現身數是否等於 teamsize。統計層預設只採 `true`                                |
| `turn_count`, `end_reason`                                |                  |                                                                               |
| `details`                                                 | `jsonb`          | 對手隊伍、每隻是否倒下、Mega/太晶等 → 未來視角 3、4                           |
| `log_path`                                                | text             | Storage 路徑                                                                  |
| `parser_version`, `parse_error`                           | text             | re-parse 與失敗追蹤                                                           |

索引：`(user_id, played_at desc)`、`(user_id, format_id, played_at)`、
`(user_id, team_signature)`、`(user_id, bring_signature) where bring_complete`、`details` 上的 GIN。

### 歸屬模型：每使用者各存一列

`battles` 以 `user_id` 擁有，同一場對戰若雙方玩家都在用本站，會存兩份。

**這是刻意的取捨。** RLS 只需 `user_id = auth.uid()` 一行；而重複率實務上趨近於零
（要兩個使用者剛好打過同一場且都匯入了）。省下的複雜度遠大於省下的儲存。未來真要做
全站 meta 統計時，再從 `battles` 抽出一張去重的 `replays` 表即可 —— 不是不可逆的決定。

### RLS 與「使用者可寫假資料」

RLS 政策就是 `user_id = auth.uid()`，四種操作皆同。Storage 以 `{user_id}/` 路徑前綴隔離。

由於前端直寫 Supabase，使用者理論上可繞過 UI 塞任意內容進自己的 `battles`
（例如捏造 100 場全勝）。**接受此風險**：這是只給本人看的個人統計工具，捏造資料等於
騙自己，沒有任何獎勵機制。未來要做公開排行榜或跨使用者 meta 時，正解是「server 端重新
驗證 replay 來源」，而不是現在先加一堆猜測性的 constraint。

### raw log 存放

Supabase Storage，路徑 `replay-logs/{user_id}/{replay_id}.json.gz`。

不存 DB text 欄位（會吃光 500MB DB 額度，且每次查 `battles` 都要小心別撈出大欄位）；
不採「需要時再抓」（replay 會被刪除、私人 replay 需 password、re-parse 時等於重跑匯入）。

容量估算：實測短局 log 約 5.5–5.9KB，長局估 15–30KB。以平均 15KB 計，重度玩家 1000 場
約 15MB、gzip 後約 3MB。免費版 1GB Storage 足夠 MVP。

---

## 6. 解析器設計

### 介面

```ts
parseReplay(log: string, meta: ReplayMeta): ParsedBattle
```

`ParsedBattle` **視角中立** —— 它同時描述 p1 與 p2，不知道誰是「我」。
身分解析發生在寫入 DB 時，這讓同一份解析結果能被任何使用者重用。

### 必須處理的硬點

這些都是從實際 replay log 觀察到的，不是預想：

1. **Mega 進化會改變 species。** `detailschange` 把 `Floette-Eternal` 變成 `Floette-Mega`。
   計算簽章前必須還原成 base species，否則同一隻會被算成兩隻。
2. **`|switch|` 不等於選出。** `|drag|`（吼叫等招式拖出來的）也會讓寶可夢首次現身。
   選出的 4 隻要取「首次以任何方式現身」的集合。
3. **身分比對走 `toID()` 正規化**（小寫、去非英數）。兩邊都不匹配 → 標為 spectated。
4. **Bo3 的 replay 是單一 game。** log 尾端 `|uhtml|bestof|` 帶母對戰 id 與下一場連結。
   每個 game 各存一列，靠 `series_id` 聚合。
5. **metadata 的 `rating` 不對應任何一方的視角，不可直接當「我的 rating」。**
   實測一場 Bo1：metadata `rating` = 1586，而 `|player|` 行第 5 欄的賽前 rating 是
   p1 1607 / p2 1591，`|raw|` 行的賽後是 p1 1586 / p2 1612 —— metadata 的值等於**輸家**
   的賽後 rating。若直接寫進 `battles.rating`，勝方的 rating 曲線會畫成對手的數字。
   正解：賽前值取自己那邊的 `|player|` 第 5 欄，賽後與 delta 取 `|raw|`。
   Bo3 賽事場次 `rating` 為 `null`，圖表要能處理。
6. **`|player|` 行會在對戰結束後重發，且只帶 side。** 實測 log 尾端出現 `|player|p1|`
   （無名稱、無 rating）。若用「最後一個 `|player|p1|`」決定名字會得到空字串，身分比對失敗，
   整場被誤判為 spectated。**必須取第一個**。
7. **認輸沒有專門的訊息類型。** 只有 `|-message|<name> forfeited.` 這種自由文字，
   接著才是 `|win|`。`end_reason` 只能靠比對這行的英文字串。
8. **`|-mega|` 的第 2 欄直接給 base species**（`|-mega|p1b: Raichu|Raichu|Raichunite Y`），
   可當型態還原的交叉驗證。但**不能只依賴它** —— Primal 與一般型態切換不發 `|-mega|`。
9. **Species Clause 只限「每方」一隻，雙方可以撞同一隻。** 實測一場雙方都帶 Kangaskhan。
   `|poke|` 必須嚴格分 p1/p2 收集，否則簽章會少算。
10. **選出的 4 隻不一定全部現身。** `|teamsize|p2|4` 說選了 4 隻，但實測一場 4 回合認輸的
    對戰只有 3 隻出場過。`bring_signature` 存實際現身的集合，另用 `bring_complete` 標記是否
    等於 teamsize —— 不這樣做的話，同一組選出在短局會算出不同簽章，導致 bring 分組破碎。
11. **`gametype` 不寫死。** 解析器做成 gametype-agnostic（不假設「一定有 p1a/p1b 兩個位置」），
    匯入時全部照收並記錄 `game_type`，儀表板預設篩 doubles。這樣使用者同步帳號時不會看到
    一半場次莫名消失。

### MVP 不做 KO 歸因

「每隻寶可夢造成幾次 KO」是視角 4 才需要的，而它是**整個解析器最難的部分** ——
`|faint|` 那行不會告訴你兇手是誰，死因可能是反作用力、生命寶珠、鮫肌特性、天氣或狀態。

MVP 只解析便宜的事實：帶入、選出、是否倒下、Mega、太晶、回合數、對手隊伍。
KO 歸因等視角 4 真的要做時，用 re-parse 腳本補上。這讓 Phase 1 快一半上線，也避免為了
一個還沒定案的視角先寫死歸因規則。

### 版本控管

`battles.parser_version` 記錄產生該列的解析器版本。改版後執行 `scripts/reparse.ts`
（本機 Node、service_role 直連 Supabase）讀 Storage 的 raw log 重建全部衍生資料。

匯入與 re-parse 共用 `packages/battle-row` 的同一份對應（#14 實作時新增，見 Q23）——
兩份副本會漂移，而症狀是統計數字變了卻沒人說得出為什麼。腳本逐欄比對後才寫入，所以
解析器沒改版時重跑等於全部 `unchanged`、一列都不寫，這條驗收因此是看得見的。

比對必須知道兩件實測到的事：PostgREST 回來的 `played_at` 是 `…T09:19:18+00:00`，
解析器產生的是 `…T09:19:18.000Z`；`jsonb` 回來的 `details` 鍵序被重排過。當成字串比，
整張表都會看起來變了。

不做「使用者開站時自動偵測版本落後並背景重解析」—— 在使用者數為個位數的階段是純粹的
過度設計。也不做「只有新資料用新版」—— 那會讓資料集混著不同版本的解析結果、統計不可信。

---

## 7. 統計設計

**勝率走向**：橫軸日曆日期（而非場次序號 —— 日期能反映「休息兩個月後手感變差」這種
真實訊號），縱軸滑動視窗勝率（預設 20 場）。rating 曲線遇 null **斷線不內插**。

**兩條曲線都是一天一個點**（#16 實作時修訂，見 Q29）。橫軸的單位是日曆天，那就是它
能呈現的解析度：實測一個真實帳號，一天九場會把九個點塞進三十像素，當天 rating 上下
240 分就畫成一根垂直線，什麼也讀不出來。勝率取當天最後一場時的視窗值，rating 取
**當天最後一場有 rating 的對戰**（收盤價）—— 天梯只有被上傳的那些場次進得了資料庫，
中間它還在動，所以任何「當日平均」都是一個從未真實存在過的數字。

**賽制（`format_id`）與 Showdown 名稱都是必填篩選器**（#16 實作時修訂，見 Q30）。
跨規則的勝率回答不了任何人的問題，而兩個賽制的天梯 rating 是兩個不同的數，畫成一條線
就是錯的。名稱同理 —— rating 綁在帳號上，不綁在人身上：實測資料裡小號的 1481 就夾在
主帳 1319 與 1269 中間。頁面載入時自動選場次最多的名稱，再選那個名稱底下場次最多的
賽制；賽制清單依名稱收斂，所以兩個必填欄位走不到「沒人打過」的組合。

既然選了賽制就等於決定了是不是 Bo3，原本的 Bo1/Bo3 切換按鈕隨之移除。

**名稱必填的代價，明知而接受**：改名前後的戰績會被切成兩段，沒辦法一次看完。不受影響
的是別名清單真正的用途 —— 判斷匯入的對戰哪一邊是你 —— 以及 `toID()` 對同一個名稱不同
拼法的合併。

**隊伍表現**：一列一支隊，可展開下鑽到 bring 組合（預設只計 `bring_complete = true`，
可切換為「含不完整場次」並標示筆數）。排序用 **Wilson score 下界**，
不用原始勝率 —— 否則「3 戰 3 勝」會永遠霸榜。**顯示全部分組、不隱藏低樣本**
（硬性隱藏會讓使用者困惑「我的隊怎麼不見了」），但明確標示樣本數。

**版面**：單頁儀表板。頂部一列全域篩選器（Showdown 身分、`format_id`、日期範圍、
依 game 或依 series），下方兩個區塊。這兩個視角是同一個問題的兩面
（「我最近怎麼樣」和「因為哪支隊」），拆頁會逼使用者在兩邊重複設定篩選條件。

---

## 8. 錯誤處理

**批次匯入永不整批失敗。** 每筆獨立 try，失敗記錄原因（404 / 已刪除 / 私人 /
解析錯誤 / 網路），最後統一回報清單。

**進度呈現**：進度條 + 即時滾動的逐筆結果清單。逐筆清單不是裝飾 —— 使用者需要知道
「失敗的那 12 筆是為什麼」。

**續傳幾乎免費**：每筆成功就立刻寫進 DB，重新整理後再按一次同步，已存在的 replay id
會被自動跳過。不需要額外的游標機制。

**節流**：對 Showdown 的請求並發上限 5，失敗指數退避。一個使用者可能有上千場，
不能打爆人家的服務。

---

## 9. 測試策略

**Parser（主戰場）** — fixture 驅動，TDD。每個 fixture 一份 expected snapshot，vitest 執行。
純函式、輸入輸出明確，是 TDD 價值最高的地方。除了已取得的兩場，需補齊邊界 fixture：
Bo3、認輸、平手、無 rating、單打、含 `showteam` 的開放隊表場次。

**匯入流程** — mock `fetch`，驗證分頁終止、去重、並發上限、退避重試、部分失敗的回報。

**統計查詢** — 本機 Supabase（Docker）+ seed data 驗證聚合結果，特別是 Wilson 排序與
spectated 場次的排除。

---

## 10. 已知限制與接受的風險

| 項目                         | 風險                     | 決定                                                                                                                                       |
| ---------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 無法驗證 Showdown 帳號擁有權 | 任何人可綁任何名稱       | **接受**（信任模式）。相關 replay 本來就公開，盜綁拿不到非公開資訊。改用「先到先得」反而會造成真傷害：名字被搶走的人永遠用不了，且客服無解 |
| 前端可寫假資料               | 使用者可捏造戰績         | **接受**。個人工具，騙自己沒有獎勵                                                                                                         |
| 匯入需分頁開著               | 關掉即中斷               | **接受**。已存的不會遺失，重按同步即續傳                                                                                                   |
| 免費版 Workers               | 未來流量成長會撞牆       | **先驗證成效再考慮升級**。升級路徑已預留（`server/api/` 目錄與同一份 parser package）                                                      |
| 私人 replay                  | `search.json` 抓不到     | 只能由使用者從 replay 站登入後複製 `<id>-<password>pw` 連結貼進來；`private:2`（無 password）任何方式都取不到                              |
| 無法強制對手存 replay        | 沒人存檔的場次不存在     | **接受**。`Config.forcedpublicprefixes` 僅 global staff 可設、10 天過期且只對 rated 生效，使用者只能自己每場 `/savereplay`                 |
| 敘述統計回答不了因果         | 使用者可能誤讀相關為因果 | **接受**，但 UI 措辭須謹慎，避免暗示因果                                                                                                   |

---

## 11. 決策紀錄

四輪問答共 29 個決策，加上實作過程中修訂的三個。此處僅記錄**最終選擇與否決的替代
方案**，理由見前文對應章節。

| #       | 決策         | 選擇                                                                                 | 否決的替代方案                                          |
| ------- | ------------ | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| Q1      | 資料歸屬     | 每使用者一列                                                                         | 全域 + `user_battles` join                              |
| Q2      | 身分綁定     | 多別名，全部視為同一人                                                               | 單一名稱；多別名但分開統計                              |
| Q3      | Bo3 語意     | 每 game 一列，統計層可切換聚合                                                       | 只存 series 層級                                        |
| Q4      | 隊伍識別     | 6 隻 species 相同即同隊，配置不列入                                                  | 納入道具/招式配置                                       |
| Q5      | 對戰範圍     | 解析器 gametype-agnostic，UI 預設篩 doubles                                          | 只支援 doubles                                          |
| Q6/Q10  | 部署         | Cloudflare Workers **免費版**先驗證                                                  | Workers Paid；自架 Docker；Vercel                       |
| Q7      | 登入         | Google 優先，Discord 後續                                                            | 密碼登入                                                |
| Q8      | UI           | Tailwind + shadcn-vue                                                                | 純 Tailwind；PrimeVue/Naive UI；手寫 CSS                |
| Q9/Q13  | 語言         | 介面英文 + 第一天上 i18n，中文為輔                                                   | 純英文不做 i18n；介面中文                               |
| Q11     | 重複綁定同名 | 信任模式，允許重複                                                                   | 先到先得                                                |
| Q12/Q22 | Bo1 vs Bo3   | **視為完全不同的項目**，隊伍識別用完整 `format_id`；但仍存 `regulation` 派生欄位備用 | 用 regulation 合併 Bo1/Bo3                              |
| Q14     | 圖表         | unovis                                                                               | ECharts；Chart.js；手刻 D3                              |
| Q15     | 稀疏資料     | 全顯示 + Wilson 下界排序 + 標樣本數                                                  | 隱藏低樣本；純勝率排序                                  |
| Q16/Q19 | re-parse     | 本機 Node 腳本（service_role）                                                       | 線上管理端點；瀏覽器執行；自動背景重解析                |
| Q17     | 匯入架構     | **全前端**（Worker 不參與）                                                          | 前端分批呼叫 Worker；前端抓取 + Worker 解析             |
| Q18     | 渲染模式     | `ssr: false`（SPA）                                                                  | 維持 SSR                                                |
| Q20     | 版面         | 單頁 + 全域篩選器                                                                    | 拆成多頁                                                |
| Q21     | 時間軸       | 日曆日期 + 滑動視窗；rating 斷線不內插                                               | 場次序號；內插                                          |
| Q23     | Monorepo     | `apps/web/` + `packages/replay-parser/` + `packages/battle-row/` + `scripts/`        | app 留在根目錄；列對應各留一份副本                      |
| Q24     | raw log      | Supabase Storage + gzip                                                              | DB text 欄位；不存                                      |
| Q25     | RLS          | 單一 `user_id = auth.uid()`，接受可寫假資料                                          | DB constraint 合理性檢查；經 Worker 寫入                |
| Q26     | 匯入 UI      | 進度條 + 即時逐筆清單                                                                | 單一進度條                                              |
| Q27     | 解析深度     | MVP 不做 KO 歸因                                                                     | 一次做到位                                              |
| Q28     | 訪客試用     | 不做                                                                                 | 提供未登入單筆解析                                      |
| Q29     | 曲線取樣     | 一天一個點；rating 取當日收盤                                                        | 一場一個點（#16 實測不可讀）；當日平均                  |
| Q30     | 賽制／名稱   | 兩者皆必填，預設場次最多者                                                           | 可選「全部」（跨規則、跨帳號的 rating 混算無意義）      |
| —       | 分析深度     | 純敘述統計                                                                           | 規則式歸因；LLM 複盤；混合                              |
| —       | 後端         | Supabase                                                                             | Cloudflare D1；自架 Postgres；Convex；PocketBase；Turso |
| —       | 前端框架     | Nuxt                                                                                 | 維持裸 Vue 3                                            |
| —       | 匯入方式     | 帳號同步 + 批次貼連結                                                                | 單筆貼連結；上傳 log 檔案                               |
| —       | MVP 視角     | 勝率走向 + 隊伍/選出表現                                                             | matchup 勝率；個別寶可夢貢獻（皆排後）                  |

---

## 12. 未來方向

依優先序，**皆不在此次範圍**：

1. **視角 3、4** — matchup 勝率、個別寶可夢貢獻。需要在解析器補上 KO 歸因，
   並把 `details` 中的相關欄位升成正規化欄位（用 re-parse 腳本回填）。
2. **升級 Workers 付費版** — 把匯入搬到 `server/api/`，改用 Queue 做背景同步，
   使用者不必開著分頁。parser package 不需改動。
3. **Discord 登入**。
4. **replay 覆蓋率對帳** — 用 `pokemonshowdown.com/users/<id>.json` 的官方勝負場數，
   告訴使用者「你有 120 場 replay，官方紀錄 340 場」。
5. **公開分享頁** — 用 Nuxt route rules 為特定路由開啟 SSR，做 OG image。
6. **規則式歸因** — 若敘述統計證實不足以回答「輸贏主因」。
7. **全站 meta 統計** — 需先從 `battles` 抽出去重的 `replays` 表。

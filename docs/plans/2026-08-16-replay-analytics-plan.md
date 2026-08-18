# Showdown Replay 對戰分析 — 實作計畫

- 日期：2026-08-16
- 相關文件：[設計文件](../specs/2026-08-16-replay-analytics-design.md)、[CONTEXT.md](../../CONTEXT.md)

這份文件記錄「怎麼做」。決策與理由見設計文件 —— **若實作時想偏離某個決定，先回去讀
設計文件的對應章節**，那裡記錄了被否決的替代方案與原因。

每個 Phase 都有可獨立驗證的完成條件。**未通過驗證不得進入下一個 Phase。**

---

## Phase 0 — Monorepo 重組與 Nuxt 遷移

純機械性搬遷，不含任何產品邏輯。目標是結束時專案跑得起來、既有測試仍綠。

### 步驟

1. **建立 workspace 結構**
   - `pnpm-workspace.yaml` 加入 `packages:` 欄位（`apps/*`、`packages/*`）；保留現有 catalog 與 overrides
   - 建立 `apps/web/`、`packages/replay-parser/`

2. **搬遷現有 app 到 `apps/web/`**
   - 移動 `src/`、`index.html`、`env.d.ts`、`public/`、各 `tsconfig.*.json`、`vitest.config.ts`
   - `vite.config.ts` 拆兩份：Vite+ 的 `lint`/`fmt`/`staged` 設定留在**根目錄**（那是 `vp` 的設定不是 Vite 的），`vue()` plugin 與 `@` alias 之後進 `nuxt.config.ts`

3. **導入 Nuxt**
   - `apps/web/` 安裝 `nuxt`、`@nuxt/test-utils`
   - 建立 `nuxt.config.ts`：`ssr: false`、`nitro.preset: 'cloudflare_module'`、alias、modules
   - `src/App.vue` → `app/app.vue`
   - `src/views/HomeView.vue` → `app/pages/index.vue`；`AboutView.vue` → `app/pages/about.vue`
   - **刪除** `src/router/index.ts`（改用檔案路由）、`src/main.ts`（Nuxt 接管啟動）、`index.html`、`env.d.ts`、`tsconfig.app/node/vitest.json`
   - `src/assets/*.css` 保留，改由 `nuxt.config.ts` 的 `css` 引入
   - 根 `tsconfig.json` 改為 extends Nuxt 產生的 `.nuxt/tsconfig.json`
   - `.gitignore` 加入 `.nuxt`、`.output`

4. **調整測試**
   - `vitest.config.ts` 改用 `@nuxt/test-utils/config` 的 `defineVitestConfig`
   - `src/views/__tests__/HomeView.spec.ts` 隨頁面搬遷並更新 import 路徑

5. **安裝模組**
   - `@nuxtjs/supabase`、`@pinia/nuxt`、`@nuxtjs/i18n`
   - Tailwind + shadcn-vue 初始化（`components.json`、`app/assets/css/tailwind.css`）
   - i18n：建立 `i18n/locales/en.json`（主）與 `zh-TW.json`（輔），預設 `en`

### 完成條件

- [ ] `vp install` 無錯誤
- [ ] `vp run dev` 啟動，`/` 與 `/about` 皆可存取
- [ ] `vp run test:unit` 全綠
- [ ] `vp run type-check` 無錯誤
- [ ] `vp check` 無錯誤
- [ ] `vp run build` 產出 `.output/`
- [ ] 一個 shadcn-vue 元件（例如 `Button`）能正常渲染，證明 Tailwind 管線通了
- [ ] 頁面上一段文字透過 `$t()` 顯示，切換語系會變，證明 i18n 通了

---

## Phase 1 — `packages/replay-parser`

**全程 TDD。** 純函式、輸入輸出明確，是 TDD 價值最高的地方。先寫失敗的測試、再寫實作。

此 package 零 runtime 依賴，**不得**匯入 Supabase、Nuxt、`fetch` 或任何 I/O。

### 步驟

1. **建立 fixtures**（先做，測試才有東西吃）
   - `test/fixtures/` 存已取得的兩場：一場天梯 Bo1（含 Mega、吼叫拖出、地震雙殺、Life Orb 自殺、rating delta）、一場賽事 Bo3 Game 1（含 `showteam` 開放隊表、`series_id`、`rating: null`）
   - 再補齊邊界 fixture：認輸、平手、單打、長局（>20 回合）
   - fixture 檔名**不得包含 replay password**（原始連結的 password 段落要移除）

2. **`src/protocol.ts` — tokenizer**
   - 逐行切成 `{ type, args }`
   - 測試：空行、`|` 開頭的各種變體、含 `|` 的 HTML 內容（`|html|`、`|uhtml|`）不會被誤切

3. **`src/species.ts` — 型態還原**
   - `toID()` 正規化
   - `toBaseSpecies()`：`Floette-Mega` → `floette`、`Aerodactyl-Mega` → `aerodactyl`、`Raichu-Mega-Y` → `raichu`
   - 測試：Mega / Primal / 地區型態（`Ninetales-Alola` **不可**被還原成 `ninetales`，那是不同寶可夢）

4. **`src/replay.ts` — 狀態機**
   - 重播 log，追蹤：Team Preview 的 6 隻、首次現身（`switch` **與** `drag`）的集合、`detailschange`、回合數、勝負、認輸/平手
   - 測試：每個硬點各一個測試（見設計文件 §6）

5. **`src/summarize.ts` — 產出 `ParsedBattle`**
   - 視角中立：同時描述 p1 與 p2，**不知道誰是「我」**
   - 從 `|raw|` 抽 rating before/after/delta；從 `|uhtml|bestof|` 抽 `series_id`
   - 匯出 `PARSER_VERSION` 常數
   - **不做 KO 歸因**（見設計文件 §6）

6. **Snapshot 測試**
   - 每個 fixture 一份 expected JSON，比對完整 `ParsedBattle`

### 完成條件

- [ ] `vp run test` 在 `packages/replay-parser` 全綠
- [ ] 每個設計文件 §6 的硬點都有對應的具名測試
- [ ] `package.json` 的 `dependencies` 為空
- [ ] `apps/web` 能 import 並成功解析兩場真實 replay

---

## Phase 2 — Supabase、認證與匯入

### 步驟

1. **Supabase 專案與 schema**
   - migration 建立 `profiles`、`battles`（欄位見設計文件 §5）
   - `regulation` 用 generated column：`regexp_replace(format_id, 'bo[23]$', '')`
   - 索引：`(user_id, played_at desc)`、`(user_id, format_id, played_at)`、`(user_id, team_signature)`、`details` 的 GIN
   - `unique(user_id, replay_id)`
   - RLS：四種操作皆 `user_id = auth.uid()`
   - Storage bucket `replay-logs`，policy 以 `{user_id}/` 路徑前綴隔離

2. **認證**
   - `@nuxtjs/supabase` 設定 Google OAuth
   - 未登入導向登入頁的 route middleware
   - 登入後若無 `profiles` 列則建立

3. **別名綁定 UI**
   - 新增/移除 Showdown 名稱，寫入 `profiles.showdown_usernames`
   - **必須顯示**：「我們無法驗證 Showdown 帳號擁有權，這只是用來篩選你的對戰紀錄」

4. **`useShowdown.ts` — 抓取層**
   - `listUserReplays(username)`：翻 `search.json` 分頁，**page 從 1 起算**，取回不滿 51 筆即停
   - **相鄰頁必定重疊一筆**（offset 是 `50*(page-1)` 但每次取 51）→ 合併時以 `id` 去重，
     進度條總數用去重後的數字，否則會虛報
   - `page > 100` 一律回 `[]`：單一查詢上限約 5001 筆。超量時用 `format=<format_id>` 分批
   - 選填的賽制篩選：`format` 參數吃 `format_id`（`gen9vgc2026regj`），**不是**顯示名稱
   - `fetchReplay(idWithPassword)`：抓 `<id>.json`。`format_id` 一律取自這裡的 `formatid` 欄位，
     **不可**用清單的 `format`（那是 `[Gen 9] …` 顯示名稱）
   - 並發上限 5、失敗指數退避
   - 測試：mock `fetch`，驗證分頁終止、**重疊去重**、`page > 100` 上限、並發上限、退避

5. **`useIngest.ts` — 匯入管線**
   - 順序嚴格為：**取得清單 → 過濾已存在 → 抓取 → gzip 存 Storage → 解析 → 解析身分 → upsert**
   - 身分解析：以 `toID()` 比對 `profiles.showdown_usernames`；皆不符 → `my_side = null`（spectated）
   - 每筆獨立 try；失敗記錄原因，不中斷整批
   - 解析失敗仍保留已存的 raw log，寫入 `parse_error`

6. **`pages/import.vue`**
   - 兩個入口：依 Showdown 名稱同步、批次貼連結（換行分隔）
   - 進度條 + 即時滾動的逐筆結果清單（成功 / 跳過 / 失敗＋原因）
   - 續傳靠去重自然達成，不需額外游標

7. **`scripts/reparse.ts`**
   - 本機 Node、service_role 直連 Supabase
   - 讀 Storage 的 raw log、重跑 parser、更新 `battles` 與 `parser_version`
   - **不部署上線**；service_role key 只存在本機環境變數

### 完成條件

- [ ] 能用 Google 登入並建立 profile
- [ ] 綁定一個真實 Showdown 名稱後同步，DB 出現對應筆數的 `battles`
- [ ] 重按同步：全數跳過、不產生重複列
- [ ] 貼一個私人 replay 連結（含 password）能成功匯入
- [ ] 故意貼一個 404 連結：該筆標為失敗並顯示原因，其餘正常匯入
- [ ] Storage 中出現 `replay-logs/{user_id}/*.json.gz`
- [ ] 用另一個帳號登入，查不到第一個帳號的任何 `battles`（RLS 驗證）
- [ ] 同步一個超過 51 場的帳號：匯入筆數等於去重後的 unique 數（不因分頁重疊而重複或少算）
- [ ] `battles.format_id` 存的是 `gen9vgc2026regj` 這種 id，不是 `[Gen 9] VGC 2026 Reg J` 顯示名稱
- [ ] `scripts/reparse.ts` 能重建全部衍生資料且結果一致

---

## Phase 3 — 儀表板

單頁，頂部全域篩選器 + 下方兩個區塊。

### 步驟

1. **`useStats.ts` — 查詢層**
   - 全域篩選器狀態：Showdown 身分、`format_id`、日期範圍、Bo1/Bo3、依 game 或依 series
   - **一律排除 spectated 場次**（`my_side is null`）
   - Wilson score 下界計算（純函式，可單獨測試）

2. **勝率走向區塊**
   - KPI 卡：總場數、勝率、目前連勝/連敗
   - 折線圖（unovis）：橫軸日曆日期、縱軸滑動視窗勝率（預設 20 場，可調）
   - rating 曲線：遇 `null` **斷線不內插**

3. **隊伍表現區塊**
   - 表格：一列一支隊（`format_id` + `team_signature`），欄位為場數、勝率、Wilson 下界
   - 排序鍵為 **Wilson 下界**，非原始勝率
   - **顯示全部分組**，不隱藏低樣本，但明確標示樣本數
   - 可展開下鑽到該隊的 bring 組合（同樣的排序與標示規則）

4. **i18n**
   - 所有介面文案進語系檔
   - 寶可夢 / 招式 / 道具名稱**不進 i18n**，永遠顯示英文

### 完成條件

- [ ] 匯入真實資料後，勝率走向圖與實際戰績相符（人工抽查 5 場）
- [ ] 一支只打過 3 場全勝的隊，排序在「20 場 14 勝」的隊**之後**
- [ ] 每個分組都看得到樣本數
- [ ] Bo3 場次的 rating 曲線出現斷點，而非被內插連起來
- [ ] 切換「依 game / 依 series」，Bo3 的場數與勝率隨之改變
- [ ] 切換 Bo1/Bo3 篩選器，隊伍清單隨之改變（驗證兩者被視為不同項目）
- [ ] 切換語系，介面文案改變但寶可夢名稱維持英文
- [ ] `vp check`、`vp run type-check`、`vp run test:unit` 全綠

---

## 排在後面（不在此次範圍）

依優先序見設計文件 §12。最接近的兩項：

- **視角 3、4**（matchup 勝率、個別寶可夢貢獻）— 需在解析器補 KO 歸因，
  並把 `details` 中相關欄位升成正規化欄位，用 `scripts/reparse.ts` 回填
- **升級 Workers 付費版** — 匯入搬到 `server/api/` + Queue 背景同步，parser package 不需改動

---

## 實作時的注意事項

- **先讀 CONTEXT.md。** 命名一律使用其中定義的詞彙（game / series / team / bring /
  signature / regulation / spectated），不要自創同義詞。
- **不要在 `packages/replay-parser` 引入任何 I/O 或框架依賴。** 它的可測試性完全建立在
  「純函式」這個性質上。
- **不要為了讓測試通過而修改 fixture 的 expected snapshot** —— 先確認是實作錯了還是
  預期錯了。
- **`service_role` key 絕不可出現在 `apps/web/`。** 它只屬於 `scripts/`。
- 若某個決定實作起來明顯窒礙難行，回報並更新設計文件的決策紀錄，不要默默改掉。

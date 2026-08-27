# ADR-0011：`pages/` 與 `middleware/` 留在 `app/`，當作唯一的組合層

- 狀態：Accepted
- 日期：2026-08-27
- 相關：#61、ADR-0001、ADR-0005、ADR-0009

## 脈絡

#61 把 `apps/web/app/` 從「按技術種類分層」重組成 folder-by-feature：
`app/features/{stats,timeline,ingest,identity}/` 各自擁有 components / composables /
utils / test，只透過一個 `index.ts` 對外；跨 feature 共用的東西沉到 `app/shared/`。
邊界由兩道檢查守著 —— 根 `vite.config.ts` 裡 oxlint 的 import 限制，與
`apps/web/test/architecture.spec.ts` 的三條規則（feature 互不匯入、`shared` 不匯入
`features`、外部只經 `index.ts` 進 feature）。

搬完之後，`app/` 根層還剩四樣東西沒有 feature 歸屬：`pages/`、`middleware/`、
`plugins/`、`app.vue`。它們看起來很像「還沒搬完」—— 這張 ADR 是寫給那個未來認為
它們還沒搬完的人。

## 決定

**`app/pages/`、`app/middleware/`、`app/plugins/` 與 `app/app.vue` 留在 `app/` 根層，
並構成組合層 —— 這是全專案唯一允許兩個 feature 相遇的地方。**

頁面降級為薄殼：只從 `~/features/<name>` 的 `index.ts` 取東西、組版面，不含任何領域
邏輯。`app/pages/` 現有 7 支檔案（`index` / `import` / `login` / `settings` /
`about` / `auth/callback` / `teams/[id]`），領域邏輯全在對應的 feature 裡。

依賴方向：頁面與 middleware 可以匯入 `~/features/<name>`（只走 `index.ts`）與
`~/shared/**`；反向不成立。

## 為什麼不搬進 feature

**Nuxt 的檔案路由只掃 `app/pages/`。** 這不是慣例問題 —— 把
`app/features/stats/pages/index.vue` 放進去，Nuxt 不會生出任何路由，而且它不會報錯，
只是那條網址變成 404。同理 `middleware/auth.global.ts`：全域 middleware 的註冊條件
是它落在 `app/middleware/` 且檔名以 `.global` 結尾，換位置等於整個擋路由機制無聲失效
（ADR-0009 記的 deny-by-default 白名單就住在這支檔案裡）。`apps/web/nuxt.config.ts`
沒有覆寫 `dir`，所以這些預設就是現行行為。

**這一段沒有做 spike**（與 ADR-0005 不同、與 ADR-0009 相同）：沒有真的把一支頁面搬進
feature 再量 404。依據是 Nuxt 的掃描目錄設定與 `nuxt.config.ts` 沒有覆寫它這個事實。
量到的只有一件事：`app/pages/` 底下 7 支檔案對應 app 的全部路由，其他地方沒有頁面。

要讓 `pages/` 跟著 feature 走，唯一的官方路是 **Nuxt Layers**（`layers/<name>/`，
每層有自己的 `pages/`）。#61 把它明確放進 Out of Scope，理由照抄：
「5.9k 行、單人維護的 app 用它明顯過重，且 HMR / typecheck 的邊角案例更多」。

**推翻這個決定的觸發條件（#61 指名的）：** 某個領域真的要抽成獨立套件，或被第二個
app 共用。在那之前，把 `pages/` 搬進 feature 只會換來一層 layer 機制與一批 404。
若你只是覺得「根層那四樣看起來沒搬完」，那不是觸發條件。

## 後果

**要誠實承認的代價：跨越數個 feature 的頁面，會把那一跨的接線留在頁面裡。**

- `app/pages/index.vue` 組合 `features/stats`（`StatsDashboardPage`）與
  `features/timeline`（`BattleDrawer`）。
- `app/pages/import.vue` 組合三個 feature：`IngestImportPage`（ingest）、
  `useProfile`（identity）、`useStats`（stats）—— 匯入表單是 ingest 的元件，它需要的
  別名清單來自 identity，它做完之後要讓 stats 的列重讀。

那批接線之所以在頁面裡，**正是因為 feature 之間不得互相匯入**。而這裡有一個必須寫
下來的陷阱：**Nuxt 的自動匯入與元件註冊都不產生 import 陳述式**，所以 feature 內部
直接呼叫 `useProfile()`、或在 template 裡寫 `<BattleDrawer />`，對 oxlint 是完全隱形
的 —— 它讀的是 import 指定符，而這兩行根本沒有。違規完全成立，lint 完全看不到。

`apps/web/test/architecture.spec.ts` 存在的理由就是這個，而不只是把 lint 規則抄一遍：

- 它掃每個 feature 的 `composables/` 與 `utils/` 的匯出名稱，再檢查別的 feature 有沒有
  用到那些名字（註解先剝除，否則散文裡提到一個名字就會誤報）。
- 它從 `.nuxt/components.d.ts`（`nuxt prepare` 產出的註冊清單，不是重新推導 Nuxt 的
  命名規則）取得每個標籤對應的檔案，再掃各 feature 的 `<template>`，攔下跨 feature
  的元件使用。
- 附帶守住讓上述兩條有意義的前提：每個 feature 的元件都真的被 `nuxt.config.ts` 註冊
  （漏註冊是靜默失效，標籤解析不到任何東西）、`~/shared/components` 維持在
  `components` 陣列最後（ADR-0005 的 NUXT_B3011）、feature 內只有它那四個目錄、
  `app/` 根層不長出新的技術分層。

**仍然只能靠人的，是「這一支頁面有沒有偷偷長出領域邏輯」。** 這件事不可判定 ——
`import.vue` 連一行 import 都沒有，全靠自動匯入，任何機械指標（行數上限之類）都只會
是假的。唯一的補償是組合層只有 7 支薄殼檔案，每一支都短到可以一眼讀完；往 feature
內搬會讓需要靠人讀的範圍變大，而非變小。

## 第二個決定：三支 composable 沉到 `shared/`，與 #61 的歸屬表不同

#61 的 feature 對照表把 `useCurrentUser` 與 `useShowdownAliases` 指給 `identity`、
把 `useBattles` 指給 `stats`。實作時三支都落在 `app/shared/composables/`。

實測的呼叫者（`grep -rn` over `apps/web/app`，2026-08-27，排除 `test/`）：

| composable           | 涉及的 feature                              | 呼叫點                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCurrentUser`     | 四個全中：identity、ingest、timeline、stats | `features/identity/composables/useAuth.ts`、`features/identity/composables/useProfile.ts`、`features/ingest/composables/useIngest.ts`、`features/timeline/composables/useBattleLog.ts`、`features/timeline/components/BattleDrawer.vue`、`features/stats/composables/useStats.ts`、`features/stats/composables/useRecentBattles.ts`，另加 `middleware/auth.global.ts`、`plugins/supabase.client.ts`、`shared/composables/useBattles.ts` |
| `useBattles`         | 三個：ingest、timeline、stats               | `features/ingest/composables/useIngest.ts`、`features/timeline/composables/useBattleDrawer.ts`、`features/stats/composables/useStats.ts`、`features/stats/composables/useRecentBattles.ts`                                                                                                                                                                                                                                              |
| `useShowdownAliases` | 兩個：identity、ingest                      | `features/identity/composables/useProfile.ts`、`features/ingest/composables/useIngest.ts`                                                                                                                                                                                                                                                                                                                                               |

依 #61 自己寫明的原則 ——「需要共用就把共用的部分沉到 `shared/`，而不是互相匯入」——
把它們留在 feature 裡的結果是：`useCurrentUser` 留在 `identity` 會讓其餘三個 feature
全部依賴 `identity`；`useBattles` 留在 `stats` 會讓 ingest 與 timeline 依賴 `stats`
（而 #61 的 Problem Statement 第 3 點就是在抱怨「時間軸依賴匯入流程」這類錯向邊）。
歸屬表與原則衝突時，取原則。

`useShowdownAliases` 只跨兩個 feature，是三支裡最接近可以留在 `identity` 的一支；
沉到 `shared/` 是為了跟 `useCurrentUser` 一致 —— 它們是同一組 `useState` 的
session 狀態，拆在兩個地方會讓「使用者切換時要清掉什麼」變成跨資料夾的問題。

這一段寫在這裡而不是默默改掉，是因為 `AGENTS.md` 的實作守則要求：
「若某個決定實作起來明顯窒礙難行，回報並更新設計文件的決策紀錄，不要默默改掉。」

## 第三個決定：`useBattleRoute` 從 `useBattleDrawer` 抽出來沉到 `shared/`

`app/shared/composables/useBattleRoute.ts` 持有 `?battle=<replayId>` 這個網址
（ADR 之外的來源：`docs/specs/2026-08-20-battle-timeline-design.md` §4 決策 T1）。
它原本住在 `useBattleDrawer` 裡面。抽出來的原因是兩個 feature 都要用同一個網址：
儀表板的近期列表（`features/stats/components/RecentList.vue`）要標出開著的那一列並
且能打開另一列，抽屜（`features/timeline/composables/useBattleDrawer.ts`）要讀出
網址說的是哪一場 —— 兩邊都對著同一個 query 參數說話，而不對彼此說話。

**#61 的「歸屬裁決」提出的是另一條路：** 「`BattleOutcome.vue` … 若它同時被 stats
使用，改為由 `timeline` 的 `index.ts` 匯出，stats 走 public API。」套到這件事上就是
由 `timeline` 匯出、`stats` 走 public API 取用。

**這條路與同一節的另一句直接矛盾：** 「feature 之間一律不得互相匯入 —— 需要共用就把
共用的部分沉到 `shared/`」，也與這張票自己指定的 lint 規則矛盾（`app/features/<a>/**`
不得匯入 `app/features/<b>/**`，不分是否走 `index.ts`）。走 public API 的版本會在
`vp check` 與 `apps/web/test/architecture.spec.ts` 兩處同時亮紅燈。矛盾的兩句擇一時，
取可執行的那一句：沉到 `shared/`。

同一個矛盾也適用於 `BattleOutcome.vue`。目前它只被 timeline 用，所以沒有踩到；哪天
stats 也要它，正解是把共用的部分沉到 `shared/`，不是從 `timeline` 的 `index.ts`
匯出。

## 已知的未決偏離：`middleware/auth.global.ts` 沒有改成委派給 `features/identity`

#61 的 Implementation Decisions 寫「`middleware/auth.global.ts` 同理留在
`app/middleware/`（Nuxt 只掃該處），**內容改為委派給 `features/identity`**」。
留在原處這半邊做了；委派這半邊**刻意沒有做**，維護者決定不做。這裡記下兩邊的論點，
**這一項是開放的，不預設哪一邊贏。**

不委派的論點（維護者）：這支檔案只依賴兩樣東西 —— `useCurrentUser`（已在
`shared/`，見上）與一份公開路由白名單。白名單目前是三條：`login` 與 `auth-callback`
（identity）、`about`（不屬於任何 feature 的靜態頁）。把它委派給 `identity`，等於讓
`identity` 知道不屬於它的路由；日後任何 feature 新增一條公開頁，都要回頭改
`identity`。擋路由是**整個 app 的**政策，而組合層才是 app 級政策該待的地方。

委派的論點（#61）：「誰算已登入」是 identity 的領域知識，散在 middleware 裡等於
identity 的規則有一部分不在 identity。而且 ADR-0009 已經把「擋路由是一支讀得懂的
檔案」當成價值 —— 那支檔案放在 identity 內同樣讀得懂，還能跟 `useAuth` 一起被
`test/nuxt/auth.spec.ts` 涵蓋。

要收掉這一項的人請注意：白名單是 deny-by-default（ADR-0009 記的那條債），任何搬動
都必須讓 `apps/web/test/nuxt/auth.spec.ts` 與 `auth-client.spec.ts` 一字不改地全綠，
否則新加的頁面會默默變成公開。

## 替代方案

- **Nuxt Layers** —— 唯一能連 `pages/` 一起切開的官方機制，也是觸發條件成立時的正解。
  現在就採用的代價是多一層 layer 解析、更多 HMR / typecheck 邊角案例，換來的是四個
  資料夾各自多一個 `pages/`（#61 Out of Scope）。
- **在 feature 內放 `routes.ts` 由 `pages/` 匯入、以 `router.options.ts` 組裝** ——
  能把路由宣告搬進 feature，但會放棄檔案路由（`definePageMeta`、i18n 的
  `<name>___<locale>` 命名、ADR-0006 的 `prefix_except_default` 全部要自己接），
  代價遠高於它解決的整齊感。
- **Feature-Sliced Design 的完整分層**（多一個 `pages` 層）—— #61 只取「feature
  資料夾 + 單向依賴 + public API」三件事，多出來的層次在四個領域的規模下沒有買到東西。

# ADR-0001：全站 SPA（`ssr: false`），不做伺服器渲染

- 狀態：Accepted
- 日期：2026-08-19
- 相關：#2、PR #19、設計文件 §2 §3

## 脈絡

專案部署在 Cloudflare Workers 免費版。該方案有兩條硬限制（Cloudflare 官方 limits
文件，記於設計文件 §2）：

- **CPU 每請求 10ms**
- 每請求 50 subrequest

主要畫面是登入後的個人儀表板，內容是圖表與資料密集的表格（#16、#17）。這類頁面
server-side render 一次的 CPU 開銷，很可能超過 10ms —— 一旦超過，Workers 直接回
500，**壞掉的不是慢一點，是整站不能用**。

同時，登入後的私人儀表板**沒有 SEO 價值**：內容因人而異，也不希望被索引。SSR 的
主要收益在這裡等於零。

## 決定

`apps/web/nuxt.config.ts` 固定 `ssr: false`。整個 app 以 SPA 形式交付，Worker 只負責
送出 SPA 外殼與靜態資產。

## 後果

- Nuxt 的根節點是 `#__nuxt`，不是 `create-vue` 慣用的 `#app`。CSS 選擇器要跟著改
  （`app/assets/main.css` 已處理）
- 首屏會有一段空白，直到 JS 下載並執行。對登入後的工具型頁面可接受
- `.output/` 仍含一個 Nitro server，但它只做 SPA 外殼渲染
- 未來若要做公開分享頁並需要 OG image，**可以用 Nuxt route rules 逐頁開 SSR**，
  不必推翻這個決定。設計文件 §11 已把它列為後續項目

## 為什麼不推翻

日後「讓儀表板 SSR 以加快首屏」這個提案看起來會很合理。**在免費版前提下它不可行** ——
問題不是慢，是 10ms CPU 上限會讓頁面直接 500。要重新討論，前提是先升級付費版
（CPU 上限 5 分鐘），那是一個獨立的成本決策。

## 替代方案

- **全站 SSR** —— 被 10ms CPU 上限否決
- **SSG / prerender** —— 內容因使用者而異且需登入，無法預先產生

## 後續：公開文案頁 prerender（2026-09-05，#130）

上面「未來若要做公開分享頁，可以用 route rules 逐頁開」這條路走了。#126、#127 之後
有了三個不需要帳號就能讀的位址（`/`、`/about`、`/privacy`），而它們仍然只是一層空的
SPA 外殼：貼到會展開預覽的地方只會出現一個網址。

**決定：只有 `/about` 與 `/privacy`（含 `/zh-TW/` 版本，共四個位址）在建置期
prerender 成 HTML，並帶 title、description 與 OG／Twitter 標籤。`/` 維持純 SPA，不
prerender、不掛 OG 標籤。**

`/` 被排除的理由：#126 讓它同時是兩個頁面 —— 對陌生人是落地內容，對已登入者是私人
儀表板。它只能被 prerender 成其中一個，而那會是落地版本，於是已登入者每次進站都會先
看到一瞬間的落地文案再換成儀表板。用行銷頁的閃動去換一個公開頁面的預覽不划算，何況
真正值得被貼出去的是那兩頁說明文字。代價講明白：`/` 被搜尋引擎或聊天軟體抓到時仍然
是空白的，要改的話得先解決「一個位址兩個頁面」這件事本身。

**`ssr` 從 `false` 翻成 `true` 並不是推翻這個決定**，是同一件事的另一個開關。
`ssr: false` 時 Nuxt 根本不會把 app 的 renderer 放進 build，`prerender` 規則於是把空
外殼寫到頁面的位址上（本 repo 實測，#130）。現在的寫法是
`ssr: true` 搭配 `routeRules` 的 `'/**': { ssr: false }` catch-all，四個公開位址各自
覆寫回 `{ ssr: true, prerender: true }`：**每次請求都仍然不做任何 render**，那四頁在
建置期各 render 一次，其餘位址跟以前一樣是空外殼。10ms CPU 上限的處境沒有變。

`test/prerender.spec.ts` 盯著這條線：哪些位址被 prerender、catch-all 還在不在、
登入後的路由有沒有偷偷長出 `ssr: true`。

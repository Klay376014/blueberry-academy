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

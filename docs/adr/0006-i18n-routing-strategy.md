# ADR-0006：i18n 用 `prefix_except_default`，英文 URL 不帶前綴

- 狀態：Accepted
- 日期：2026-08-19
- 相關：#3、#8、#9、#13

## 脈絡

`@nuxtjs/i18n` 有四種 routing strategy。對本專案有意義的是三種：

| strategy                | 英文        | 中文                  |
| ----------------------- | ----------- | --------------------- |
| `no_prefix`             | `/about`    | `/about`（看 cookie） |
| `prefix_except_default` | `/about`    | `/zh-TW/about`        |
| `prefix`                | `/en/about` | `/zh-TW/about`        |

設計文件 §3 定調「介面英文為主、中文語系檔同步維護」，所以英文是預設語系。

`no_prefix` 最省事（URL 完全不變），但語系只存在 cookie 裡 —— **同一個 URL 對不同人
顯示不同語言**。這對登入後的私人儀表板本身還可接受，問題在它讓「把畫面連結貼給隊友」
失去語言資訊，而 #16、#17 產生的分析畫面正是會被貼來貼去的東西。

`prefix` 最一致，但代價是英文使用者（主要族群）每個 URL 都多一段 `/en`，且根路徑要
redirect。

## 決定

`strategy: 'prefix_except_default'`，`defaultLocale: 'en'`，locales 為 `en` 與 `zh-TW`。

## 後果

英文 URL 與遷移前完全相同（`/`、`/about`），所以 `test/nuxt/routing.spec.ts` 對
`nav a` 的 href 斷言（`['/', '/about']`）不需修改就繼續有效。

中文路由是 `/zh-TW`、`/zh-TW/about`。後續票新增頁面時，站內連結要走 `useLocalePath()`
或 `<NuxtLinkLocale>`，寫死的 `to="/about"` 在中文語系下會把使用者踢回英文。

`setLocale()` 在這個 strategy 下**會觸發路由導航**（切到 `/zh-TW`）。因此測試裡
`trigger('click')` 之後不能只 `await nextTick()` —— `trigger` 不會 await handler 回傳
的 promise。實測需輪詢（`vi.waitFor`）等 DOM 收斂，見 `test/nuxt/i18n.spec.ts`。

## 替代方案

- **`no_prefix`** —— 見上，可分享連結會失去語言資訊
- **`prefix_and_default`** —— 預設語系同時有 `/about` 與 `/en/about` 兩個 URL。多一組
  重複路由換不到本專案需要的東西

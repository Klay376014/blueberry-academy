# ADR-0004：Tailwind v4 走 `@tailwindcss/vite`，不用 `@nuxtjs/tailwindcss`

- 狀態：Accepted
- 日期：2026-08-19
- 相關：#3、#16、#17

## 脈絡

Nuxt 專案接 Tailwind 有兩條路：官方 Nuxt 模組 `@nuxtjs/tailwindcss`，或 Tailwind
自己的 Vite plugin `@tailwindcss/vite`。前者是「Nuxt 的做法」，第一眼看起來才對。

但本專案的工具鏈是 **Vite+（`vp`）**，底層是 Vite 8 / rolldown 而非標準 Vite。
`@nuxtjs/tailwindcss` 至今仍以 Tailwind v3 的 PostCSS 管線為主，而 Tailwind v4 的
官方接法就是 Vite plugin —— shadcn-vue 的 Nuxt 文件也是這麼寫的。

真正的未知數是 `@tailwindcss/vite` 跟 rolldown 合不合。**實測通過**（於 `apps/web`）：

```
$ vp -C apps/web run build
Σ Total size: 283 kB (88.8 kB gzip)
└  ✨ Build complete!
```

JIT scanning 正常 —— 產出的 `entry.*.css` 為 23772 bytes，且只含用到的 utilities：

| class                    | `grep -c` 於 entry.\*.css |
| ------------------------ | ------------------------- |
| `.text-muted-foreground` | 1（app.vue 用到）         |
| `.h-8`                   | 1（Button size=sm）       |
| `.bg-primary`            | 1（Button variant）       |
| `.grid-cols-12`          | **0**（沒用到）           |
| `.animate-bounce`        | **0**（沒用到）           |
| `.line-clamp-3`          | **0**（沒用到）           |

## 決定

`apps/web/nuxt.config.ts` 以 `vite.plugins` 掛載 `@tailwindcss/vite`，CSS 入口為
`app/assets/tailwind.css`（內容起於 `@import 'tailwindcss'`）。不安裝
`@nuxtjs/tailwindcss`。

## 後果

Tailwind 的升級節奏跟 Nuxt 模組脫鉤 —— 好處是 v4 的新功能不必等模組跟上，代價是
Nuxt 專屬的便利（模組自動注入 config 路徑等）要自己處理。目前只有一行 `css:` 與
一行 `vite.plugins:`，成本可忽略。

Tailwind v3 的 `tailwind.config.js` 不存在也不需要：v4 的 theme 定義在 CSS 裡的
`@theme` block，`components.json` 的 `tailwind.config` 欄位因此是空字串。

## 為什麼不改用 `@nuxtjs/tailwindcss`

看到專案用 Nuxt 卻沒裝 Nuxt 的 Tailwind 模組，很容易判斷成漏裝。**它不是漏裝。**
換過去要同時把 Tailwind 降回 v3（模組的 v4 支援還不成熟），而 v4 的 CSS-first
theme 是 shadcn-vue 2.x 產生的元件所依賴的 —— `app/assets/tailwind.css` 裡的
`@theme inline`、`@custom-variant dark` 都是 v4 語法，降版會全數失效。

## 替代方案

- **`@nuxtjs/tailwindcss` + Tailwind v3** —— 見上，會連帶推翻 shadcn-vue 的產出格式
- **PostCSS 手動接** —— Nuxt 支援自訂 postcss 設定，但 Tailwind v4 官方明確建議
  Vite plugin 優於 PostCSS plugin（前者能跳過 PostCSS 的 AST 來回）。沒有理由選劣路

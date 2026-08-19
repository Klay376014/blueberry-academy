# ADR-0007：Inter 由 `@nuxt/fonts` 自架，不用 Google Fonts CDN

- 狀態：Accepted
- 日期：2026-08-19
- 相關：#3、ADR-0005

## 脈絡

`shadcn-vue init --font inter` 會在 CSS 入口**頂端插入一行**：

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
```

這是新增的行為，不是既有的。遷移前的 `app/assets/base.css`（`create-vue` 樣板）只是把
Inter 列在 `font-family` 堆疊裡，**從未下載 webfont** —— 有裝 Inter 的人看到 Inter，
沒裝的人看到系統字型，零外部請求。

CSS 裡的 `@import url()` 是 render-blocking 的第三方請求，且會把使用者 IP 送給 Google。

## 決定

移除 CLI 插入的那一行，改裝 `@nuxt/fonts` 模組，並在 `@theme inline` 內把
`--font-sans` 設為 `Inter, ui-sans-serif, system-ui, -apple-system, sans-serif`。

## 後果

實測（`vp -C apps/web run build`）：

```
$ find .output/public/_fonts -type f | wc -l
14
$ du -sh .output/public/_fonts
224K
$ grep -o "@font-face{font-family:[^;]*;" .output/public/_nuxt/entry.*.css | head -3
@font-face{font-family:Inter;
@font-face{font-family:Inter Fallback\: BlinkMacSystemFont;
@font-face{font-family:Inter Fallback\: Segoe UI;
$ grep -ro "fonts.googleapis.com" .output/
（無輸出）
```

字型檔進 `.output/public/_fonts/`（14 個 woff2，共 224K），與 Worker 的靜態資產一起
從自家網域供應，runtime 零第三方請求。`@nuxt/fonts` 另外自動產生 fallback metrics
的 `@font-face`，減少字型載入時的版面跳動。

所有使用者看到的字型一致（不再取決於本機有沒有裝 Inter）。

## 為什麼不刪掉 `@nuxt/fonts`

**重跑 `shadcn-vue init` 會把 Google Fonts 那一行加回來。** 之後任何人重新初始化或
升級 shadcn 設定時，要記得再移除。CSS 頂端若出現 `@import url('https://fonts.
googleapis.com/...')`，那是 CLI 加的，不是刻意選的。

## 替代方案

- **保留 CLI 的 Google Fonts import** —— 最省事，代價是一個 render-blocking 第三方
  請求與使用者 IP 外流
- **只設 `font-family`、不載 webfont**（回到遷移前的行為）—— 零位元組成本，但字型外觀
  取決於使用者本機是否裝了 Inter，資料密集表格的排版會因人而異

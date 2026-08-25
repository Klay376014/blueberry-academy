# ADR-0002：Nitro 部署預設用 `cloudflare_module`

- 狀態：Accepted
- 日期：2026-08-19
- 相關：#2、PR #19、ADR-0001（`docs/adr/0001-spa-only-rendering.md`）

## 脈絡

部署目標是 Cloudflare Workers（設計文件 §3）。Nitro 對 Cloudflare 提供數個 preset，
名稱相近但產出不同：`cloudflare-pages`、`cloudflare-module`、`cloudflare-durable`，
外加一組 legacy preset。

**同一個名字會命中兩個 preset。** 讀 nitropack 2.13.4 的
`dist/presets/_resolve.mjs` 可知：`cloudflare-module` 既是新 preset 的 `name`，也是
`cloudflare-module-legacy` 的 alias。解析時先過濾出所有同名者，再**按
`compatibilityDate` 降冪排序取第一個**。新 preset 的 compatibilityDate 是
`2024-09-19`，因此只要專案的 `compatibilityDate` 不早於它，拿到的就是新版。

## 決定

`apps/web/nuxt.config.ts` 設 `nitro.preset: 'cloudflare_module'`。

底線寫法經 `kebabCase()` 正規化為 `cloudflare-module`，兩種寫法等價。

## 後果

- build 產出 `.output/server/index.mjs`（Workers module 格式）與 `.output/public/`
- build log 會印 `preset: cloudflare-module` —— 這是確認拿到新版而非 legacy 的方法
- 部署與預覽指令由 Nitro 印出：
  `npx wrangler deploy .output/server/index.mjs --assets .output/public`

## 已知警告：Node.js compatibility is not enabled

build 時 Nitro 會印：

```
[nitro] WARN [cloudflare] Node.js compatibility is not enabled.
```

目前走 unenv polyfill，**build 與產出正常**。要啟用原生 node compat 需要
`nitro.cloudflare.deployConfig: true` 讓 Nitro 產生 wrangler 設定，但 nitropack 的型別
說明明確警告：

> Enabling this option will cause settings from cloudflare dashboard (including
> environment variables) to be disabled and discarded.

對一個之後要放 Supabase 金鑰等環境變數的專案，這個副作用不可忽視。**因此刻意不開**，
留給實際處理部署的票決定。

**#48 的決定**：`apps/web/wrangler.jsonc` 自己寫 `compatibility_flags:
["nodejs_compat"]`。設定檔由我們維護、不由 Nitro 產生，上面那個副作用因此不存在 ——
node compat 開了，dashboard 的設定也還在。

## 替代方案

- **`cloudflare-pages`** —— Pages 的 Functions 模型與本專案的 Worker 型態不合
- **`cloudflare-durable`** —— 它 extends `cloudflare-module`，多的是 Durable Object
  入口。目前沒有 DO 需求

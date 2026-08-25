# ADR-0011：`NUXT_PUBLIC_*` 走 Worker 執行期變數，不是建置期輸入

- 狀態：Accepted
- 日期：2026-08-25
- 相關：#48、ADR-0001（`docs/adr/0001-spa-only-rendering.md`）、ADR-0002

## 脈絡

`ssr: false`，所以直覺的推論是「`runtimeConfig.public` 會在建置時烘進 client
bundle」，`NUXT_PUBLIC_SUPABASE_URL` / `NUXT_PUBLIC_SUPABASE_ANON_KEY` 因此是建置期
輸入，把它們設成 Worker 的環境變數不會有任何效果。#48 就是這樣寫的。

**實測結果相反。** 用 hosted 的值建置後：

```sh
grep -rlF pjhtzxmdmgolhnwnvunn apps/web/.output/   # 沒有任何檔案
```

URL 不在產出裡的任何地方 —— client bundle 沒有，server bundle 也沒有。`.output/public/`
底下也沒有 `index.html`：`ssr: false` 關掉的是頁面元件的伺服器渲染，Nitro server 仍在，
而每一個 HTML 回應都是它在請求當下算出來的 SPA shell，`runtimeConfig.public` 是那時候
才寫進 `__NUXT__` payload 的。`cloudflare_module` 的產出開頭是
`import{env as r}from"cloudflare:workers"`，讀的正是 Worker 的執行期環境。

用 `wrangler dev` 打一次即可分辨兩者 —— 建置時給 hosted 的值，執行時給另一個：

```sh
pnpm exec wrangler dev --var NUXT_PUBLIC_SUPABASE_URL:https://probe-runtime.example.com
curl -s http://127.0.0.1:8788/ | grep -o 'supabaseUrl[^,]*'
# supabaseUrl:"https://probe-runtime.example.com"
```

執行期的值贏了。建置期給什麼都會被蓋掉。

## 決定

`NUXT_PUBLIC_SUPABASE_URL` 與 `NUXT_PUBLIC_SUPABASE_ANON_KEY` 是 **Worker 的執行期
變數**，在 `wrangler deploy --var` 時傳入（`scripts/deploy.sh`），不寫進
`wrangler.jsonc`，也不需要在建置步驟就位。

來源只有一個：本機是 `apps/web/.env.hosted`，CI 是 GitHub secrets。

## 後果

- `pnpm build` 不需要任何 Supabase 值，CI 的建置步驟因此不必碰 secrets（#49 變簡單）
- 換 Supabase 專案不必重建，重新 deploy 即可
- `--var` 每次 deploy 都會整組覆寫，所以那兩個值必須每次都傳 —— 漏傳不是沿用舊值，
  而是變成空字串
- 驗收不能只看「deploy 成功」：`scripts/deploy.sh` 最後會 curl 線上 origin，確認 shell
  裡真的有 hosted URL
- 兩個值都是公開的（RLS 才是防線），放進 `--var` 這種明文變數沒有問題。`service_role`
  key 依然只屬於 `scripts/`

## 替代方案

- **建置期注入（`nuxt build --dotenv .env.hosted`）** —— 依然可用於本機預覽，但部署
  路徑上是無效的：執行期變數會蓋掉它。留著只會讓人以為值是從那裡來的
- **寫進 `wrangler.jsonc` 的 `vars`** —— 值會進版控。anon key 公開沒錯，但 `.gitignore`
  對 `.env*` 的態度是「不進 repo」，沒有理由在這裡破例
- **`wrangler secret put`** —— 一樣可行，但變成一個手動步驟，且 CI 與本機的路徑會不同

# ADR-0003：保留 `apps/web/vue-shims.d.ts`

- 狀態：Accepted
- 日期：2026-08-19
- 相關：#2、PR #19、#18

## 脈絡

`vp check` 的 type-aware lint 由 **tsgolint**（oxlint 的型別後端，建立在
TypeScript-Go 上）執行。它讀不懂 Vue SFC。

實測三層行為（於 `apps/web` 量測）：

| 層                | 對 `.vue`               | 證據                                                                                                       |
| ----------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| oxlint 語法規則   | ✅ 檢查 `<script>` 區塊 | SFC 內放 `debugger` → 抓到 `eslint(no-debugger)`                                                           |
| oxlint template   | ❌ 不檢查               | oxc 官方 compatibility 頁：Vue/Nuxt「No template linting yet」                                             |
| tsgolint 型別檢查 | ❌ 完全跳過 `.vue`      | SFC 內放 `const n: number = 'oops'` → `vp lint` **EXIT=0 無任何輸出**；同一錯誤 `nuxt typecheck` 報 TS2322 |

因此當 `.ts` 檔 import 一個 `.vue`（例如 `test/nuxt/routing.spec.ts` 匯入
`app/app.vue`），tsgolint 在做模組解析時撞到不認得的副檔名，報：

```
typescript(TS2307): Cannot find module '../../app/app.vue'
```

Nuxt 4 已不再產生 `env.d.ts`，所以升級後沒有任何檔案宣告 `*.vue` 模組。

## 決定

保留 `apps/web/vue-shims.d.ts`，內含 `declare module '*.vue'` 的 wildcard 宣告。

## 後果

**這不是型別安全的妥協。** `.vue` 在 `vp check` 的型別覆蓋率本來就是零 —— 加不加這個
檔案都一樣。它消掉的是一個假警報，沒有降低任何實際保護。

真正的型別防線是 `nuxt typecheck`（vue-tsc），且它是完整的：實測在 SFC 注入
`const n: number = 'oops'`，即使 shim 存在，vue-tsc 仍報 TS2322 並以 exit 2 結束。
vue-tsc 直接解析 `.vue` 檔，其結果優先於這個 wildcard 宣告。

代價：`.ts` 檔匯入 SFC 時拿到的是寬鬆的 `DefineComponent` 型別，而非該元件的精確
props/emits 型別。目前只影響測試檔。

## 為什麼不刪掉

`env.d.ts` 在 #2 被刪除（Nuxt 4 不再需要），所以看到 `vue-shims.d.ts` 的第一反應很
可能是「這是同一個東西的殘留，一起刪」。**刪掉會讓 `vp check` 失敗。**

## 替代方案

- **關掉根 `vite.config.ts` 的 `lint.options.typeCheck`** —— 這不會換回 `.vue` 的型別
  檢查（本來就是零），只會連帶失去 `packages/replay-parser` 的 type-aware lint。
  嚴格劣於保留 shim
- **接 `oxlint-plugin-vize`** —— 它補的是 **template 診斷**，不是模組解析。實測拿掉
  shim 後 TS2307 照樣出現。兩者互不取代；vize 的評估見 #18

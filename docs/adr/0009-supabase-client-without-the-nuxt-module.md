# ADR-0009：Supabase 用手寫 plugin 接入，不裝 `@nuxtjs/supabase`

- 狀態：Accepted
- 日期：2026-08-20
- 相關：#8、#7、#9

## 脈絡

`@nuxtjs/supabase` 提供 `useSupabaseClient()` / `useSupabaseUser()`、以 cookie 保存
session、以及一組用 `redirectOptions` 設定的擋路由行為。它的價值集中在**伺服器端**
—— server route 與 SSR 需要從 cookie 讀回 session，這件事手寫很煩。

但這個 app 是 `ssr: false`（ADR-0001），而且設計文件 §3 明確把匯入流程放在瀏覽器：
Workers 免費版的 50 subrequest 與 10ms CPU 上限讓 server 端根本跑不了匯入，
「前端拿使用者自己的 JWT + anon key 直寫 Supabase，靠 RLS 守資料」是既定架構。
換句話說，模組最值錢的那半邊，這個專案用不到。

**這個決定沒有做 spike。** 與 ADR-0005 不同，沒有實測兩種接法的產出差異 ——
判斷依據是「模組解決的問題（server 端 session）在 `ssr: false` 下不存在」這個前提，
而非量到的數字。若哪天某條路由真的開了 SSR，這個前提就失效，屆時該重新評估。

## 決定

直接用 `@supabase/supabase-js`：

- `app/plugins/supabase.client.ts` —— 建立唯一的 client，開機時 `getSession()`
  還原 session，並訂閱 `onAuthStateChange`
- `app/composables/useCurrentUser.ts` —— 用 `useState` 持有目前使用者
- `app/composables/useAuth.ts` —— app 對認證能做的全部事情（登入、完成登入、登出）
- `app/middleware/auth.global.ts` —— 預設全部擋，公開路由用白名單列舉

## 後果

**好的：** 擋路由的行為是一支讀得懂的檔案，而不是模組 config 的組合；`useAuth` 成為
唯一的接縫，測試只要換掉它就能測任何頁面（見 `test/nuxt/auth.spec.ts`）；沒有任何
用不到的 server middleware 被打包進 Worker。

**代價：** session 存在 localStorage 而非 cookie，所以**日後若有路由要開 SSR，
server 端讀不到登入狀態**，得自己補 cookie 那一段（或屆時改裝模組）。這是這個決定
唯一真正的債，寫在這裡是為了讓那天的人知道要找什麼。

`detectSessionInUrl` 關掉是配套而非偏好：`/auth/callback` 自己呼叫
`exchangeCodeForSession()`，才知道什麼時候換完；開著會讓 client 與該頁搶同一個 code。

## 替代方案

- **`@nuxtjs/supabase`** —— 未來開 SSR 時的正解。現在裝的代價是多一套慣例與用不到的
  server 部分，換來的功能這個 app 不需要
- **每個元件各自 `createClient()`** —— 會產生多個 client 與多份 session 監聽，
  `onAuthStateChange` 的訂閱數隨元件數成長

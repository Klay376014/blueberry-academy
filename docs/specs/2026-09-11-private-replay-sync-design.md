# 私人 replay 的同步 — 設計文件

- 日期：2026-09-11
- 狀態：已定案，待實作。§6 的 spike 已於 2026-09-12 通過（#175），其餘的票不再被擋
- 相關文件：[replay 分析主設計](2026-08-16-replay-analytics-design.md) §2 §3 §10、[spike 實測筆記](2026-09-11-private-replay-sync-spike.md)、[CONTEXT.md](../../CONTEXT.md)、[實作守則](../../AGENTS.md)
- 實作票：GitHub issue #175（spike）、#176（`Secret`）、#177（CSP）、#178（Worker route）、#179（表單）、#180（`refsOf`）、#181（OAuth 陳述更正）

這份文件記錄「為什麼」。實作步驟見 GitHub issue，領域詞彙見 CONTEXT.md。

---

## 1. 目標

讓**私人 replay** 也能像公開場次一樣被同步進來，使用者不必在每場打完的當下記得複製
連結。

現況：`useIngest.syncAccount` 走 `search.json?user=`，而那個端點只認得公開 replay
（`useShowdown.ts` 的註解已經寫著「Private replays are not in a search and come in by
their link instead」）。私人場次因此是**唯一一類「不當場保存就會從我們這邊消失」**的
場次 —— 而 CONTEXT.md 在意的賽事 Bo3 正好大量落在這一類（隱藏房的對戰，replay 一律
帶密碼）。

### 明確不做的事

**不做常駐連線。** 曾經評估以 PS 的 OAuth + WebSocket 開一條長連線，在對戰結束當下
自動 `/savereplay` 並收下含密碼的連結（§9 決策 D1）。技術上可行且已驗證到協定層，但
它要求一個常駐服務、一次向 PS 申請的 `client_id`，以及按牆鐘計費的成本。這次不做。

**不儲存任何 Showdown 憑證。** 密碼與 session 都只活在一次請求裡（§5）。

**不改動 ingest 管線。** `useIngest`、`packages/replay-parser`、`packages/battle-row`、
`scripts/reparse.ts` 一行不動。Worker 只回傳 `ReplayRef[]`，抓取、存 raw log、解析、
寫列全部留在瀏覽器 —— 主設計 §2 §3 的「ingest 在瀏覽器」原封不動。

**不改變別名的信任模式。** 私人同步成功其實**證明了**該帳號的擁有權（PS 要求登入的
身分必須在搜尋的名單裡，§2.2），但把「已驗證」引進 `profiles` 會牽動歸屬推導與
ADR-0012，不屬於這張票。留待 §10。

---

## 2. 已驗證的外部事實

分兩類，因為證據強度不同。

### 2.1 實測（curl，2026-09-11）

**CORS 的分界線就是這件事的全部。** 對每個端點帶 `Origin: https://example.com`：

| 端點                                         | 回應                                                                                         |
| -------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `/search.json?user=zarel`                    | `access-control-allow-origin: https://example.com`、`access-control-allow-credentials: true` |
| `/api/replays/search?username=zarel`         | 同上                                                                                         |
| `/<id>-<pw>pw.json`                          | 同上（404 亦帶標頭）                                                                         |
| `/api/replays/searchprivate?username=zarel`  | **完全沒有任何 `access-control-*` 標頭**                                                     |
| `/api/replays/check-login`                   | 同上，沒有                                                                                   |
| `play.pokemonshowdown.com/api/login`（POST） | 同上，沒有                                                                                   |

`searchprivate` 未登入時的回應本體是 `]{"actionerror":"Access denied: You must be logged
in."}`（前導 `]` 是 PS 的防 JSON 劫持前綴，客戶端要切掉）。

**結論：私人 replay 的「列出」在瀏覽器裡永遠做不到**，無論怎麼帶 credentials。這不是
暫時的限制，是 PS 刻意只對自家網域開口（`Config.cors` 白名單，`server.ts:188`
`verifyCrossDomainRequest`）。

### 2.2 讀 PS 原始碼，並以真帳號實測（spike，2026-09-12）

來源：[`smogon/pokemon-showdown-loginserver`](https://github.com/smogon/pokemon-showdown-loginserver)。

1. **session 可以走 POST body，不必是 cookie** —— `src/user.ts:481`：

   ```ts
   const scookie = body.sid || this.cookies.get('sid')
   ```

   PS 自己的 testclient 就是這樣運作的（client repo 的
   `POKEMON_SHOWDOWN_TESTCLIENT_KEY`）。

2. **格式是三段式，而且 body 路徑不解碼。** cookie 的值是
   `encodeURIComponent([name, sessionId, sidhash].join(','))`（`user.ts:119`），
   cookie 路徑會 `decodeURIComponent`（`user.ts:93`），**`body.sid` 路徑不會**。
   所以傳進 body 的必須是**解碼後**的 `name,sessionId,sidhash`。這是最容易做錯的一步。

3. **`act=login`** 必須 POST，回 `{ actionsuccess, assertion, curuser }`，並以
   `Set-Cookie` 發出 sid（`actions.ts:210`）。回應本體**不含** sid。

4. **session 效期 14 天** —— `SID_DURATION = 2 * 7 * 24 * 60 * 60`（`user.ts:21`）。
   **這一條的 spike 結果存疑**：實際發出的 cookie 是 `Max-Age=31363200`（約 363 天），
   比這裡大一個數量級。兩者未必矛盾（`Max-Age` 是瀏覽器留多久，`SID_DURATION` 是伺服器
   認多久），但唯一量得到的數字不支持它，而量伺服器端要等 14 天，沒量。
   對本設計無影響 —— D2 不存 sid，用完就 logout。詳見 spike 筆記。

5. **`act=logout`** POST + `userid`，執行 `sessions.delete(this.session)`
   （`actions.ts:195`）。只刪這一個 session，**不會把使用者在別處登出**。

6. **`searchprivate` 只讓你搜自己** —— `actions.ts:1095`：
   `if (!(user.isSysop() || usernames.includes(user.id)))` 就拒絕。

7. **驗證不綁 IP** —— `checkLoggedIn` 只比對 sid hash、`timeout`、`userid`
   （`user.ts:502`）。session 建立時記錄的 `ip` 不參與驗證，所以 Worker 換出口 IP 不影響。

8. **使用者有 kill switch** —— 改密碼會執行
   `sessions.deleteAll() WHERE userid = ...`（`user.ts:355`）。

9. **沒有事後補救的途徑**：`replays/edit` 第一行是
   `if (!user.isLeader()) throw new ActionError('Access denied.')`（`actions.ts:1108`），
   使用者連把自己的私人 replay 改成公開都做不到；`replays/batch` 的 SQL 寫死
   `WHERE private = 0`（`replays.ts:247`）；密碼是 `generatePassword(length = 31)` 以
   `crypto.randomInt` 逐字產生，猜不到。

> **spike（#175）量到哪裡為止，逐條記在
> [spike 實測筆記](2026-09-11-private-replay-sync-spike.md)。**
>
> - **量過且成立**：1（sid 走 POST body）、2（decode，實際做過才通）、3（`act=login`
>   的形狀與 `Set-Cookie`）、5 的前半（logout 之後那個 sid 就被拒絕）、7（換出口 IP 仍有效）。
> - **量過但存疑**：4（見上，唯一量得到的數字比它大一個數量級）。
> - **只量到一半**：6 —— 確認了「登入後搜自己拿得到」，**沒有**試過搜別人是否被拒。
>   5 的後半（不影響別處的 session）同理，spike 當時只有一個 session。
> - **完全沒量**：8（改密碼讓所有 session 失效 —— 不會拿真帳號的密碼去試）、9（沒有事後
>   補救的途徑），以及 §4 的分頁假設 —— `searchprivate` 要超過 51 筆私人 replay 才翻得到
>   第二頁，測試帳號只有 32 筆。#178 的分頁只能對 fixture 驗。
>
> **沒有任何一條被實測推翻。** 但「沒推翻」不等於「都量過了」，上面的分類就是差別所在。

---

## 3. 硬點

1. **必須有伺服器中繼。** 由 §2.1 直接推出。這是這個功能第一次讓
   `apps/web/server/` 有實質邏輯。

2. **密碼無法避免地會經過我們的 Worker。** PS 確實有 OAuth
   （`loginserver/src/oauth.ts`），但它換到的是 **assertion**，只對 sim server
   （WebSocket）有效；loginserver 的 HTTP action 一律走 session。兩者不互通，所以
   OAuth **換不到** `searchprivate` 需要的東西。走這條路就是接受密碼過境。

3. **風險集中在我們自己的日誌輸出。** Cloudflare 的 observability 記錄的是叫用
   metadata 與 `console.*` 的輸出，**不記 request body**。所以要防的不是平台，是一行
   手滑的 `console.log`。這可以用型別擋掉（§5）。

4. **拿到的連結含密碼，而 ingest 早就準備好了。**
   `shared/utils/replayLink.ts` 的 `parseReplayLink` 已經會剝 `-<password>pw` 後綴並把
   密碼放在 `ReplayRef.password`；`useShowdown.fetchReplay` 已經會把它拼回
   `<id>-<pw>pw.json`。**所以匯入端一行都不用改。**

5. **本專案目前沒有 CSP。** `nuxt.config.ts` 沒有設任何 headers，`apps/web/public/`
   只有圖示檔。要在頁面上收密碼，這一項得先補。

---

## 4. 架構

```
瀏覽器                    我們的 Worker                     Showdown
  │                            │                               │
  │ POST {name, password} ────>│                               │
  │                            │ POST act=login ──────────────>│
  │                            │<────────── Set-Cookie: sid ───│
  │                            │ POST act=replays/searchprivate│
  │                            │      (sid in body, 逐頁) ────>│
  │                            │<──────── 含密碼的清單 ────────│
  │                            │ POST act=logout ─────────────>│
  │<──── ReplayRef[] ──────────│                               │
  │                            │  (sid 與密碼隨請求結束消失)
  │
  │ importMany(refs) ─────────────────────────────────────────>│ 逐一抓 replay
  │ （現有管線，未改動）
```

三個呼叫的 host 不同一個（spike 實測）：`login` 與 `logout` 在
`play.pokemonshowdown.com`，`replays/searchprivate` 在 `replay.pokemonshowdown.com`。
另外 `login` 回的 `assertion` 在沒有 challstr 時就是一句錯誤訊息，**不是**登入成敗的
判準 —— 看 `actionsuccess` 與有沒有拿到 sid。

**Worker 只做翻譯，不做匯入。** 它回傳的是 `ReplayRef[]`，交給現有的
`useIngest.importMany`。

這維持了主設計 §2 §3 的理由（Workers 免費方案的 50 subrequest
與 10ms CPU 預算做不完一次匯入），也讓這條 route 保持**完全無狀態** —— 不寫 Supabase、
不寫 KV、不寫 Durable Object。

> 實作時（#178）多帶了一個 `truncated`，回傳 `{ refs, truncated }` —— 與
> `useShowdown.listReplays` 回 `ReplayList` 同一個理由。碰到上限而不說，等於默默漏掉
> 後面的場次。
>
> 上限是 **20 頁**（約 1000 場），比 subrequest 允許的 48 頁保守得多。真正緊的是 10ms
> CPU：每一頁都是一次 body 解碼加一次 51 列的 `JSON.parse`，而**兩個預算都沒有在這條
> 路上量過**。超過 CPU 是直接被砍 —— 沒有回應，`finally` 裡的 logout 也不會跑 ——
> 不是程式承諾的 `truncated`。要調高得先量。

`searchprivate` 一頁 51 筆、頁與頁之間共用一列，與 `listReplays` 現有的分頁處理同構，
分頁與去重的規則沿用 `useShowdown.ts` 既有的那一套，不另外發明。**這一句仍然只讀過
原始碼**：spike 的帳號只有 32 筆私人 replay，翻不到第二頁（§2.2 的但書）。

---

## 5. 憑證怎麼處理

五層，由內而外。

### 5.1 架構上就沒有東西可洩漏

那條 route 無狀態。sid 只活在一次請求的閉包裡，用完立刻 `act=logout`
（§2.2.5）—— 我們來過，並且把門帶上。

### 5.2 讓密碼「印不出來」

不透明包裝型別，值放在 `WeakMap` 側表：

```ts
const values = new WeakMap<Secret, string>()

export class Secret {
  constructor(value: string) {
    values.set(this, value)
  }
  /** The one place the value comes back out. */
  expose() {
    return values.get(this)!
  }
  toString() {
    return '[redacted]'
  }
  toJSON() {
    return '[redacted]'
  }
}
```

**值不能放在物件欄位上，`#private` 也不行** —— V8 inspector 會把 private field 印出來，
而 `console.log` 走的正是它。放在 `WeakMap` 裡，物件本身沒有任何屬性，
`console.log(secret)` 印出的是 `Secret {}`，`JSON.stringify` 是 `"[redacted]"`，
樣板字串也是 `[redacted]`。

拿到值的唯一途徑是 `.expose()`，而整個 repo 裡那個呼叫點只會有一個：送去 PS 的那一行。
**要洩漏得刻意為之。**

### 5.3 lint 擋住 console

那個資料夾禁用 `console`。這跟 `vite.config.ts` 現在用 `no-restricted-imports` 守
feature 邊界是同一套做法 —— 可執行的規則，不是註解裡的約定。

### 5.4 憑證不進 URL

密碼與 sid 一律走 POST body。query string 會進各層 access log。

### 5.5 CSP

全站加 CSP（§3.5）。這件事不管做不做私人同步都該做，而且代價很低：ADR-0007 已經自架
Inter、Supabase SDK 也是打包進去的，本來就幾乎沒有第三方來源。

### 沒有技術解的一項

密碼管理員會把 PS 密碼記在我們的網域下，而這會養成「把 PS 密碼打進非 PS 網站」的習慣。
只能在表單旁邊誠實寫明，技術上無解。**UI 必須講清楚密碼會被送到哪裡、留存多久
（不留存）、以及可以改密碼一鍵失效所有 session（§2.2.8）。**

---

## 6. 實作順序

**#1 是其餘所有票的前提。**

| 票   | 內容                                                                                                                                                                                                     | 相依       |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| #175 | ~~**Spike**：用真帳號驗證 `act=login` → `body.sid` → `searchprivate` → `act=logout` 的完整往返，把 §2.2 升級成實測~~ **已完成 2026-09-12**，見 [spike 實測筆記](2026-09-11-private-replay-sync-spike.md) | —          |
| #176 | `Secret` 包裝型別 + 禁用 `console` 的 lint 規則                                                                                                                                                          | —          |
| #177 | 全站 CSP                                                                                                                                                                                                 | —          |
| #178 | `server/api/showdown/sync-private` route                                                                                                                                                                 | #175, #176 |
| #179 | 匯入頁的私人同步表單                                                                                                                                                                                     | #177, #178 |
| #180 | `refsOf` 改成能從任意文字撈出連結                                                                                                                                                                        | —          |
| #181 | 更正「Showdown 沒有 OAuth」的陳述（`useProfile.ts` 的 JSDoc、`profiles.showdown_usernames` 的 column comment，後者要一支 migration）                                                                     | —          |

相依關係以 GitHub 原生的 issue dependencies 表示，不是只寫在內文裡。
#176、#177、#180、#181 彼此獨立，也不等 spike。

---

## 7. 測試策略

- **Worker route**：以 fixture 模擬 PS 的三個回應（login 的 `Set-Cookie`、searchprivate
  的帶 `]` 前綴的 JSON、logout），測分頁、去重、`]` 前綴、錯誤密碼、以及**用完一定
  呼叫 logout**。
- **`Secret`**：測 `console.log` 之外的三條洩漏路徑都印出 `[redacted]`
  （`String()`、樣板字串、`JSON.stringify`）。
- **lint 規則**：照 `test/architecture.spec.ts` 的既有做法，規則本身要有測試。
- **`refsOf`**：貼一段含雜訊的聊天記錄，撈出全部連結。
- 不對 PS 發真實請求 —— 沿用 `packages/replay-parser` 以真實 log 當 fixture 的精神。

---

## 8. 已知限制與接受的風險

1. **密碼過境我們的伺服器。** 這是走這條路的入場費，§5 把它壓到「要洩漏得刻意為之」，
   但壓不到零。適用範圍是「自己 + 認識的朋友」；要開放給陌生人，這個設計要重審。
2. **每次同步都要重新輸入密碼。** 這是刻意的（不存 sid），批次同步的節奏讓它可接受。
3. **`searchprivate` 的分頁上限沿用 PS 的限制。** 與 `listReplays` 現有的 `truncated`
   處理一致，不另行處理。
4. **綁定仍是信任模式。** 見 §1「明確不做的事」與 §10。
5. **超過上限的私人 replay 用這條路拿不到。** 列出永遠從第一頁開始，沒有 cursor 也沒有
   起始頁參數，所以碰到 20 頁上限之後**再跑一次只會拿到同一批**。UI 因此不說「再試一次」
   —— 它說的是實話：這是最新的那批，更舊的請貼連結（連結本身帶密碼，§3.4）。
   要真的拿到，得把起始頁一路穿過 route 與 `syncPrivate`，而那需要一個「從哪裡繼續」的
   UI，不屬於這張票。

### 未解決：這條 route 對第三方是開放的

第 1 點說「密碼過境我們的伺服器」，講的是**使用者自己的**密碼。它沒有涵蓋另一件事：
`POST /api/showdown/sync-private` 沒有任何呼叫者驗證，所以知道網址的人都能送任意
`{ name, password }`，並從 401 與 200 的差別讀出「這組帳密對不對」—— 也就是拿我們的
網域與 Cloudflare 出口 IP 當 Showdown 的撞庫 oracle。`readBody` 收
`application/x-www-form-urlencoded`，跨站表單連 preflight 都不需要。

**已解決（#179）：要求已登入的呼叫者。** 呼叫者的 Supabase access token 放
`Authorization`，Worker 拿它打一次 `${supabaseUrl}/auth/v1/user`（`server/caller.ts`），
200 才往下走。一個 subrequest，仍然無狀態，不需要 `service_role`，而匯入頁本來就在登入
後面，所以使用者無感。#178 因此刻意不單獨合併 —— 那會讓 `main` 一度多出一個公開端點
（CI 合併即部署）。

代價是 `apps/web/server/` 第一次認識 Supabase 的存在；
[ADR-0009](../adr/0009-supabase-client-without-the-nuxt-module.md) 已補上說明，並修正了
它原本的判準（觸發條件是「server 端要**從 cookie** 讀登入狀態」，不是「要知道是誰」）。

否決的替代方案：

- **每 IP 限流** —— 要狀態（KV 或 Durable Object），與 §4「完全無狀態」相衝。
- **只比對 `Origin`** —— 擋得住瀏覽器裡的第三方網頁，擋不住 curl，而撞庫用的正是後者。

**仍未擋的事**：已登入的使用者可以拿這條 route 試別人的 Showdown 帳密，而且**次數沒有
上限** —— 驗的是「有沒有登入」，不是「這個人試了幾次」（`callerOf` 回的 id 目前沒有被
用到）。範圍是「自己 + 認識的朋友」（§8.1）；要開放給陌生人，per-caller 的節流是第一
件要補的事，而它需要狀態，與 §4 的無狀態相衝。

### 狀態碼要分得開

`401` 是「你沒登入**我們**」，`422` 是「Showdown 不接受這組帳密」。兩者都拼成 401 會讓
表單無法分辨，而它們的下一步完全不同：一個是重新登入，一個是檢查 Showdown 密碼。

---

## 9. 決策紀錄

**D1 — 不做 WebSocket 常駐連線。**
唯一能做到「零操作且涵蓋私人場次」的方案，而且調查到協定層都是通的：PS 有完整 OAuth
（`loginserver/src/oauth.ts`，授權頁導回 `?assertion&token&user`）；
`wss://sim3.psim.us/showdown/websocket` 實測回 101 並立刻送出 `|challstr|`，是純文字
frame 不含 SockJS 封裝；`|updatesearch|` 的 `JSON.games` 會在對戰開始與結束時送出，
而私人對戰的 roomid 本身就含密碼；`/savereplay` 後伺服器以 `|popup|` 把含密碼的完整
網址送回**該條連線**（`pokemon-showdown/server/rooms.ts:2102`）。
否決的理由不在協定，在維運：**Cloudflare 的出站 WebSocket 不會休眠**
（「Hibernation is only supported when a Durable Object acts as a WebSocket server.
Outgoing WebSockets do not hibernate.」），所以一條常駐連線按牆鐘計費 ——
0.125 GB × 86,400s = 10,800 GB-s/天，免費方案的每日額度是 13,000，付費方案每月含
400,000（常駐一個月 328,500）。第一條塞得進 $5 月費，**第二條起約 $4.1/月/同時在線
使用者**。再加上一次時程不可控的 `client_id` 申請，以及這個專案第一次會有「半夜自己
壞掉」的東西。它買的是方便，不是資料不遺失（見 D3）。

**D2 — 不儲存 sid。**
存 sid 可以換掉「每次輸入密碼」，效期 14 天。否決是因為它把風險從**傳輸中**換成
**靜態儲存**：sid 不是唯讀的 replay 權限，它就是那個帳號。而使用者的同步節奏是累積一批
才回頭處理，省下的那次輸入不值得。

**D3 — 不做 bookmarklet，儘管它零憑證。**
一個跑在 `replay.pokemonshowdown.com` 上的 bookmarklet 可以同源呼叫
`searchprivate`、翻完所有頁、把清單帶回我們的匯入頁，全程沒有任何憑證離開 PS 的網域，
而且不需要 `client_id`。否決的理由是使用習慣：它要求使用者改變動線（先去 PS 的頁面、
點書籤、再回來），而且手機上難用。

> **順帶更正一個前期的錯誤判斷：私人 replay 不會永久遺失。** 使用者本人隨時可以在
> `replay.pokemonshowdown.com` 登入後選「Private (your own replays only)」把它們找回來，
> 而且結果清單渲染出來的連結**本身就含密碼**
> （client repo `replay.pokemonshowdown.com/src/replays-index.tsx:27`）。
> 所以這整個功能買的是**省去人工**，不是**避免資料遺失**。這個區分直接決定了 D1 的
> 成本效益，值得記下來。

**D4 — Worker 只回傳清單，不做匯入。**
維持主設計 §2 §3。順帶讓這條 route 保持無狀態，這正是 §5.1 的基礎。

---

## 10. 未來方向

- **把私人同步的成功當成擁有權證明。** PS 要求登入的身分必須在搜尋名單裡
  （§2.2.6），所以一次成功的私人同步，就是 CONTEXT.md 目前說「無法驗證」的那件事的
  證明。要用它得動 `profiles`、歸屬推導與 ADR-0012，值得單獨一份設計。
- **PS 的 OAuth 可以做到同一件事而且不碰密碼**，代價是向 PS 申請 `client_id`。若哪天
  要開放給陌生人，這是該走的路。
- D1 的調查結果保留在本文件，之後要回頭撿不必重查。

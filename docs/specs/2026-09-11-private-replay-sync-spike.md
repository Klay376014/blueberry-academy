# 私人 replay 的同步 — spike 實測筆記

- 日期：2026-09-12
- 狀態：實測完成，#175 的交付物。設計文件 §2.2 依此**部分**升級為實測 —— 哪幾條、
  哪幾條沒有，見下面的涵蓋範圍表
- 相關：[私人 replay 的同步 設計文件](2026-09-11-private-replay-sync-design.md) §2.2 §6、
  GitHub issue #175
- 放這裡的理由：這是**外部行為的實測結果** —— AGENTS.md 實作守則第一條的第二類，與
  [zh-Hant 名稱來源調查](2026-09-02-zh-hant-name-sources-research.md) 同一種文件。

---

## 怎麼量的

`scripts/spike-private-replay.ts`，一支本機腳本，對真帳號跑完整條往返：
`act=login` → 從 `Set-Cookie` 取 sid → `replays/searchprivate`（sid 放 POST body、逐頁）
→ `act=logout`。密碼走 `PS_PASSWORD` 環境變數，腳本拒絕任何把密碼放進 argv 的旗標
（`ps` 讀得到 argv）。輸出的 transcript 由 `redactorFor` 把密碼、sid 與清單裡的 replay
密碼一律換成 `[redacted]`，兩種拼法（原字串與 percent-encoded）都塗。

分兩段跑，中間換出口 IP：

```sh
# 第一段：本機網路，--keep-session 跳過 logout 並印出 sid
read -rs PS_PASSWORD && export PS_PASSWORD
PS_USERNAME=notlittlestar node scripts/spike-private-replay.ts --keep-session

# 第二段：另一個出口 IP（手機熱點），同一個 sid，跑完收尾
PS_USERNAME=notlittlestar PS_SID='[redacted]' node scripts/spike-private-replay.ts
```

帳號 `notlittlestar`，當時有 32 筆私人 replay。

## 結果

設計文件 §2.2 逐條，以及 #175 列的七項。

| #   | 主張                                                                             | 實測                                                                                |
| --- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | `act=login` 回 `{ actionsuccess, assertion, curuser }`，並以 `Set-Cookie` 發 sid | ✅ 200，body 的 key 正好是 `actionsuccess, assertion, curuser`；sid 在 `Set-Cookie` |
| 2   | sid 是 `encodeURIComponent(name,sessionId,sidhash)`，進 body 前必須 decode       | ✅ 解碼後三段，第一段是帳號 id（`notlittlestar`）                                   |
| 3   | sid 放 POST body 就能拿到**含密碼**的私人清單                                    | ✅ 32 列，**32 列都帶密碼**                                                         |
| 3b  | 沒有 sid 的同一個請求會被拒絕                                                    | ✅ 200 `]{"actionerror":"Access denied: You must be logged in."}`                   |
| 4   | 回應本體帶前導 `]`                                                               | ✅ `body[0] === ']'`                                                                |
| 5   | 分頁與 `search.json` 同構（一頁 51 筆、相鄰頁共用一列）                          | ⚪ **未實測**，見下                                                                 |
| 6   | `act=logout` 之後同一個 sid 再打 `searchprivate` 會被拒絕                        | ✅ logout 200，之後 `]{"actionerror":"Access denied: You must be logged in."}`      |
| 7   | 換一個出口 IP，同一個 sid 仍然有效（`checkLoggedIn` 不比對 IP）                  | ✅ 第二段在另一個出口 IP 上拿到同樣的 32 列                                         |

**沒有任何一條被實測推翻**，`body.sid` 的 decode（設計文件 §2.2.2，「最容易做錯的一步」）
也確認了 —— 送進去的是解碼後的三段字串。

但「沒被推翻」不等於「§2.2 都量過了」。實際的涵蓋範圍：

| §2.2 | 主張                              | 這次                                                      |
| ---- | --------------------------------- | --------------------------------------------------------- |
| 1    | sid 可走 POST body                | ✅ 量過                                                   |
| 2    | 三段式，body 路徑不解碼           | ✅ 量過                                                   |
| 3    | `act=login` 的形狀與 `Set-Cookie` | ✅ 量過                                                   |
| 4    | session 效期 14 天                | ⚠️ **存疑**，見下節第 3 點                                |
| 5    | logout 只刪這一個 session         | ◐ 前半量過（那個 sid 死了）；後半沒有 —— 只有一個 session |
| 6    | `searchprivate` 只讓你搜自己      | ◐ 前半量過（搜自己拿得到）；**沒試過搜別人是否被拒**      |
| 7    | 驗證不綁 IP                       | ✅ 量過                                                   |
| 8    | 改密碼是 kill switch              | ⚪ 沒量 —— 不會拿真帳號的密碼去試                         |
| 9    | 沒有事後補救的途徑                | ⚪ 沒量 —— 唯讀的推論，這次不需要                         |

第 6 項的後半（搜別人被拒）**對 #179 有影響**：設計文件說「先在我們這邊擋掉未綁定的名字，
錯誤訊息才講得出人話」，前提是 PS 本來就會擋。那個前提仍然只讀過原始碼。實務上影響很小
（擋在我們這邊本來就是為了訊息好看），真要驗也很容易 —— 拿現成的 sid 去搜一個別人的
名字就行，只是這次的腳本沒做。

### 分頁那項為什麼是空的

`searchprivate` 的分頁需要**超過 51 筆**私人 replay 才翻得到第二頁，這個帳號只有 32 筆。
腳本照實標成「未實測」而不是讓它通過。

**對 #178 的影響：** 分頁與去重的規則沿用 `useShowdown.listReplays` 既有那一套（設計文件
§4），但那是**假設 `searchprivate` 與 `search.json` 同構**，而這個假設仍然只讀過原始碼。
#178 的分頁測試因此只能對 fixture 驗，不能宣稱量過真實行為；等哪天有帳號累積到 51 筆以上
再回來補這一項。

## 逐一請求

腳本輸出的原文，憑證已塗掉，每個 body 截到 600 字元。

> 這份 transcript 出自 2026-09-12 當天那一版腳本。事後依 code review 加固過（`--flag=value`
> 的密碼、logout 移進 `finally`、逐頁收集要塗掉的密碼、先塗再截、`toID` 正規化），
> **送出去的請求本身沒有改** —— 帳號 `notlittlestar` 本來就是 id，`toID` 後同一個字串。

### 第一段（本機網路，`--keep-session`）

```
POST https://play.pokemonshowdown.com/api/login
  body fields: name, pass
  → 200
  set-cookie: sid=[redacted]; Max-Age=31363200; Domain=pokemonshowdown.com; Path=/; Secure; SameSite=None
  body: ]{"actionsuccess":true,"assertion":";;This server is requesting an invalid login key. This probably means that either you are not connected to a server, or the server is set up incorrectly.","curuser":{"loggedin":true,"username":"notlittlestar","userid":"notlittlestar"}}

POST https://replay.pokemonshowdown.com/api/replays/searchprivate
  body fields: username, page
  → 200
  set-cookie: (none)
  body: ]{"actionerror":"Access denied: You must be logged in."}

POST https://play.pokemonshowdown.com/api/replays/searchprivate
  body fields: username, page
  → 200
  set-cookie: (none)
  body: ]{"actionerror":"Access denied: You must be logged in."}

POST https://replay.pokemonshowdown.com/api/replays/searchprivate
  body fields: username, page, sid
  → 200
  set-cookie: (none)
  body: ][{"uploadtime":1786863388,"id":"gen9championsvgc2026regmb-2665619004","format":"[Gen 9 Champions] VGC 2026 Reg M-B","players":["emiriatantan","NotLittleStar"],"rating":1586,"private":1,"password":"[redacted]"},{"uploadtime":1786863150,"id":"gen9championsvgc2026regmb-2665611320","format":"[Gen 9 Champions] VGC 2026 Reg M-B","players":["NotLittleStar","ido1234567890"],"rating":1591,"private":1,"password":"[redacted]"},{"uploadtime":1786677558,"id":"gen9championsvgc2026regmb-2664597025","format":"[Gen 9 Champions] VGC 2026 Reg M-B","players":["wsd VGC","
```

### 第二段（另一個出口 IP，同一個 sid，跑完收尾）

```
POST https://replay.pokemonshowdown.com/api/replays/searchprivate
  body fields: username, page, sid
  → 200
  set-cookie: (none)
  body: ][{"uploadtime":1786863388,"id":"gen9championsvgc2026regmb-2665619004","format":"[Gen 9 Champions] VGC 2026 Reg M-B","players":["emiriatantan","NotLittleStar"],"rating":1586,"private":1,"password":"[redacted]"},{"uploadtime":1786863150,"id":"gen9championsvgc2026regmb-2665611320","format":"[Gen 9 Champions] VGC 2026 Reg M-B","players":["NotLittleStar","ido1234567890"],"rating":1591,"private":1,"password":"[redacted]"},{"uploadtime":1786677558,"id":"gen9championsvgc2026regmb-2664597025","format":"[Gen 9 Champions] VGC 2026 Reg M-B","players":["wsd VGC","

POST https://play.pokemonshowdown.com/api/logout
  body fields: userid, sid
  → 200
  set-cookie: sid=;Max-Age=0; Domain=pokemonshowdown.com; Path=/; Secure; SameSite=None
  body: ]{"actionsuccess":true}

POST https://replay.pokemonshowdown.com/api/replays/searchprivate
  body fields: username, page, sid
  → 200
  set-cookie: sid=%2C%2C<hash>; Max-Age=0; Domain=pokemonshowdown.com; Path=/; Secure; SameSite=None
  body: ]{"actionerror":"Access denied: You must be logged in."}

POST https://play.pokemonshowdown.com/api/replays/searchprivate
  body fields: username, page, sid
  → 200
  set-cookie: sid=%2C%2C<hash>; Max-Age=0; Domain=pokemonshowdown.com; Path=/; Secure; SameSite=None
  body: ]{"actionerror":"Access denied: You must be logged in."}
```

## transcript 才看得到的三件事

設計文件沒有寫、對照表也看不出來，但 #178 需要的：

### 1. `searchprivate` 在 `replay.pokemonshowdown.com`

腳本先打 `replay.`、答不出來才退到 `play.`。**帶 sid 的那次第一發就成功**，沒有觸發退路。
所以 #178 寫死：

- `POST https://play.pokemonshowdown.com/api/login`
- `POST https://replay.pokemonshowdown.com/api/replays/searchprivate`
- `POST https://play.pokemonshowdown.com/api/logout`

順帶量到：**沒有 sid 時兩個 host 都回同一句 `Access denied`**，所以 `play.` 也認得這個
action，兩者並非只有一邊實作。挑 `replay.` 是因為它是實際答出清單的那一個。

### 2. `assertion` 的內容是一句錯誤訊息，而且不重要

回的是 `";;This server is requesting an invalid login key…"`。這不是登入失敗 ——
`actionsuccess` 仍是 `true`，`curuser.loggedin` 也是 `true`，sid 照發、照用。assertion
是給 sim server（WebSocket）用的，要先有 challstr 才換得到有效的值，而我們沒有也不需要
（設計文件 §3.2：OAuth/assertion 換不到 `searchprivate` 要的東西）。

**對 #178：不要驗 `assertion`。** 判斷登入成功要看 `actionsuccess` 與拿不拿得到 sid，
把 assertion 當成功條件會讓整條路在正常情況下失敗。

### 3. cookie 的 `Max-Age` 是 363 天，不是設計文件說的 14 天

設計文件 §2.2.4 依 `SID_DURATION = 2 * 7 * 24 * 60 * 60` 寫「session 效期 14 天」。
實際發出來的是 `Max-Age=31363200`，**約 363 天**。

兩者不必然矛盾：`Max-Age` 是**瀏覽器留著 cookie 多久**，`SID_DURATION` 是**伺服器認不認
那個 session**，後者才是真正的效期，而要量它得等 14 天，這次沒量。但設計文件「效期 14 天」
那句話的依據只有原始碼，而**唯一量得到的數字比它大一個數量級**，所以它現在是一條有疑問
的推論，不是事實。

**對我們的影響：零。** D2 已經決定不存 sid，這條 route 用完就 `logout`（結果表第 6 項實測有效），
session 活多久不影響任何決定。記在這裡是因為 AGENTS.md 要求與推論不符的量測要回報而不是
默默改掉；真要用到 sid 效期的那天（例如重新考慮 D2），得先實測。

### 附帶：logout 之後的 sid cookie

logout 回 `sid=; Max-Age=0`（刪除），而**之後每個被拒絕的請求都回
`sid=,,<hash>; Max-Age=0`** —— name 與 sessionId 都空，只剩一段 hash，且立刻過期。
是 PS 在清 cookie，不是新 session。無須處理。

## 對 #178 的結論

1. **可以做。** 整條往返在伺服器端成立，#178 不再被擋。
2. **host**：login 與 logout 在 `play.`，`searchprivate` 在 `replay.`（上節第 1 點）。
3. **`Set-Cookie` 的 sid 一定要 `decodeURIComponent` 才能當 `body.sid`**（結果表第 2 項）。
4. **每個回應都要先切掉前導 `]`**，login、searchprivate、logout 都是（結果表第 4 項）。
5. **`]{"actionerror":…}` 是 200。** 只看 HTTP 狀態碼會把「密碼錯誤」與「拒絕存取」
   當成成功，型別守衛必須看本體（腳本裡是 `listingsOf`）。
6. **不要驗 `assertion`**（上節第 2 點），它正常情況下就是一句錯誤訊息。看
   `actionsuccess` 與有沒有 sid。
7. **logout 真的關得掉**（結果表第 6 項），設計文件 §5.1「用完把門帶上」不是一句願望。
8. **換 IP 不影響**（結果表第 7 項），所以 Worker 的出口 IP 與使用者的不同沒有關係。
9. **列的形狀就是 `ReplayListing`**：`uploadtime`、`id`、`format`（顯示名，不是
   format id）、`players`、`rating`、`private: 1`、`password`。沒有 `views`，也沒有
   `formatid` —— 與 `search.json` 一致，所以 `shared/api/showdown.ts` 不必加型別。

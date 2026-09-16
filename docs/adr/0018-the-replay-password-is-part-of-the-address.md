# ADR-0018：replay 密碼是位址的一部分，所以存得下來

- 狀態：Accepted
- 日期：2026-09-16
- 相關：#197；推翻 `shared/utils/replayLink.ts` 原本的立場與
  [私人 replay 同步設計](../specs/2026-09-11-private-replay-sync-design.md) §1「不改動
  ingest 管線」的一句話；CONTEXT.md「公開 replay / 私人 replay」

## 脈絡

私人 replay 的位址是 `<id>-<password>pw`（CONTEXT.md）。抽屜右上角那個連往 Showdown
的連結拼的是 `<origin>/<replay_id>`，對私人場次而言那是一個**格式完全正確的 404**。

`replayLink.ts` 的註解把這寫成一個刻意的取捨：

> a link out of this app is for a battle the reader already has, and putting the
> password of a private replay into a shareable page would hand it out with it.

這段話把「replay 的密碼」當成憑證在保護。它與設計文件 §5「不儲存任何 Showdown 憑證」
讀起來像同一條原則，**但兩者講的不是同一個東西**：

- **Showdown 帳號密碼**與登入後的 sid —— 那是身分。拿到它可以冒充使用者、看他所有的
  對戰、改他的名字。設計文件 §5 的五層防護講的是這個，一個字都不必改。
- **replay 密碼** —— 那是位址裡的一段隨機字串，一個 capability URL。它能做的事只有
  一件：打開那一場 replay。它打不開第二場、換不到 session、也回推不出帳號。

而且那段註解裡的「shareable page」在這個 app 裡不存在：抽屜是登入後、RLS 之後、
只讀得到自己那列的畫面（`battles` 的 policy 是 `user_id = auth.uid()`，站內沒有任何
跨使用者看得到別人 battles 的表面）。它不是一個可以貼給別人的網址。

實際被「保護」掉的，只有使用者自己回去看自己那場對戰的能力。

## 決定

**replay 的密碼視為位址的一部分，跟著那一列存進 `battles`。**

### 一、兩個欄位，不是一個可空的密碼

```sql
replay_private  boolean not null   -- 沒有 default，理由同 bring_complete
replay_password text               -- 公開場次為 null
```

Showdown 的 `private` 有 0/1/2/3 四個值，其中 **2 是「私人但沒有密碼」**——那種 replay
不存在任何打得開它的位址。只用一個可空的密碼欄位，「公開」與「打不開」會壓成同一格。

命名沿用 `replay_id` 的前綴：這三欄講的都是 replay 這個外部物件本身，不是 game 的
內容。

### 二、映射只有一份

密碼與 private 不是從 log 解析出來的，所以不經過 `ParsedBattle`。它們由
`battle-row` 的 `replayAccessOf()` 從 replay JSON 推出，`battleRowOf` 與
`unparsedRowOf` 都收第三個參數 `ReplayAccess`（必填，不給預設值——預設「公開」正是
這張票在修的那個 bug）。貼連結與私人同步兩條路都經過 `useIngest.importReplay`，
`scripts/reparse.ts` 走同一支函式，所以三個入口不可能給出不同答案（同 ADR-0012 的
理由）。

### 三、匯入把用到的密碼寫進存下來的 JSON

`replayAccessOf(record, fetchedWith)` 以**實際發出請求時用的那個密碼**優先。理由是
它一定是對的：Showdown 只在 `<id>-<password>pw.json` 這個位址上供應私人 replay，
密碼不對就是 404，所以 record 拿得回來就代表那個密碼可用。

至於 replay JSON 自己的 `password` 欄位：**沒有量過**。量到的只有搜尋列——
`search.json` 的每一列（fixture 裡是 `"password": null`）與 spike 實測的
`searchprivate`（[spike 筆記](../specs/2026-09-11-private-replay-sync-spike.md)
第 9 點：`private: 1`、`password`）。單一 replay 的 JSON 帶不帶它，這裡是假設而非
事實。

因此匯入時把密碼一併寫進存進 Storage 的那個 JSON 物件。這不是裝飾：`reparse` 手上
**只有**那個物件，若 Showdown 的單場 JSON 其實不帶 `password`，一次重跑解析就會把
全部私人場次的密碼清成 null，而症狀是連結靜默變回 404。Storage 存的本來就是整包
replay JSON 而不只是 log（為了 format id 與 upload time），這一步是同一件事再多一欄。

### 四、密碼只出現在那一個 `href` 上

`replayUrl(ref)` 是唯一的用處，`DrawerHeader.vue` 是唯一的呼叫端，`rel` 維持
`noopener noreferrer`。沒有複製鈕、沒有分享、沒有匯出讀這一欄，`RECORD_COLUMNS`
以外的任何欄位清單也都沒有它。

## 後果

- **資料庫裡多了一段秘密。** 界線守在 RLS 上，跟 `details`、跟 raw log 的 Storage
  路徑是同一道門。如果哪天站內長出任何跨使用者看得到別人 battles 的表面（公開牌組
  頁、分享連結、管理者檢視），**`replay_password` 必須先被排除在那條讀取路徑之外**，
  這是本決定唯一的前提。
- `replay_private` 目前沒有任何 UI 讀它，跟 `regulation` 一樣是刻意先存著的欄位。
  它存在的理由在票裡：抽屜連 「這場是私人的」都不知道，所以連誠實標示都做不到。要做
  那件事的人不必先補一次資料。
- `battleRowOf` / `unparsedRowOf` 的簽章多一個必填參數。舊呼叫端會編譯失敗而不是
  靜默寫進 `false` —— 這是選的，不是順便的。
- 設計文件 §1「`useIngest`、`battle-row`、`scripts/reparse.ts` 一行不動」自此不成立。
  那句話是那張票的範圍聲明而不是架構原則，§5 那五層一層都沒動。

## 為什麼不要再把它拔掉

因為它看起來會非常像一個資安疏失：一個叫 `password` 的欄位，明文存在資料庫裡。

下一個讀到的人請先分清楚兩件事：**這不是 Showdown 帳號的密碼**。它是一段只能打開
那一場 replay 的位址後綴，而那場 replay 本來就是使用者自己的。拔掉它不會讓任何帳號
變安全，只會讓使用者再也點不進自己的私人場次——而且是靜默的，連結照樣長得很正常，
只是 Showdown 回 404。

要動的話，先回答：使用者要怎麼回到那場對戰？

## 替代方案

- **不存密碼，私人場次不顯示連結。** 誠實，也還是修不好問題——使用者要的就是回到那場
  對戰。而且「不顯示」需要知道這場是私人的，那還是得存 `replay_private`：已經在存
  「這場是私人的」了，少存的只有讓連結能用的那一段。
- **只存密碼、不存 `replay_private`。** 少一欄，但把 Showdown 的 `private: 2`
  （私人、無密碼）壓成「公開」。那種場次連結一樣是 404，而系統會以為它是公開的。
- **存密碼的雜湊。** 對這種資料沒有意義：雜湊過的 capability URL 打不開任何東西，而
  能打開它的原文正是我們需要的那個值。
- **只把密碼留在記憶體，匯入後即棄（現況）。** 這就是這張票要修的 bug。`ReplayRef`
  的 password 在 `fetchReplay` 拼完請求後就隨函式消失，之後任何一個讀者都無法重建
  那個位址——包括使用者本人。

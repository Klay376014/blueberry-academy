# CONTEXT

這個檔案定義 blueberry-academy 的領域詞彙。這個領域的詞有很多陷阱 ——
「一場對戰」在 Bo3 底下是有歧義的，「隊伍」有兩層意義，「同一支隊伍」的定義取決於賽制。
任何人（或 agent）在寫程式碼、命名變數、討論需求前，先讀這裡。

## 對戰的層級

**Game（對局）**
一個 Showdown replay 對應一個 game。這是系統中最小、也是唯一有完整資料的單位。
`battles` 表一列 = 一個 game。程式碼中一律用 `battle` 指涉這個層級。

**Series（系列賽）**
Bo3 賽制下的 2–3 個 game 構成一個 series。Showdown 把每個 game 各自存成獨立 replay，
log 尾端的 `|uhtml|bestof|` 行帶著母對戰 id 與下一場的連結。`battles.series_id` 存這個 id。

系統**永遠以 game 為單位儲存**。series 層級的勝負可以從同一 `series_id` 的 games 推導，
反之不行。統計層預設按 game 計算，並提供「依 series 聚合」的切換。

> 說「一場」時務必指明是 game 還是 series。程式碼中不要出現裸的 `match` 或 `game` 命名。

## 隊伍的兩層

**Team（登錄隊伍）**
Team Preview 階段揭露的 6 隻，來自 log 的 `|poke|` 行。

**Bring（選出）**
VGC 每場實際帶上場的 4 隻。`|teamsize|p1|4` 告訴你**選了幾隻**，但 log 只記錄
**哪幾隻真的現身過** —— 兩者不一定相等。

> 對手認輸或速決的場次，你的第 4 隻可能從未出場。實測一場 4 回合認輸的對戰，
> `|teamsize|p2|4` 但只有 3 隻現身。**這是常態而非例外，認輸在天梯上不罕見。**

因此 bring 有兩個欄位：`bring_signature` 存實際現身的集合（長度可能 < teamsize），
`bring_complete` 標記它是否等於 teamsize。統計層預設只採 `bring_complete = true`
的分組，避免同一組選出在短局被算成另一個分組。

VGC 玩家最在意的往往是 bring 而非 team —— 同一支隊對上不同對手會選出不同的 4 隻，
選出的好壞直接決定勝負。因此兩者都是一級公民，各有自己的簽章欄位。

**Signature（簽章）**
隊伍的識別鍵。由 base species 的 `toID()` 排序後以 `|` 串接而成。

- `team_signature` — 登錄 6 隻
- `bring_signature` — 實際選出 4 隻

計算簽章時必須把 Mega 型態還原成 base species（見下方「Base species」）。

## 隊伍的同一性

**同一支隊 = 相同的 `format_id` + 相同的 `team_signature`。**

兩個刻意的決定：

1. **道具/招式配置不列入識別。** 天梯 replay 拿不到配置（只有開放隊表的賽事 Bo3 才有
   `|showteam|`）。把配置納入識別鍵會導致絕大多數場次無法分組。
2. **Bo1 與 Bo3 是不同的隊。** `gen9championsvgc2026regmb` 與
   `gen9championsvgc2026regmbbo3` 是兩個 `format_id`，在分析上被視為完全不同的項目
   —— 天梯 Bo1 與賽事 Bo3 的對戰生態、選出策略、心理層面都不同，混在一起算平均沒有意義。

**Regulation（規則世代）**
從 `format_id` 去掉 `bo2`/`bo3` 後綴派生而來，例如
`gen9championsvgc2026regmbbo3` → `gen9championsvgc2026regmb`。

`regulation` **不參與隊伍識別**，目前 UI 也不使用它。它只是一個 generated column，
保留「未來想跨 Bo1/Bo3 看同一套隊」的可能性，避免屆時要回填全部資料。

## 身分

**Showdown username / userid**
Showdown 的顯示名稱可含大小寫與符號；`userid` 是它的正規化形式（小寫、移除非英數字元）。
系統中**所有身分比對一律走 `toID()` 正規化**，`NotLittleStar` 與 `notlittlestar` 是同一個人。

**Alias（別名）**
一個使用者帳號可綁定多個 Showdown 名稱（`profiles.showdown_usernames`），全部視為同一個
「我」。涵蓋改名、小號、不同賽制用不同帳號的情況。

> Showdown 沒有 OAuth，`pokemonshowdown.com/users/<id>.json` 也沒有可放驗證碼的欄位，
> 因此**系統無法驗證 Showdown 帳號的擁有權**。綁定是純粹的信任模式，UI 必須誠實標示。
> 這在安全上可接受：所有相關 replay 本來就是 Showdown 上公開可查的資料。

**Spectated（旁觀場次）**
匯入的 replay 中，兩位玩家都不在使用者的別名清單裡。這種場次 `my_side` 為 `null`、
`result` 為 `null`，**不計入任何個人統計**。

## 解析

**Raw log**
Showdown replay 的原始內容，來自 `<replay-id>.json` 的 `log` 欄位。原封不動 gzip 後存進
Supabase Storage。它是**唯一的真實來源**，解析結果一律視為可重建的衍生資料。

**ParsedBattle**
解析器的輸出，視角中立（同時描述 p1 與 p2，不知道誰是「我」）。
「我是哪一邊」是在寫入 DB 時才解析的。

**Base species**
還原掉型態變化後的物種。`detailschange` 會把 `Floette-Eternal` 變成 `Floette-Mega`；
若不還原，同一隻寶可夢會在簽章中被算成兩隻。太晶化不改變 species，但 Mega、
Primal、型態切換都會。

**Parser version**
`battles.parser_version` 記錄該列是由哪一版解析器產生。解析器改版後，用
`scripts/reparse.ts` 讀 Storage 的 raw log 重建全部衍生資料，不需要再打 Showdown。

## 統計

**Wilson score 下界**
隊伍排名的排序鍵。純勝率會讓「3 戰 3 勝」永遠霸榜；Wilson 下界會把它自然排到
「20 戰 14 勝」後面。所有分組統計一律標示樣本數，不隱藏低樣本分組。

**滑動視窗勝率**
勝率走向圖的縱軸，預設視窗 20 場。橫軸用日曆日期而非場次序號 —— 日期能反映
「休息兩個月後手感變差」這種真實訊號。

**Rating 斷線**
Bo3 賽事場次沒有 rating（`null`）。rating 曲線遇到 null **直接斷線，不內插** ——
內插等於捏造不存在的數據，斷點反而讓使用者正確理解「這段時間沒打天梯」。

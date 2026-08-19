# ADR-0008：對戰限定型態用產生出來的對照表，不用字尾規則

- 狀態：Accepted
- 日期：2026-08-20
- 相關：#5、#22

## 脈絡

簽章是以 base species 組成的，所以場上的型態變化必須先還原，否則同一隻寶可夢會被算成
兩隻。#5 的 acceptance criteria 只點名 Mega 與 Primal，用字尾規則就能做完：

```ts
toID(species.replace(/-(?:Mega(?:-[XY])?|Primal)$/, ''))
```

實作時去查了 Showdown 自己的資料（`@pkmn/dex@0.10.11`，`species.battleOnly`），發現這條
規則的涵蓋率與正確性都不夠：

```
$ node -e "const {Dex}=require('@pkmn/dex'); ..."
battleOnly species: 128
字尾規則涵蓋: 96 of 126（有編號者）
```

漏掉的 30 個裡有 `Palafin-Hero`、`Terapagos-Terastal`、`Ogerpon-*-Tera`、
`Zacian-Crowned`、`Zamazenta-Crowned`、`Aegislash-Blade`、`Darmanitan-Zen` —— 好幾個是
現世代 VGC 主流，不是理論風險。

更關鍵的是**有三個型態的 base species 不是「名稱去掉字尾」**：

```
Floette-Mega        -> Floette-Eternal   （不是 Floette）
Greninja-Ash        -> Greninja-Bond     （不是 Greninja）
Mimikyu-Busted-Totem -> Mimikyu-Totem    （不是 Mimikyu）
```

`Floette-Mega` 直接命中本專案的格式：`gen9championsvgc2026regmb` 的實測 replay 裡就有
`|detailschange|p1a: Floette|Floette-Mega`。字尾規則會產出 `floette` —— 一隻對方從未
登錄的寶可夢，和真正在場的 `floetteeternal` 並列在簽章裡。

還有三個型態的來源**不唯一**：

```
Zygarde-Complete -> ["Zygarde", "Zygarde-10%"]
Zygarde-Mega     -> ["Zygarde", "Zygarde-10%"]
Necrozma-Ultra   -> ["Necrozma-Dawn-Wings", "Necrozma-Dusk-Mane"]
```

沒有任何字串規則能決定 `Zygarde-Complete` 該還原成哪一個。

## 決定

**`src/battle-only-formes.ts` 由 `scripts/generate-battle-only-formes.mjs` 從
`@pkmn/dex` 產生並進版控**，`pnpm gen:battle-only-formes` 重跑。表的值是**清單**，
`baseSpeciesId(species, registered)` 用該方 `|poke|` 登錄的隊伍解析多重來源，取不到時
退回清單第一項。

`@pkmn/dex` 是 **devDependency，且只有產生器 import 它**。package 出貨的是產生出來的
表，不是 dex 本身，`dependencies` 維持為空（`test/package.test.ts` 守住）。

字尾規則**保留為 fallback**：表是產生出來的，永遠落後 Showdown 一個版本，而表裡 96/126
是 Mega，新增的 Mega 用字尾接住是對的。

## 後果

產出檔 128 筆、4858 bytes，key 排序後每行一筆，diff 可讀。

三條不變式用測試守住（`test/battle-only-formes.test.ts`）：

```
$ pnpm --filter replay-parser exec vitest run test/battle-only-formes.test.ts
Tests  3 passed (3)
```

1. dex 裡每個 `battleOnly` 型態都在表裡 —— 這是**唯一**會在有人升級 `@pkmn/dex` 卻忘記
   重跑產生器時出聲的東西。實測把 `palafinhero` 那行刪掉後：
   `AssertionError: expected [ 'Palafin-Hero' ] to deeply equal []`
2. 表裡每個來源都是存在的 species，且自己不是 `battleOnly`（不會鏈式還原）
3. 對 dex 裡**所有**可登錄 species，`baseSpeciesId` 是恆等函式 —— 還原邏輯不會誤傷
   登錄型態，`Ninetales-Alola` 包含在內

`baseSpeciesId` 因此多了一個選擇性參數。`|poke|` 收集隊伍時不傳（那時還沒有隊伍可比
對），場上現身時傳該方的 `team` —— `|poke|` 一定在任何 `|switch|` 之前，所以比對時隊伍
已經齊全。

## 為什麼不改回字尾規則

看到一個 128 筆的產生檔，很容易想「其中 96 筆都是 `-Mega`，一條 regex 就夠了」。那條
regex 會讓 `Floette-Mega` 變成 `floette`、`Greninja-Ash` 變成 `greninja`、
`Zygarde-Complete` 原封不動，而且無聲無息 —— 錯的簽章不會拋錯，只會讓隊伍分組默默地
散掉，而這正是整個專案的核心資料。上面那三段輸出就是不能只用字尾的證據。

## 替代方案

- **手寫 30 筆補齊** —— 免掉 devDependency 與產生器，但多重來源要自己裁決，且每次
  Showdown 加新型態就靜靜地錯一筆，沒有任何東西會提醒
- **`@pkmn/dex` 當 runtime dependency，直接查** —— 永遠最新，但違反本 package 零 runtime
  依賴這條（見 `packages/replay-parser/README.md`），並把一個數 MB 的資料集拖進 SPA
  bundle
- **只做 #5 點名的 Mega + Primal，其餘留給後續票** —— 這是原本的計畫。放棄的理由是
  `Floette-Mega` 已經在本專案的格式裡發生，留著就是留一個已知會算錯的簽章

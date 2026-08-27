# ADR-0005：shadcn-vue 不裝 `shadcn-nuxt` 模組，元件保留 `Ui` 前綴

- 狀態：Accepted
- 日期：2026-08-19
- 相關：#3、#16、#17

## 脈絡

shadcn-vue 的 CLI 與 `shadcn-nuxt` 模組**不是二選一**。CLI 是把元件原始碼複製進 repo
的工具；模組只做一件事 —— 改自動匯入的命名前綴。不裝模組，CLI 產生的元件照樣能用。

#3 的 spike 實測對照（建 `app/components/ui/button/Button.vue` + `index.ts`）：

| 設定                            | 自動匯入的元件名 |
| ------------------------------- | ---------------- |
| 不裝模組                        | `UiButton`       |
| 模組 + `prefix: 'Ui'`（預設值） | `UiButton`       |
| 模組 + `prefix: ''`             | `Button`         |

模組配預設 prefix 是純虧：結果與不裝完全相同，卻多一個依賴。唯一有差異的組合是
`prefix: ''`。

## 決定

不安裝 `shadcn-nuxt`。元件放在 `app/shared/components/ui/<name>/`（#61 之前是
`app/components/ui/<name>/`），靠 Nuxt 的 path-prefix 自動匯入取得 `Ui` 前綴。

## 後果

`Ui` 前綴讓「借來的設計系統元件」與「自有領域元件」在 template 裡一眼可分。#16、#17
會產生大量後者（`TeamRow`、`BringBreakdown`、`WinrateChart`），而 `Button` / `Card` /
`Table` 這類通用名若佔用全域自動匯入命名空間，日後自己要寫 `Card` 會撞名。

代價：從 shadcn-vue 官方文件複製範例時，`<Button>` 要手動改成 `<UiButton>`。

**`nuxt.config.ts` 裡那條 `extensions: ['vue']` 是這個決定的必要配套，不能拿掉。**
#61 之後 `components` 是一個陣列、每個 feature 與 `shared/` 各一條，掛著它的那條是
`{ path: '~/shared/components', extensions: ['vue'] }` —— 決定本身沒變，只是換了路徑。

shadcn 在每個元件目錄放一支 `index.ts` barrel（匯出 `buttonVariants` 與 cva 型別）。
Nuxt 預設連 `.ts` 一起掃描成元件，於是 `index.ts` 與 `Button.vue` 都宣告自己叫
`UiButton`：

```
[NUXT_B3011] Two component files resolving to the same name `UiButton`:
 - apps/web/app/shared/components/ui/button/index.ts
 - apps/web/app/shared/components/ui/button/Button.vue
╰▶ fix: Rename one of the files or adjust the `components.dirs` prefix settings
```

限制掃描為 `.vue` 後警告消失，`index.ts` 仍可正常被 `Button.vue` 以 `from '.'` 匯入。

## CLI 的實際行為（2026-08-19 實跑，先前未驗證過）

`pnpm dlx shadcn-vue@2.8.2` 在 Nuxt 4 + Vite+ 下可用，但有三個要知道的點：

1. **`init` 要求 CSS 入口檔先存在。** 在建立 `app/assets/tailwind.css` 之前執行，
   preflight 認得 Nuxt 4 與 Tailwind v4 卻仍中止：
   `No Tailwind CSS configuration found at apps/web. ... Install Tailwind CSS then try again.`
2. **CLI 內部呼叫 `corepack pnpm add` 安裝依賴，繞過 PATH。** corepack 自己的 pnpm
   版本若不等於 `devEngines.packageManager`（本專案 11.22.0），這一步失敗，而
   **CLI 會在寫出元件檔之前整個中止**。修法是 `corepack install -g pnpm@11.22.0`。
3. **`-y` 不是全自動。** 元件庫（Reka UI）與字型仍會互動詢問；字型可用 `--font` 跳過，
   元件庫只能餵 stdin。

`init` 若在第 2 點中止，`app/shared/lib/utils.ts`（元件 import 的 `cn` helper）不會被
建出來，需手動補。

CLI 產出的檔案用雙引號，與本專案 formatter 不符 —— **每次 `shadcn-vue add` 後要跑
`vp check --fix`**。

## 替代方案

- **裝模組並設 `prefix: ''`** —— 唯一有實質差異的組合。可行且不難改（`nuxt.config`
  加模組設定），代價是全專案 template 的元件名要一起改，且失去上述命名區分
- **不用 CLI，手抄官方元件原始碼** —— CLI 已實測可用，且它會處理 registry 版本與
  依賴，手抄沒有好處

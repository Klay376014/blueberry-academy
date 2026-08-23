# ADR-0010：圖表用 `@unovis/vue`，且必須自己處理「資料變了但不重畫」

- 狀態：Accepted
- 日期：2026-08-23
- 相關：#16

## 脈絡

#16 的勝率走向需要兩張共用日曆橫軸的折線圖，其中 rating 曲線**遇缺值要斷線、不內插**
（設計文件 §7、決策 Q21）。專案在此之前沒有任何圖表相依。

兩條路：手寫 inline SVG，或引入函式庫。選了後者，因為刻度、時間軸與尺度計算自己寫
是一整批會長期維護的程式碼，而斷線這個唯一的硬需求函式庫本來就支援。

在 unovis 與 vue-chrts 之間選 unovis：vue-chrts 本身就建在 unovis 上，而我們需要的是
底層控制（兩張圖共用 `xDomain`、其中一張把 y 軸釘在 0–100%），包裝層反而擋路。
shadcn-vue 的圖表元件（ADR-0005 的 CLI）同樣建在 unovis 上，將來要換過去不必換底層。

## 決定

用 `@unovis/vue` + `@unovis/ts`，直接使用 `VisXYContainer` / `VisLine` / `VisAxis`，
包成自有的 `StatsTrendChart`。

## 後果

**1. 缺值一定要寫成 `undefined`，不能是 `null`。**

unovis 文件（unovis.dev/docs/xy-charts/Line，"Dealing with missing data"）寫明：預設遇
缺值斷線，但缺值指的是 `undefined` / `NaN`；**`null` 會被當成 0 畫出來**。Bo3 場次沒有
rating，寫成 `null` 的話曲線會俯衝到 0 —— 一個從未發生的讀數。`ratingSeries()` 因此
明確回傳 `number | undefined`，並有測試盯著。

**2. 只有資料變、設定沒變時，unovis 不會重畫。實測於 1.6.7。**

`@unovis/vue@1.6.7` 的 `containers/xy-container/index.js` 把新資料往下傳時帶著
`preventRender`：

```js
h(t, () => {
  n.value ? n.value.setData(t.value, !0) : p()
})
```

而 `XYContainer.setData(data, preventRender)` 在 `preventRender` 為真時直接跳過
`render()`。重畫只發生在 watchEffect 因為**設定**變動而重跑的時候。

實測（Chrome，`pnpm dev`）：切換滑動視窗 10 / 20 / 50，標題文字換了，`path` 的 `d`
一個字元都沒動。`StatsTrendChart` 因此用一個遞增的 `revision` 當 `:key`，資料換了就整個
重掛容器。

**這一段不要拿掉。** jsdom 底下兩種寫法都會重畫，所以刪掉它測試照樣全綠 —— 這個 bug
只有在真的瀏覽器裡看得到。升級 unovis 時可以再驗一次上游修了沒有，驗的方法是**在
Chrome 裡切視窗看曲線有沒有變**，不是跑測試。

**3. jsdom 缺兩樣東西，`apps/web/test/setup.ts` 補上。**

`SVGElement.prototype.getBBox`（unovis 量文字來排刻度）與 `ResizeObserver`。後者沒有的話
unovis 退回 `@juggle/resize-observer`，它的 `disconnect()` 會在每次 unmount 拋錯，讓
掛過圖表的測試整批失敗。補上之後圖表在 jsdom 裡真的會畫出 `path`，所以「rating 曲線
斷線」是對著實際畫出來的路徑斷言的，不是對著 stub。

**4. 體積：dashboard 那個 chunk 202 KB（gzip 64 KB）。**

`pnpm build` 後量測，是獨立 chunk，不進首屏共用包。`@unovis/ts` 會帶進 `maplibre-gl`
（它的地圖元件用的），但沒有被打包進去 —— build 產物裡 grep 不到。它的 build script 在
`pnpm-workspace.yaml` 的 `allowBuilds` 標為 `false`。

## 替代方案

- **手寫 inline SVG** —— 沒有相依、完全可控，代價是刻度、時間尺度與 y 軸格式化都要自己
  寫並自己維護。斷線本身很簡單（`.defined()`），但整張圖不只有斷線
- **chart.js** —— canvas 而非 SVG，`spanGaps: false` 也能斷線，但主題色要從 oklch token
  取值後手動餵進去，且 canvas 上的文字對輔助技術不可見
- **vue-chrts** —— 就是 unovis 的包裝層，包住的正好是我們需要伸手進去的部分

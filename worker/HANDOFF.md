# 雲端 OCR 部署 — Handoff（回台灣再續）

> 2026-06-03 暫停於此。app 端全做完、已 live；只差「買 Claude credits + 部署一個 Worker」就能用「拍照自動填」。
> 要 Claude 接手：說「**繼續部署 receipt-ocr worker**」。

---

## 一句話現況
**做好了 95%。** app 端拍照辨識按鈕 + Worker code + 配置全部完成並 push。卡在最後一哩：Anthropic 買 credits 的付款頁。

## 現在就能用的（不受影響）
🔗 https://zonal0223tw-max.github.io/receipt-log/
拍照、手填、Live Text 貼上、列表 / 總計、寄回報、報修 —— 全部正常。
只有「✨ 雲端辨識」按了會提示去設定（因為 Worker 還沒部署）。**沒部署完全不影響記單據。**

## 卡在哪 + 怎麼解（重要）
在 platform.claude.com 買 US$20 credits 時，`Total due` 一直顯示 `$--`（算不出稅）→ Buy 鈕灰。
**解法：付款頁的「Business tax ID / Taiwanese VAT」那欄要清空。**
個人購買不要填統編 —— 一填，Stripe 會跑公司稅務驗證、稅就卡在 `$--`。清空 → Total 跳 `USD 20.00` → 填卡 → Buy。
（次要：地址「區」欄要填「三重區」不是「new taipei」，但清 VAT 欄最可能直接解。）

---

## 回來照這 4 步（約 15 分鐘）

### ① 買 credits（你自己做，碰錢的我不碰）
- platform.claude.com/settings/billing → **Buy credits** → US$20
- **Business tax ID 欄留空** → Total 跳 $20 → 填卡 → Buy
- 成功後左下角餘額從 `USD 0.00` 變 `USD 20.00`

### ② 拿金鑰（你自己做）
- Console 左邊 **API keys → Create Key** → 複製 `sk-ant-api03-...`（先別貼給任何人）

### ③ 部署 Worker（叫 Claude 接手）
配置與 code 都在 `receipt-log/worker/`：
- `receipt-ocr.js` — 薄殼 Worker（鎖 origin + CORS → AI Gateway → Claude vision）
- `wrangler.toml` — 已填好 ALLOWED_ORIGIN + default gateway URL
- `README.md` — dashboard 部署步驟（備用）

**兩條路（建議走 wrangler，避開 dashboard 卡頓 + 網頁編輯器貼 code 的坑）：**
```bash
cd ~/Desktop/generative-lab/receipt-log/worker
npx wrangler login          # 瀏覽器點 Allow（一次性）
npx wrangler deploy         # 部署 → 拿到 https://receipt-ocr.<子域>.workers.dev
npx wrangler secret put ANTHROPIC_API_KEY   # 你貼 ② 的 sk-ant-... key（key 只進這裡）
```
部署完用 README.md 裡的 curl 測一下通不通。

### ④ 接回 app（你自己做）
- app 右上 **⋯ → ☁️ 雲端辨識設定** → 貼上 ③ 的 Worker 網址 → 儲存
- 拍張單據 → **✨ 雲端辨識** → 金額/店家/日期自動填

---

## 關鍵資訊速查（給接手的 Claude）
- **決策已定**：加值版（走 AI Gateway）、用 **default gateway**（首次請求自動建，不必手動建 named gateway）、model 預設 `claude-haiku-4-5`（便宜，不準切 `claude-sonnet-4-6`）。
- Cloudflare 已登入 `zonal0223tw@gmail.com`，account id `71b77f3e3eb21f24fb737759e5646c3d`。
- default gateway anthropic endpoint（已寫進 wrangler.toml `GATEWAY_URL`）：
  `https://gateway.ai.cloudflare.com/v1/71b77f3e3eb21f24fb737759e5646c3d/default/anthropic`
- `ALLOWED_ORIGIN` = `https://zonal0223tw-max.github.io`
- **Worker 真呼叫沒驗過**（沒帳號/key）—— 部署後用 README 的 curl 或真機試第一張。
- app 端 `cloudFill`（依 fid 填欄位、money 清數字）headless 已驗通過。

## 教訓（這次踩的）
- Cloudflare / platform.claude.com 透過 Claude-in-Chrome 自動化分頁載入**非常卡**（背景分頁被瀏覽器 throttle，要手動點分頁到前景才載得動）。→ 付款自己在正常瀏覽器做；Worker 部署走 wrangler，不要用 dashboard 網頁編輯器貼 code（Monaco 自動縮排會搞亂）。
- 台灣個人買 Anthropic credits：**Business tax ID 留空**，否則 Total 卡 `$--`。

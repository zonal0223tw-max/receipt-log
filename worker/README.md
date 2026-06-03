# 雲端辨識 Worker 部署（單據記錄器）

把單據照片送給 Claude vision、依你當下的欄位回填。**key 全程只在 Cloudflare，不進前端、不進這個 repo。** 純瀏覽器操作，不用裝 wrangler。

架構：`iPhone 拍照 → 這個 Worker(鎖 origin + CORS) → Cloudflare AI Gateway(BYOK + 限流/觀測) → Claude vision → 結構化 JSON → 回填`

---

## 快速部署（~10 分鐘，全在 dashboard）

### 1. 註冊 Cloudflare（免費）
[dash.cloudflare.com](https://dash.cloudflare.com) 註冊／登入。

### 2. 建 AI Gateway（拿觀測 + 限流）
左側 **AI → AI Gateway → Create Gateway**，命名 `receipt-ocr` → Create。
建好點進去 → 找 **API / Endpoint**，複製它給 **Anthropic** 的 base URL，長這樣：
```
https://gateway.ai.cloudflare.com/v1/<account_id>/receipt-ocr/anthropic
```
> 之後每次辨識的用量／成本都會出現在這個 Gateway 的 dashboard。

### 3. 建 Worker，貼 code
左側 **Workers & Pages → Create → Worker**，命名 `receipt-ocr` → Deploy（先部署空殼）。
點 **Edit code**，把本目錄 [`receipt-ocr.js`](./receipt-ocr.js) 全文貼上 → **Deploy**。

### 4. 設三個變數（Worker → Settings → Variables and Secrets）
| 名稱 | 值 | 型別 |
|---|---|---|
| `ALLOWED_ORIGIN` | `https://zonal0223tw-max.github.io` | Text |
| `GATEWAY_URL` | 步驟 2 複製的 Anthropic endpoint | Text |
| `ANTHROPIC_API_KEY` | 你的 Claude key `sk-ant-...` | **Secret / Encrypt** ← 一定要選加密 |

存檔 → **Deploy**。

### 5. 拿 Worker 網址
Worker 頁面上的 `https://receipt-ocr.<你的子域>.workers.dev`。

### 6. 填進 app
receipt-log → 右上 **⋯ → ☁️ 雲端辨識設定** → 貼上 Worker 網址 → 模型先選 **Haiku** → 儲存。

完成。拍單據 → 按 **✨ 雲端辨識 → 自動填欄位**。

---

## 測試 Worker（部署完先用這個確認通）
```bash
curl -X POST https://receipt-ocr.<你的子域>.workers.dev \
  -H 'content-type: application/json' \
  -H 'origin: https://zonal0223tw-max.github.io' \
  -d '{"image":"<base64>","media_type":"image/jpeg","model":"haiku",
       "schema":[{"fid":"amount","label":"金額","type":"money"},{"fid":"vendor","label":"店家","type":"text"}]}'
```
回 `{"values":{...},"rawText":"..."}` 就是通了。`<base64>` 隨便塞張小圖的 base64 測流程（內容不準沒關係，看有沒有正常回 JSON）。

---

## 安全與成本
- **key 不進前端**：`ANTHROPIC_API_KEY` 是 Cloudflare 加密 secret，瀏覽器拿不到。
- **origin 鎖死**：非你的 github.io 來的請求回 403（擋一般瀏覽器濫用）。
- **AI Gateway 兜底**：可在 Gateway 設 rate-limit，萬一 Worker 網址外洩也有上限；用量/成本一目了然。
- **成本**：Haiku 一張單據約 NT$0.1 上下；不夠準在 app 設定切 Sonnet（更準、約 3 倍）。
- 想再保險：到 [Anthropic console](https://console.anthropic.com) 設每月 spend 上限。

## 進階（可選，先不用做）
目前是 **Worker 持 key（secret）+ 走 AI Gateway URL**，個人用足夠。若要 key 更集中，可改用 AI Gateway 的 **BYOK / Store Keys**（key 存 Gateway Secrets Store，Worker 連 key 都不持有）—— 設定多幾步，需要時再說。

---

## 誠實標註
- Worker 的 **JS 邏輯 / syntax 驗過**，但「真的呼叫 Claude」這段我沒法在這裡跑（沒有你的 Cloudflare 帳號和 key）——**要你部署後用上面 curl 或真機試**第一張。
- Cloudflare dashboard 介面偶爾改版，若某個按鈕名稱對不上（特別是步驟 2 複製 endpoint），用 app 的 **🔧 報修** 回我或直接跟我說，我調。
- model id（`claude-haiku-4-5` / `claude-sonnet-4-6`）與 vision / structured-output 格式取自 2026-06 當前 claude-api 文件。

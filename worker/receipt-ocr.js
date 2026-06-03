/* ════════════════════════════════════════════════════════════════════════
   receipt-ocr · Cloudflare Worker（薄殼）
   ────────────────────────────────────────────────────────────────────────
   單據記錄器的雲端辨識中繼。職責只有三件：
     1. 鎖 origin（只允許你的 github.io）+ 補 CORS（讓 PWA 能 fetch）
     2. 依前端送來的「使用者 schema」動態組 prompt + 結構化輸出
     3. 透過 Cloudflare AI Gateway 轉給 Claude vision，回 {values, rawText}
   key 存 Cloudflare secret（ANTHROPIC_API_KEY），永不進前端 / 不進 repo。
   AI Gateway 提供：用量觀測 / rate-limit / cache / 不改碼換 key。

   env（dashboard → Settings → Variables）:
     ALLOWED_ORIGIN  = https://zonal0223tw-max.github.io   （鎖你的站）
     GATEWAY_URL     = https://gateway.ai.cloudflare.com/v1/<account_id>/<gateway>/anthropic
                       （建好 AI Gateway 後複製它的 Anthropic endpoint；留空則直連 api.anthropic.com）
   secret（dashboard → Settings → Variables → Encrypt，或 wrangler secret put）:
     ANTHROPIC_API_KEY = sk-ant-...   （你的 Claude key）

   部署見同目錄 README.md。
   ════════════════════════════════════════════════════════════════════════ */

const MODELS = { haiku: 'claude-haiku-4-5', sonnet: 'claude-sonnet-4-6' };

export default {
  async fetch(req, env) {
    const allow = env.ALLOWED_ORIGIN || '*';
    const cors = {
      'Access-Control-Allow-Origin': allow,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'content-type',
      'Access-Control-Max-Age': '86400',
    };
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (req.method !== 'POST') return json({ error: 'POST only' }, 405, cors);

    // 鎖 origin（擋一般瀏覽器濫用；非絕對防線，AI Gateway rate-limit 兜底）
    const origin = req.headers.get('origin');
    if (env.ALLOWED_ORIGIN && origin && origin !== env.ALLOWED_ORIGIN)
      return json({ error: 'origin not allowed' }, 403, cors);

    if (!env.ANTHROPIC_API_KEY) return json({ error: 'server missing ANTHROPIC_API_KEY' }, 500, cors);

    let body;
    try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400, cors); }
    const { image, media_type, model, schema } = body || {};
    if (!image || !Array.isArray(schema) || !schema.length)
      return json({ error: 'need {image, schema[]}' }, 400, cors);

    const modelId = MODELS[model] || MODELS.haiku;

    // ── 依使用者 schema 動態組 prompt（engine/domain 分離：OCR 認的是你當下的欄位）──
    const fieldLines = schema.map(f => {
      const hint = f.type === 'money' ? '，純數字' :
                   f.type === 'date'  ? '，日期' :
                   (f.type === 'select' && f.options && f.options.length) ? `，可選: ${f.options.join(' / ')}` : '';
      return `- ${f.fid}（${f.label}${hint}）`;
    }).join('\n');
    const prompt =
`你是單據／發票 OCR。讀這張單據（可能是任何語言或國家），抽出下列欄位的值：
${fieldLines}

規則：
- 金額(money)只回純數字，去掉千分位符號與幣別（$1,280 → 1280；Rp 78.000 → 78000；1.280,50 → 1280.5）。
- 日期(date)一律回 YYYY-MM-DD。
- 找不到或看不清楚的欄位，回空字串 ""。
- 另外回 rawText = 單據上看得到的主要文字（給人核對用）。
只依上面列出的欄位回答，不要自己加欄位。`;

    // ── 結構化輸出 schema：保證回 {values:{<fid>:string}, rawText:string} ──
    const props = {}; const required = [];
    for (const f of schema) { props[f.fid] = { type: 'string' }; required.push(f.fid); }
    const outSchema = {
      type: 'object',
      properties: {
        values: { type: 'object', properties: props, required, additionalProperties: false },
        rawText: { type: 'string' },
      },
      required: ['values', 'rawText'],
      additionalProperties: false,
    };

    const apiBody = {
      model: modelId,
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: media_type || 'image/jpeg', data: image } },
          { type: 'text', text: prompt },
        ],
      }],
      output_config: { format: { type: 'json_schema', schema: outSchema } },
    };

    const base = env.GATEWAY_URL ? env.GATEWAY_URL.replace(/\/+$/, '') : 'https://api.anthropic.com';
    let r;
    try {
      r = await fetch(base + '/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(apiBody),
      });
    } catch (e) {
      return json({ error: 'upstream fetch failed: ' + (e && e.message || e) }, 502, cors);
    }

    const data = await r.json().catch(() => null);
    if (!r.ok) return json({ error: 'claude ' + r.status, detail: data }, 502, cors);

    // output_config 保證第一個 text block 是 valid JSON
    const text = (data && data.content && data.content.find(b => b.type === 'text') || {}).text || '{}';
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = { values: {}, rawText: text }; }
    return json({ values: parsed.values || {}, rawText: parsed.rawText || '' }, 200, cors);
  },
};

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...cors } });
}

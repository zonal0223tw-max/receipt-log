/* 單據記錄器 · service worker
   殼快取 + HTML network-first（迭代期不卡舊版，離線才回快取）。單據與照片在 IndexedDB 不經這裡。 */
const CACHE = 'rcptlog-v2';
const SHELL = ['./', './index.html', './manifest.json', './icon.svg'];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(()=>{}));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request;
  const isHTML = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  if (isHTML) {
    // network-first：有網路永遠拿最新版（迭代期不卡舊快取），離線才回快取
    e.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return resp;
      }).catch(() => caches.match(req).then(h => h || caches.match('./index.html')))
    );
    return;
  }
  // 其餘殼資源：cache-first（離線秒開）
  e.respondWith(
    caches.match(req).then(hit =>
      hit || fetch(req).then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(req, copy)).catch(()=>{});
        return resp;
      }).catch(() => caches.match('./index.html'))
    )
  );
});

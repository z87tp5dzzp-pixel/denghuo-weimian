/* 燈火未眠 service worker — network-first for code/data, cache-first for media */
const CACHE = 'dhwm-1793034794';
const CORE = ['./', 'index.html', 'style.css', 'js/expr.js', 'js/engine.js', 'js/ui.js', 'data/script.json', 'data/manifest.json', 'manifest.json', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k.startsWith('dhwm-') && k !== CACHE && k !== 'dhwm-media').map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const media = /\/(img|audio)\//.test(url.pathname);
  if (media) {
    if (req.headers.has('range')) return; // let the browser stream audio ranges
    e.respondWith(caches.open('dhwm-media').then(c => c.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok && r.status === 200) c.put(req, r.clone()); return r; }))));
    return;
  }
  e.respondWith(fetch(req).then(r => { if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); } return r; })
    .catch(() => caches.match(req).then(h => h || caches.match('index.html'))));
});

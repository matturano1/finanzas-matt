/* Finanzas Matt · service worker
   Archivos de la app: primero red (para ver siempre la última versión), caché si no hay internet.
   La API de Google no pasa por aquí: los datos sin conexión los guarda la app. */
const CACHE = 'finanzas-matt-v15';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png', 'icons/favicon-32.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;
  const fuentes = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!propio && !fuentes) return;
  if (fuentes) { // fuentes: caché primero
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => {
      const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); return res;
    })));
    return;
  }
  // red primero, pero con tiempo límite: en datos móviles lentos se abre desde la caché en vez de quedarse esperando
  const conTiempo = new Promise((ok, no) => { const t = setTimeout(() => no(new Error('tiempo')), 4000); fetch(req).then(r => { clearTimeout(t); ok(r); }, x => { clearTimeout(t); no(x); }); });
  e.respondWith(conTiempo.then(res => {
    if (res.ok) { const copia = res.clone(); caches.open(CACHE).then(c => c.put(req, copia)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true })
    .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});

/*
 * Service worker de Calculadoras CGT.
 * - Guarda la app en caché para que funcione sin conexión.
 * - Estrategia "stale-while-revalidate": responde al instante con la copia en
 *   caché y, en segundo plano, descarga la versión del servidor para la próxima vez.
 * - Si cambias mucho la app, sube el número de VERSION para forzar una caché nueva.
 */
const VERSION = 'cgt-v2';
const ARCHIVOS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(ARCHIVOS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(claves => Promise.all(claves.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;

  e.respondWith(caches.open(VERSION).then(async cache => {
    const enCache = await cache.match(req, { ignoreSearch: true });
    const deRed = fetch(req)
      .then(resp => { if (resp.ok) cache.put(req, resp.clone()); return resp; })
      .catch(() => enCache);
    return enCache || deRed;
  }));
});

// Service worker do e-reader.
// Estratégia: "app shell" (HTML/CSS/JS/manifest) em network-first, com
// fallback pro cache quando offline — assim uma atualização publicada no
// GitHub Pages chega para quem está online, sem travar em cache velho.
// Bibliotecas de terceiros em vendor/ são grandes e versionadas no nome do
// arquivo, então cache-first nelas é seguro e evita rebaixar ~1.7MB toda vez.
// Os livros em si (EPUB/PDF) nunca passam pelo service worker: ficam no
// IndexedDB, então funcionam offline sem ocupar o cache do navegador.

const CACHE_VERSION = 'ereader-v1';
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const VENDOR_CACHE = `${CACHE_VERSION}-vendor`;

const APP_SHELL_ASSETS = [
  './',
  './index.html',
  './reader.html',
  './manifest.json',
  './css/style.css',
  './js/db.js',
  './js/library.js',
  './js/reader.js',
  './js/reader-epub.js',
  './js/reader-pdf.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
];

const VENDOR_ASSETS = [
  './vendor/epub.min.js',
  './vendor/jszip.min.js',
  './vendor/pdf.min.js',
  './vendor/pdf.worker.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    Promise.all([
      caches.open(APP_SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_ASSETS)),
      caches.open(VENDOR_CACHE).then((cache) => cache.addAll(VENDOR_ASSETS)),
    ]).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== APP_SHELL_CACHE && key !== VENDOR_CACHE)
          .map((key) => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

function isVendorRequest(url) {
  return url.pathname.includes('/vendor/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (isVendorRequest(url)) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req).then((res) => {
        const clone = res.clone();
        caches.open(VENDOR_CACHE).then((cache) => cache.put(req, clone));
        return res;
      }))
    );
    return;
  }

  event.respondWith(
    fetch(req)
      .then((res) => {
        const clone = res.clone();
        caches.open(APP_SHELL_CACHE).then((cache) => cache.put(req, clone));
        return res;
      })
      .catch(() => caches.match(req).then((cached) => cached || caches.match('./index.html')))
  );
});

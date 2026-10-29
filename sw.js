// Guarda la cáscara de la app para que abra rápido. Los datos siempre vienen de la red.
const V = 'ts-v1', SHELL = ['./', 'index.html', 'app.js', 'api.js', 'app.css', 'styles.css', 'logo-club.png', 'config.js'];
self.addEventListener('install', e => e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))));
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin || e.request.method !== 'GET') return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});

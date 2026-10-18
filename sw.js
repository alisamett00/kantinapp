const CACHE_NAME = 'kantin-app-v5';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './manifest.json',
  './favicon.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './app-icon.jpg'
];

// Install Event - yeni SW'yi beklemeden hemen aktif et
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return Promise.all(
        ASSETS_TO_CACHE.map((url) => {
          // HTTP önbelleğini atlayarak her zaman güncel dosyayı al
          return cache.add(new Request(url, { cache: 'reload' })).catch((err) => {
            console.warn('Önbelleğe eklenemedi (atlanıyor):', url, err);
          });
        })
      );
    })
  );
});

// Activate Event - tüm eski cache'leri sil ve açık sayfaların kontrolünü devral
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch Event - Network First, fallback to cache
self.addEventListener('fetch', (event) => {
  const request = event.request;

  // Sadece GET isteklerini yönet
  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  // Firestore & Firebase çağrıları önbelleği atlasın
  if (url.origin.includes('firestore.googleapis.com') || url.origin.includes('firebaseio.com') || url.origin.includes('identitytoolkit')) {
    return;
  }

  // Sadece http(s) istekleri (chrome-extension vb. hariç)
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return;
  }

  // only-if-cached istekleri same-origin dışında hata verir; atla
  if (request.cache === 'only-if-cached' && request.mode !== 'same-origin') {
    return;
  }

  // Navigasyon isteklerinde Request'i değiştirmeden gönder (mode/redirect bozulmasın);
  // diğerlerinde HTTP önbelleğini doğrulamaya zorla (no-cache = her zaman revalidate)
  const networkFetch = request.mode === 'navigate'
    ? fetch(request)
    : fetch(request, { cache: 'no-cache' });

  event.respondWith(
    networkFetch.then((networkResponse) => {
      if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
        const responseToCache = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseToCache);
        }).catch(() => {});
      }
      return networkResponse;
    }).catch(() => {
      // Ağ yoksa önbellekten sun (çevrimdışı destek)
      return caches.match(request).then((cached) => {
        if (cached) return cached;
        if (request.mode === 'navigate') {
          return caches.match('./index.html').then((page) => page || Response.error());
        }
        return Response.error();
      });
    })
  );
});

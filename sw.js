const CACHE_NAME = 'ahn-deal-pro-v17';
const TILE_CACHE = 'ahn-tiles-v17';
const ENRICHMENT_CACHE = 'ahn-enrichment-v17';

const STATIC_ASSETS = [
  '/',
  '/ahn-pro-v2.html',
  '/manifest.json'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(STATIC_ASSETS).catch(() => {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME && cacheName !== TILE_CACHE && cacheName !== ENRICHMENT_CACHE) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Cache map tiles from OpenStreetMap
  if (url.hostname.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.open(TILE_CACHE).then(cache => {
        return cache.match(event.request).then(response => {
          if (response) return response;

          return fetch(event.request).then(response => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            return caches.match(event.request);
          });
        });
      })
    );
    return;
  }

  // Cache Leaflet and other CDN resources
  if (url.hostname.includes('unpkg.com') || url.hostname.includes('fonts.googleapis.com')) {
    event.respondWith(
      caches.open(CACHE_NAME).then(cache => {
        return cache.match(event.request).then(response => {
          if (response) return response;

          return fetch(event.request).then(response => {
            if (response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => {
            return new Response('Resource unavailable', { status: 503 });
          });
        });
      })
    );
    return;
  }

  // Cache enrichment API responses
  if (event.request.method === 'POST' && url.hostname.includes('api.anthropic.com')) {
    const cacheKey = new Request(event.request.url, {
      method: 'GET',
      headers: event.request.headers
    });

    event.respondWith(
      caches.open(ENRICHMENT_CACHE).then(cache => {
        return cache.match(cacheKey).then(response => {
          if (response) {
            return response;
          }

          return fetch(event.request).then(response => {
            if (response.status === 200) {
              cache.put(cacheKey, response.clone());
            }
            return response;
          }).catch(error => {
            console.log('Enrichment API offline:', error);
            return new Response(
              JSON.stringify({error: 'Offline - enrichment data unavailable'}),
              {status: 503, headers: {'Content-Type': 'application/json'}}
            );
          });
        });
      })
    );
    return;
  }

  // Default: Network first, fallback to cache
  event.respondWith(
    fetch(event.request).then(response => {
      if (response.status === 200) {
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
      }
      return response;
    }).catch(() => {
      return caches.match(event.request).then(response => {
        if (response) return response;

        if (event.request.destination === 'document') {
          return caches.match('/ahn-pro-v2.html');
        }

        return new Response('Resource unavailable', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: new Headers({
            'Content-Type': 'text/plain'
          })
        });
      });
    })
  );
});

self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

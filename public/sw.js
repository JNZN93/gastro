const SHELL_CACHE = 'gastro-shell-v1';
const RUNTIME_CACHE = 'gastro-runtime-v1';
const API_CACHE = 'gastro-api-v1';

const PRECACHE = ['/', '/offline.html', '/manifest.json', '/logo.webp', '/favicon.ico'];

const IS_DEV = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

const OFFLINE_API_PATHS = ['/api/orders/all-orders', '/api/customers'];

function isOfflineApi(url) {
  return OFFLINE_API_PATHS.some((path) => url.pathname === path);
}

function authScope(request) {
  const auth = request.headers.get('Authorization') || 'anon';
  let hash = 0;
  for (let i = 0; i < auth.length; i += 1) {
    hash = (Math.imul(hash, 31) + auth.charCodeAt(i)) >>> 0;
  }
  return String(hash);
}

function scopedApiRequest(request) {
  const url = new URL(request.url);
  url.searchParams.set('__scope', authScope(request));
  return new Request(url.toString(), { method: 'GET' });
}

async function putAll(urls) {
  const cache = await caches.open(SHELL_CACHE);
  await Promise.all(
    urls.map(async (url) => {
      try {
        const response = await fetch(url, { cache: 'reload', credentials: 'same-origin' });
        if (response.ok) {
          await cache.put(url, response);
        }
      } catch {
        /* one missing file must not abort the rest */
      }
    })
  );
}

self.addEventListener('install', (event) => {
  event.waitUntil(putAll(PRECACHE));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => ![SHELL_CACHE, RUNTIME_CACHE, API_CACHE].includes(key))
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

async function networkFirstApi(request) {
  const cache = await caches.open(API_CACHE);
  const scoped = scopedApiRequest(request);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      await cache.put(scoped, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await cache.match(scoped);
    if (cached) {
      return cached;
    }
    return new Response(JSON.stringify({ error: 'offline' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function networkFirstNavigation(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      await cache.put('/index.html', fresh.clone());
      await cache.put('/', fresh.clone());
    }
    return fresh;
  } catch {
    return (
      (await cache.match('/index.html')) ||
      (await cache.match('/')) ||
      (await cache.match('/offline.html')) ||
      new Response('Offline', { status: 503 })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(RUNTIME_CACHE);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached || new Response('Offline', { status: 503 }));
  return cached || network;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') {
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (url.pathname.startsWith('/api/')) {
    if (!isOfflineApi(url)) {
      return;
    }
    event.respondWith(networkFirstApi(request));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  if (IS_DEV) {
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data === 'CLEAR_API_CACHE') {
    event.waitUntil(caches.delete(API_CACHE));
  }
});

self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : '' };
  }
  const title = payload.title || 'Gastro Depot';
  const options = {
    body: payload.body || 'Neue Mitteilung',
    icon: payload.icon || '/logo.webp',
    badge: payload.badge || '/logo.webp',
    tag: payload.tag || 'gastro-push',
    lang: payload.lang || 'de',
    renotify: true,
    data: payload.data || { url: payload.url || '/picking' },
  };
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        client.postMessage({ type: 'PICKING_FEED' });
      }
      await self.registration.showNotification(title, options);
    })()
  );
});

function isPickingPath(url) {
  try {
    const path = new URL(url).pathname;
    return path === '/picking' || path.startsWith('/picking/');
  } catch {
    return false;
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = (event.notification.data && event.notification.data.url) || '/picking';
  const target = new URL(targetPath, self.location.origin).href;
  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const openPicking = windowClients.find((client) => isPickingPath(client.url));
      if (openPicking && 'focus' in openPicking) {
        await openPicking.focus();
        openPicking.postMessage({ type: 'PICKING_FEED' });
        return;
      }
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus();
          client.postMessage({ type: 'NAVIGATE', url: targetPath });
          return;
        }
      }
      await self.clients.openWindow(target);
    })()
  );
});

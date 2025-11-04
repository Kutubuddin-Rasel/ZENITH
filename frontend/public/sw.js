// Service Worker for caching and offline functionality
const CACHE_NAME = 'zenith-v1';
const STATIC_CACHE = 'zenith-static-v1';
const DYNAMIC_CACHE = 'zenith-dynamic-v1';

// Files to cache immediately
const STATIC_FILES = [
  '/',
  '/offline',
  '/manifest.json',
  '/favicon.ico',
];

// API endpoints to cache
const API_CACHE_PATTERNS = [
  /^\/api\/projects/,
  /^\/api\/issues/,
  /^\/api\/sprints/,
  /^\/api\/boards/,
];

// Cache strategies
const CACHE_STRATEGIES = {
  // Static assets - Cache First
  static: (request) => {
    return caches.match(request).then((response) => {
      return response || fetch(request).then((fetchResponse) => {
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return fetchResponse;
      });
    });
  },

  // API calls - Network First with fallback
  api: (request) => {
    return fetch(request).then((response) => {
      if (response.status === 200) {
        const responseClone = response.clone();
        caches.open(DYNAMIC_CACHE).then((cache) => {
          cache.put(request, responseClone);
        });
      }
      return response;
    }).catch(() => {
      return caches.match(request).then((response) => {
        return response || new Response(
          JSON.stringify({ error: 'Offline - No cached data available' }),
          { status: 503, headers: { 'Content-Type': 'application/json' } }
        );
      });
    });
  },

  // Images - Cache First with network fallback
  images: (request) => {
    return caches.match(request).then((response) => {
      return response || fetch(request).then((fetchResponse) => {
        if (fetchResponse.status === 200) {
          const responseClone = fetchResponse.clone();
          caches.open(STATIC_CACHE).then((cache) => {
            cache.put(request, responseClone);
          });
        }
        return fetchResponse;
      });
    });
  },
};

// Install event - cache static files
self.addEventListener('install', (event) => {
  console.log('Service Worker installing...');
  
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(STATIC_FILES);
    }).then(() => {
      return self.skipWaiting();
    })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('Service Worker activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      return self.clients.claim();
    })
  );
});

// Fetch event - implement caching strategies
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) {
    return;
  }

  // Determine cache strategy based on request type
  let strategy = 'static';

  if (url.pathname.startsWith('/api/')) {
    strategy = 'api';
  } else if (request.destination === 'image') {
    strategy = 'images';
  } else if (url.pathname.startsWith('/_next/static/')) {
    strategy = 'static';
  }

  event.respondWith(CACHE_STRATEGIES[strategy](request));
});

// Background sync for offline actions
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync') {
    event.waitUntil(doBackgroundSync());
  }
});

// Push notifications
self.addEventListener('push', (event) => {
  if (event.data) {
    const data = event.data.json();
    const options = {
      body: data.body,
      icon: '/icon-192x192.png',
      badge: '/badge-72x72.png',
      vibrate: [100, 50, 100],
      data: data.data,
      actions: data.actions || [],
    };

    event.waitUntil(
      self.registration.showNotification(data.title, options)
    );
  }
});

// Notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open') {
    event.waitUntil(
      clients.openWindow(event.notification.data?.url || '/')
    );
  }
});

// Background sync implementation
async function doBackgroundSync() {
  try {
    // Get pending requests from IndexedDB
    const pendingRequests = await getPendingRequests();
    
    for (const request of pendingRequests) {
      try {
        const response = await fetch(request.url, {
          method: request.method,
          headers: request.headers,
          body: request.body,
        });

        if (response.ok) {
          // Remove from pending requests
          await removePendingRequest(request.id);
        }
      } catch (error) {
        console.error('Background sync failed for request:', request, error);
      }
    }
  } catch (error) {
    console.error('Background sync error:', error);
  }
}

// IndexedDB helpers for offline storage
function getPendingRequests() {
  return new Promise((resolve) => {
    const request = indexedDB.open('zenith-offline', 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['pending-requests'], 'readonly');
      const store = transaction.objectStore('pending-requests');
      const getAllRequest = store.getAll();
      
      getAllRequest.onsuccess = () => {
        resolve(getAllRequest.result || []);
      };
    };
    
    request.onerror = () => {
      resolve([]);
    };
  });
}

function removePendingRequest(id) {
  return new Promise((resolve) => {
    const request = indexedDB.open('zenith-offline', 1);
    
    request.onsuccess = (event) => {
      const db = event.target.result;
      const transaction = db.transaction(['pending-requests'], 'readwrite');
      const store = transaction.objectStore('pending-requests');
      const deleteRequest = store.delete(id);
      
      deleteRequest.onsuccess = () => resolve();
    };
    
    request.onerror = () => resolve();
  });
}

// Cache management
async function cleanupCaches() {
  const cacheNames = await caches.keys();
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
  
  for (const cacheName of cacheNames) {
    const cache = await caches.open(cacheName);
    const requests = await cache.keys();
    
    for (const request of requests) {
      const response = await cache.match(request);
      const dateHeader = response.headers.get('date');
      
      if (dateHeader) {
        const responseDate = new Date(dateHeader);
        const age = Date.now() - responseDate.getTime();
        
        if (age > maxAge) {
          await cache.delete(request);
        }
      }
    }
  }
}

// Periodic cleanup
setInterval(cleanupCaches, 24 * 60 * 60 * 1000); // Daily cleanup

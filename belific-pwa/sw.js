/**
 * =============================================
 * SERVICE WORKER - Offline Support
 * =============================================
 * 
 * This service worker enables offline functionality:
 * - Caches all app files on first visit
 * - Serves cached files when offline
 * - Updates cache when online
 * 
 * CACHING STRATEGY: Cache-first, network-fallback
 * - Try to serve from cache first (fast)
 * - If not in cache, fetch from network
 * - Cache new fetches for future offline use
 */

/**
 * Cache version - increment this to force cache refresh
 * when you deploy updates.
 */
const CACHE_NAME = 'belific-v1.1.0';

/**
 * Files to cache on install.
 * These are the core app files needed for offline use.
 */
const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/css/styles.css',
    '/js/data.js',
    '/js/storage.js',
    '/js/schedule.js',
    '/js/notifications.js',
    '/js/timer.js',
    '/js/ui.js',
    '/js/app.js',
    '/assets/icon-192.png',
    '/assets/icon-512.png'
];

/**
 * INSTALL EVENT
 * 
 * Fired when the service worker is first installed.
 * We use this to cache all the core app files.
 */
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app files');
                return cache.addAll(FILES_TO_CACHE);
            })
            .then(() => {
                // Force this service worker to become active immediately
                return self.skipWaiting();
            })
    );
});

/**
 * ACTIVATE EVENT
 * 
 * Fired when the service worker becomes active.
 * We use this to clean up old caches from previous versions.
 */
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => cacheName !== CACHE_NAME)
                        .map((cacheName) => {
                            console.log('[SW] Deleting old cache:', cacheName);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                // Take control of all pages immediately
                return self.clients.claim();
            })
    );
});

/**
 * FETCH EVENT
 * 
 * Fired for every network request from the app.
 * We intercept requests and serve from cache when possible.
 * 
 * Strategy: Cache-first, network-fallback
 * 1. Check if request is in cache
 * 2. If cached, return cached response
 * 3. If not cached, fetch from network
 * 4. Cache the network response for future
 * 5. If network fails and not in cache, show offline page
 */
self.addEventListener('fetch', (event) => {
    // Only handle GET requests
    if (event.request.method !== 'GET') {
        return;
    }
    
    event.respondWith(
        caches.match(event.request)
            .then((cachedResponse) => {
                // If found in cache, return it
                if (cachedResponse) {
                    return cachedResponse;
                }
                
                // Otherwise, fetch from network
                return fetch(event.request)
                    .then((networkResponse) => {
                        // Check if valid response
                        if (!networkResponse || networkResponse.status !== 200) {
                            return networkResponse;
                        }
                        
                        // Clone the response (can only be read once)
                        const responseToCache = networkResponse.clone();
                        
                        // Add to cache for future offline use
                        caches.open(CACHE_NAME)
                            .then((cache) => {
                                cache.put(event.request, responseToCache);
                            });
                        
                        return networkResponse;
                    })
                    .catch(() => {
                        // Network failed, try to return offline fallback
                        return caches.match('/index.html');
                    });
            })
    );
});

/**
 * MESSAGE EVENT
 * 
 * Allows the app to communicate with the service worker.
 * Currently used to trigger cache updates.
 */
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') {
        self.skipWaiting();
    }
});

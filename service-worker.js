/**
 * Service Worker – Smart Image Resizer
 * Provides offline support and caching for the PWA
 */

const CACHE_NAME = 'smart-resize-v1';

// Assets to pre-cache for offline use
const PRECACHE_URLS = [
    './',
    './index.html',
    './style.css',
    './script.js',
    './manifest.json',
];

// CDN resources to cache on first use
const CDN_URLS = [
    'https://cdn.tailwindcss.com',
    'https://cdn.jsdelivr.net/npm/pica@9.0.1/dist/pica.min.js',
    'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js',
    'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js',
    'https://unpkg.com/lucide@latest',
];

// Install event – pre-cache local assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[SW] Pre-caching local assets');
            return cache.addAll(PRECACHE_URLS);
        })
    );
    self.skipWaiting();
});

// Activate event – clean up old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
            );
        })
    );
    self.clients.claim();
});

// Fetch event – serve from cache, fall back to network
self.addEventListener('fetch', (event) => {
    // Skip non-GET requests
    if (event.request.method !== 'GET') return;

    // Skip chrome-extension and blob URLs
    if (event.request.url.startsWith('chrome-extension') || event.request.url.startsWith('blob:')) return;

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }

            return fetch(event.request).then((networkResponse) => {
                // Cache CDN resources and successful responses
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    const url = event.request.url;

                    // Cache CDN and font resources
                    if (CDN_URLS.some((cdn) => url.startsWith(cdn)) || url.includes('fonts.googleapis.com') || url.includes('fonts.gstatic.com')) {
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(event.request, responseClone);
                        });
                    }
                }

                return networkResponse;
            }).catch(() => {
                // Offline fallback – return cached index for navigation requests
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                return new Response('Offline', { status: 503, statusText: 'Offline' });
            });
        })
    );
});

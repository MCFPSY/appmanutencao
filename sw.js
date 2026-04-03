// ================================================
// Service Worker - App de Manutenção
// Suporte offline e cache de recursos
// ================================================

const CACHE_NAME = 'manutencao-v20';
const STATIC_CACHE = 'manutencao-static-v20';
const DYNAMIC_CACHE = 'manutencao-dynamic-v20';

// Recursos para cache no install
const STATIC_ASSETS = [
    './',
    './index.html',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'
];

// ============================================
// INSTALL EVENT
// ============================================
self.addEventListener('install', (event) => {
    console.log('[Service Worker] Instalando...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then((cache) => {
                console.log('[Service Worker] Caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => {
                console.log('[Service Worker] Instalado com sucesso');
                return self.skipWaiting();
            })
            .catch((error) => {
                console.error('[Service Worker] Erro no install:', error);
            })
    );
});

// ============================================
// ACTIVATE EVENT
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[Service Worker] Ativando...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => {
                        if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
                            console.log('[Service Worker] Removendo cache antigo:', cacheName);
                            return caches.delete(cacheName);
                        }
                    })
                );
            })
            .then(() => {
                console.log('[Service Worker] Ativado com sucesso');
                return self.clients.claim();
            })
    );
});

// ============================================
// FETCH EVENT
// ============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Ignorar requisições para Google Sheets API
    if (url.href.includes('script.google.com') || url.href.includes('docs.google.com')) {
        return;
    }
    
    // Estratégia: Network First para HTML, Cache First para assets estáticos
    const isHTML = request.destination === 'document' || url.pathname.endsWith('.html') || url.pathname === '/' || url.pathname === '';

    if (isHTML) {
        // Network First para HTML — sempre obter a versão mais recente
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const clone = networkResponse.clone();
                        caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
                    }
                    return networkResponse;
                })
                .catch(() => {
                    return caches.match(request) || caches.match('/index.html');
                })
        );
    } else {
        // Cache First para assets (JS libs, CSS, imagens)
        event.respondWith(
            caches.match(request)
                .then((cachedResponse) => {
                    if (cachedResponse) return cachedResponse;
                    return fetch(request)
                        .then((networkResponse) => {
                            if (request.method === 'GET' && !url.href.includes('chrome-extension')) {
                                const clone = networkResponse.clone();
                                caches.open(DYNAMIC_CACHE).then((cache) => cache.put(request, clone));
                            }
                            return networkResponse;
                        })
                        .catch((error) => {
                            console.error('[Service Worker] Fetch failed:', error);
                        });
                })
        );
    }
});

// ============================================
// BACKGROUND SYNC
// ============================================
self.addEventListener('sync', (event) => {
    console.log('[Service Worker] Background sync:', event.tag);
    
    if (event.tag === 'sync-requests') {
        event.waitUntil(
            syncRequests()
        );
    }
});

// ============================================
// PUSH NOTIFICATIONS (opcional)
// ============================================
self.addEventListener('push', (event) => {
    console.log('[Service Worker] Push notification received');
    
    const data = event.data ? event.data.json() : {};
    const title = data.title || 'App de Manutenção';
    const options = {
        body: data.body || 'Novo pedido de manutenção',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: data
    };
    
    event.waitUntil(
        self.registration.showNotification(title, options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[Service Worker] Notification clicked');
    
    event.notification.close();
    
    event.waitUntil(
        clients.openWindow('/')
    );
});

// ============================================
// HELPER FUNCTIONS
// ============================================

// Atualizar cache em background
function updateCache(request) {
    return fetch(request)
        .then((response) => {
            if (response && response.status === 200) {
                return caches.open(DYNAMIC_CACHE)
                    .then((cache) => {
                        cache.put(request, response);
                    });
            }
        })
        .catch(() => {
            // Silenciosamente falhar se não conseguir atualizar
        });
}

// Sincronizar pedidos offline
async function syncRequests() {
    try {
        // Comunicar com a página para processar fila offline
        const clients = await self.clients.matchAll();
        clients.forEach((client) => {
            client.postMessage({
                type: 'SYNC_REQUESTS'
            });
        });
    } catch (error) {
        console.error('[Service Worker] Erro ao sincronizar:', error);
    }
}

// ============================================
// MESSAGE HANDLER
// ============================================
self.addEventListener('message', (event) => {
    console.log('[Service Worker] Message received:', event.data);
    
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            })
        );
    }
});

// ============================================
// LOGGING
// ============================================
console.log('[Service Worker] Registado e pronto');

/* FF Cash Battle service worker — shows message notifications and opens the right chat when tapped.
   It does NOT cache pages (no stale-app problems). */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const d = event.notification.data || {};
    const url = new URL(d.kind ? './?chat=' + encodeURIComponent(d.kind + ':' + d.id) : './', self.registration.scope).href;
    event.waitUntil((async () => {
        const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const c of list) {
            if ('focus' in c) { c.postMessage({ type: 'open-chat', room: d }); return c.focus(); }
        }
        return self.clients.openWindow(url);
    })());
});

// Ready for real push later (FCM / Web Push): shows whatever the server sends.
self.addEventListener('push', (event) => {
    let p = {}; try { p = event.data ? event.data.json() : {}; } catch (e) { p = { title: 'FF Cash Battle', body: event.data ? event.data.text() : '' }; }
    event.waitUntil(self.registration.showNotification(p.title || 'FF Cash Battle', { body: p.body || '', icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png', tag: p.tag, data: p.data || {} }));
});

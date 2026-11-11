// Pat's PreTrips service worker.
// - Static build assets and icons: cache-first (they are content-hashed).
// - Page navigations: always network; if offline, show /offline.html.
// Pages and API/auth responses are never cached, so one driver's trips
// can't be shown to someone else on a shared device.
const VERSION = 'v1'
const STATIC_CACHE = `pretrips-static-${VERSION}`
const OFFLINE_URL = '/offline.html'
const PRECACHE = [
	OFFLINE_URL,
	'/icons/icon-192.png',
	'/icons/icon-512.png',
	'/icon.svg',
]

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(STATIC_CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => self.skipWaiting()),
	)
})

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== STATIC_CACHE)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	)
})

function isStaticAsset(url) {
	return (
		url.pathname.startsWith('/_next/static/') ||
		url.pathname.startsWith('/icons/') ||
		url.pathname.startsWith('/images/') ||
		url.pathname === '/icon.svg'
	)
}

self.addEventListener('fetch', (event) => {
	const { request } = event
	if (request.method !== 'GET') return
	const url = new URL(request.url)
	if (url.origin !== self.location.origin) return

	if (request.mode === 'navigate') {
		event.respondWith(
			fetch(request).catch(() =>
				caches
					.match(OFFLINE_URL)
					.then((res) => res || Response.error()),
			),
		)
		return
	}

	if (isStaticAsset(url)) {
		event.respondWith(
			caches.match(request).then(
				(cached) =>
					cached ||
					fetch(request).then((response) => {
						if (response.ok) {
							const copy = response.clone()
							caches
								.open(STATIC_CACHE)
								.then((cache) => cache.put(request, copy))
						}
						return response
					}),
			),
		)
	}
})

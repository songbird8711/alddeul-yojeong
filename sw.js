const CACHE_NAME = 'alddeul-yojeong-v4'; // v3 -> v4: UX 개선(히스토리 복원/임시저장/swap/초기화/공유) 반영
const ASSETS = [
  './index.html',
  './style.css',
  './js/calculator.js',
  './js/storage.js',
  './js/ocr.js',
  './js/app.js',
  './manifest.json',
  './icons/icon.svg',
  './offline.html',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .catch((err) => console.error('[SW] 캐시 저장 실패:', err)) // 조용히 숨기지 않고 로그로 남김
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // /api/ 요청(온라인 최저가 검색 등)은 실시간 데이터라 캐싱하지 않고 그대로 네트워크로 통과시킨다.
  if (url.pathname.startsWith('/api/')) {
    return; // 서비스워커가 가로채지 않음 -> 브라우저 기본 네트워크 요청으로 처리됨
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
          return res;
        })
        .catch(async () => {
          // 캐시도 없고 네트워크도 실패한 경우: 절대 undefined를 반환하지 않는다.
          if (event.request.mode === 'navigate') {
            const offline = await caches.match('./offline.html');
            if (offline) return offline;
          }
          // 그 외 리소스(css/js 등)는 빈 실패 응답이라도 유효한 Response로 반환
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});

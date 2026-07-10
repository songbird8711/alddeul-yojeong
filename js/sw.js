const CACHE_NAME = 'alddeul-yojeong-v6'; // v5 -> v6: 여행지 통화 10종 추가 + 환율 버그 수정을 기존 사용자에게 즉시 반영하기 위해 버전업
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

// 캐시에 저장해도 안전한 응답인지 확인.
// - 정상(200) 응답만 저장한다.
// - 리다이렉트를 거친 응답(response.redirected === true)은 저장하지 않는다.
//   (리다이렉트된 응답을 나중에 navigate 요청에 그대로 재사용하면
//    브라우저가 로드 자체를 실패시켜 "사이트에 연결할 수 없음"이 뜨는 문제가 있었음)
function isCacheable(response) {
  return response && response.ok && !response.redirected && response.type !== 'opaqueredirect';
}

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);
  // /api/ 요청(온라인 최저가 검색 등)은 실시간 데이터라 캐싱하지 않고 그대로 네트워크로 통과시킨다.
  if (url.pathname.startsWith('/api/')) {
    return; // 서비스워커가 가로채지 않음 -> 브라우저 기본 네트워크 요청으로 처리됨
  }

  // ---- 페이지 이동(navigate) 요청: 네트워크 우선, 실패 시에만 캐시 ----
  // 앱을 껐다 켤 때마다 항상 최신 페이지를 받아오고, 오프라인일 때만 캐시로 대체한다.
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('./index.html');
          if (cached) return cached;
          const offline = await caches.match('./offline.html');
          if (offline) return offline;
          return new Response('오프라인 상태이고 저장된 페이지도 없어요.', { status: 503, statusText: 'Offline' });
        })
    );
    return;
  }

  // ---- 그 외 정적 자산(js/css/이미지 등): 캐시 우선, 없으면 네트워크 ----
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((res) => {
          if (isCacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => {
          // 캐시도 없고 네트워크도 실패한 경우: 절대 undefined를 반환하지 않는다.
          return new Response('', { status: 503, statusText: 'Offline' });
        });
    })
  );
});

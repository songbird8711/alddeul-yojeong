// api/search-price.js
// Vercel 서버리스 함수: /api/search-price?query=상품명 으로 호출하면
// 네이버쇼핑 검색 API를 대신 호출해서 최저가 순으로 결과를 반환한다.
// API 키(NAVER_CLIENT_ID, NAVER_CLIENT_SECRET)는 Vercel 프로젝트의
// 환경변수로만 저장하고, 절대 클라이언트 코드에는 넣지 않는다.

module.exports = async function handler(req, res) {
  const query = (req.query.query || '').trim();

  if (!query) {
    res.status(400).json({ error: '검색어(query)가 필요합니다.' });
    return;
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    res.status(500).json({
      error: '서버에 네이버 API 키가 설정되지 않았어요. Vercel 프로젝트 설정 > Environment Variables에서 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET을 추가해주세요.',
    });
    return;
  }

  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(query)}&display=5&sort=asc`;

  try {
    const naverRes = await fetch(url, {
      headers: {
        'X-Naver-Client-Id': clientId,
        'X-Naver-Client-Secret': clientSecret,
      },
    });

    if (!naverRes.ok) {
      const errText = await naverRes.text();
      res.status(naverRes.status).json({ error: `네이버 API 오류: ${errText}` });
      return;
    }

    const data = await naverRes.json();
    const items = (data.items || []).map((item) => ({
      title: stripTags(item.title),
      price: Number(item.lprice) || 0,
      mallName: item.mallName || '',
      link: item.link,
    }));

    res.status(200).json({ query, items });
  } catch (err) {
    res.status(500).json({ error: '검색 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.' });
  }
};

// 네이버 API는 검색어 강조를 위해 <b>태그</b>를 제목에 섞어서 반환하므로 제거한다.
function stripTags(str) {
  return String(str || '').replace(/<\/?[^>]+>/g, '');
}

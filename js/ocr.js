// ocr.js
// PaddleOCR이 반환한 결과에서 "가격 후보"와 "용량 후보"를 뽑아내는 순수 함수 모음.
// DOM이나 OCR 엔진 자체를 몰라도 되게 분리 — 나중에 다른 OCR 엔진으로 바꿔도 이 파일만 교체하면 됨.
//
// [v2 변경사항 - 실제 마트/정육점 사진 검증 후 재설계]
// 예전엔 result.text(줄바꿈으로 합쳐진 문자열) 하나만 놓고 정규식으로 숫자를 뽑았다.
// 문제: "가장 큰 숫자 = 가격"으로 가정했는데, 실제로는 바코드 숫자 조각이 우연히 더 큰 값으로
// 조합되면 그게 가격으로 잘못 뽑히는 사고가 실측 데이터에서 확인됐다
// (정육점 라벨 예시: 진짜 가격 11740원 대신 바코드 조각으로 만들어진 20012가 뽑힘).
//
// 새 방식은 PaddleOCR이 텍스트마다 같이 주는 인식 신뢰도(confidence)와 박스 크기(box.height)를
// 활용한다. 처음엔 "글자가 큰 후보 우선"으로 설계했는데, 실측 데이터에서 이력번호처럼 얇고 긴
// 텍스트의 bounding box가 비정상적으로 크게 잡히는 경우가 나와 글자 크기만으로는 신뢰할 수
// 없었다. 대신 신뢰도가 훨씬 안정적인 신호였다 — 실측 라벨에서 진짜 가격의 인식 신뢰도가
// 전체 텍스트 중 가장 높게 나오는 경향이 뚜렷했다(정육점 라벨 예시: 진짜 가격 11740원의
// 신뢰도 0.945가 라벨 전체에서 최고값). 그래서 신뢰도를 1차 기준, 글자 크기를 2차(신뢰도가
// 오차범위 내로 비슷할 때만) 기준으로 쓴다.
//
// 라벨 형식(ESL 디지털 태그 vs 정육점/수산 구조화 라벨)에 따라 파싱 로직 자체를 분기하는 것도
// 검토했지만, 위 "글자 크기 우선" 방식이 형식과 무관하게 잘 통해서 분기를 두지 않기로 했다.
// 대신 라벨 형식 감지는 카테고리 자동 추정(육류/수산 등)에만 참고용으로 쓴다 — detectLabelHint 참고.

const OcrParser = (() => {

  const WEIGHT_VOLUME_UNITS = ['kg', 'g', 'lb', 'oz', 'ml', 'l'];
  const PRICE_KEYWORDS = ['가격', '판매가', '단가', '특가', '행사가'];
  const BUTCHER_KEYWORDS = ['중량', '가격', '원산지', '포장', '소비기한', '이력', '도축장'];

  // ---------------------------------------------------------------
  // 레거시 경로: 구조화된 result(lines/box/confidence)가 없을 때 쓰는
  // 순수 텍스트 기반 추출. (구버전 OCR 엔진 호환용, 테스트용으로도 사용)
  // ---------------------------------------------------------------
  function extractPriceCandidatesFromText(text) {
    const found = new Map();
    // 콤마(,) 자리가 OCR에서 공백이나 마침표로 잘못 읽히는 경우가 실제로 있어(예: "3,580"->"3 580"
    // 또는 "8,980"->"8.980") 세 구분자를 모두 허용한다. 줄바꿈은 무관한 숫자를 잘못 이어붙일
    // 위험이 있어 제외.
    const markedRe = /(?:₩\s?)?(\d{1,3}(?:[,. ]\d{3})+|(?<!\d)\d{3,6}(?!\d))\s?원?/g;
    let m;
    while ((m = markedRe.exec(text)) !== null) {
      const raw = m[0].trim();
      const value = parseInt(m[1].replace(/[,. ]/g, ''), 10);
      if (!isNaN(value) && value > 0) {
        found.set(value, { value, raw, confidence: null, maxHeight: null, hasWonSuffix: /원/.test(raw) });
      }
    }
    return Array.from(found.values())
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }

  // ---------------------------------------------------------------
  // 신규 경로: PaddleOCR의 구조화 결과(result.lines: 줄 배열의 배열, 각 항목이
  // { text, box:{x,y,width,height}, confidence })를 박스 단위로 분석한다.
  // ---------------------------------------------------------------
  function flattenBoxes(lines) {
    const boxes = [];
    (lines || []).forEach((lineArr, lineIndex) => {
      (lineArr || []).forEach((box) => {
        if (box && typeof box.text === 'string' && box.text.trim() !== '') {
          boxes.push({ text: box.text.trim(), box: box.box || {}, confidence: typeof box.confidence === 'number' ? box.confidence : 0, lineIndex });
        }
      });
    });
    return boxes;
  }

  function isNumericish(t) {
    return /^[\d,.\s]+$/.test(t) && /\d/.test(t);
  }

  // 두 박스가 "OCR이 원래 하나였던 숫자를 둘로 쪼갠 것"으로 볼 만큼 가깝고 크기가 비슷한지.
  // (같은 줄 + 수평으로 붙어있음 + 글자 높이가 비슷함 — 바코드처럼 여러 다른 글자가
  //  우연히 붙어있는 경우와 구분하기 위한 최소한의 안전장치. 완벽하지는 않다.)
  function looksLikeSplitNumber(a, b) {
    if (a.lineIndex !== b.lineIndex) return false;
    const ah = a.box.height || 0;
    const bh = b.box.height || 0;
    if (!ah || !bh) return false;
    const heightDiff = Math.abs(ah - bh) / Math.max(ah, bh);
    if (heightDiff > 0.35) return false; // 글자 크기가 35% 넘게 다르면 같은 숫자였을 가능성 낮음
    const gap = (b.box.x || 0) - ((a.box.x || 0) + (a.box.width || 0));
    const avgHeight = (ah + bh) / 2;
    return gap >= -avgHeight * 0.3 && gap <= avgHeight * 1.0;
  }

  function hasNearbyKeyword(boxes, targetBox, keywords, maxLineDistance = 2) {
    return boxes.some((b) => {
      if (Math.abs(b.lineIndex - targetBox.lineIndex) > maxLineDistance) return false;
      return keywords.some((kw) => b.text.replace(/\s/g, '').includes(kw));
    });
  }

  function extractPriceCandidatesFromBoxes(boxes) {
    const candidates = [];

    const numericBoxes = boxes.filter((b) => isNumericish(b.text));

    numericBoxes.forEach((b, i) => {
      // 1) 박스 하나만으로 이미 유효한 가격 형태인 경우 (예: "1,780", "11740")
      const single = parsePriceString(b.text);
      if (single != null) {
        candidates.push({
          value: single,
          raw: b.text,
          confidence: b.confidence,
          maxHeight: b.box.height || 0,
          hasWonSuffix: hasNearbyKeyword(boxes, b, ['원'], 0),
          hasKeywordAnchor: hasNearbyKeyword(boxes, b, PRICE_KEYWORDS),
        });
      }

      // 2) 바로 다음 숫자 박스와 합쳤을 때 유효한 경우 (OCR이 한 숫자를 둘로 쪼갠 케이스)
      const next = numericBoxes[i + 1];
      if (next && looksLikeSplitNumber(b, next)) {
        const merged = parsePriceString(`${b.text} ${next.text}`);
        if (merged != null) {
          candidates.push({
            value: merged,
            raw: `${b.text} ${next.text}`,
            confidence: Math.min(b.confidence, next.confidence), // 약한 쪽 기준(보수적으로)
            maxHeight: Math.max(b.box.height || 0, next.box.height || 0),
            hasWonSuffix: hasNearbyKeyword(boxes, next, ['원'], 0),
            hasKeywordAnchor: hasNearbyKeyword(boxes, b, PRICE_KEYWORDS),
          });
        }
      }
    });

    // 값 기준으로 중복 제거하되, 같은 값이면 더 신뢰도 높은/글자 큰 쪽을 남긴다.
    const byValue = new Map();
    candidates.forEach((c) => {
      const existing = byValue.get(c.value);
      if (!existing || c.maxHeight > existing.maxHeight || (c.maxHeight === existing.maxHeight && c.confidence > existing.confidence)) {
        byValue.set(c.value, c);
      }
    });

    return Array.from(byValue.values())
      .sort((a, b) => {
        // 키워드 근처("가격" 등)에 있는 후보를 최우선
        if (a.hasKeywordAnchor !== b.hasKeywordAnchor) return a.hasKeywordAnchor ? -1 : 1;
        // 그 다음 인식 신뢰도 — 박스 크기(글자 크기)는 이력번호 등에서 비정상적으로 크게
        // 잡히는 경우가 실제로 발견되어(예: 얇고 긴 텍스트가 큰 bounding box로 잡힘) 1차
        // 기준으로 쓰기엔 노이즈가 있었다. 신뢰도가 훨씬 안정적이었다 — 실측 데이터에서
        // 진짜 가격의 신뢰도가 라벨 전체를 통틀어 가장 높게 나온 경우가 많았다.
        if (Math.abs(b.confidence - a.confidence) > 0.02) return b.confidence - a.confidence;
        // 신뢰도가 거의 같으면(오차범위 내) 글자 크기로 판단
        if (b.maxHeight !== a.maxHeight) return b.maxHeight - a.maxHeight;
        // 마지막으로 숫자 크기
        return b.value - a.value;
      })
      .slice(0, 6);
  }

  // 문자열 하나에서 가격을 파싱한다(박스 내부용 — 이미 한 박스 안에 있는 텍스트라
  // 줄바꿈 걱정 없이 공백/콤마/마침표를 구분자로 허용해도 안전하다).
  function parsePriceString(str) {
    const m = str.match(/(\d{1,3}(?:[,. ]\d{3})+|(?<!\d)\d{3,6}(?!\d))/);
    if (!m) return null;
    const value = parseInt(m[1].replace(/[,. ]/g, ''), 10);
    return isNaN(value) || value <= 0 ? null : value;
  }

  /**
   * 통화 표시가 붙은 숫자를 가격 후보로 추출한다.
   * 구조화된 result(lines 포함)가 주어지면 박스 단위(신뢰도+글자크기 기반)로,
   * 아니면 기존 텍스트 기반 방식으로 폴백한다.
   */
  function extractPriceCandidates(input) {
    if (input && typeof input === 'object' && Array.isArray(input.lines)) {
      const boxes = flattenBoxes(input.lines);
      const boxResult = extractPriceCandidatesFromBoxes(boxes);
      if (boxResult.length > 0) return boxResult;
      // 박스 정보로 못 찾으면 텍스트 폴백도 시도(안전망)
      return extractPriceCandidatesFromText(input.text || '');
    }
    return extractPriceCandidatesFromText(typeof input === 'string' ? input : '');
  }

  /**
   * 숫자+단위(g, kg, ml, l, lb, oz) 조합을 용량 후보로 추출한다.
   * (아직까지 실측에서 이 부분 자체의 오탐은 없었어서 텍스트 기반 방식을 유지한다)
   */
  function extractAmountCandidates(input) {
    const text = input && typeof input === 'object' ? (input.text || '') : (input || '');
    const found = new Map();

    const re = new RegExp(`(\\d+(?:\\.\\d+)?)\\s?(${WEIGHT_VOLUME_UNITS.join('|')})\\b`, 'gi');
    let m;
    while ((m = re.exec(text)) !== null) {
      let value = parseFloat(m[1]);
      const rawUnit = m[2].toLowerCase();
      let unit = rawUnit;
      if (rawUnit === 'l') {
        value = value * 1000; // 1L = 1000ml, 값도 반드시 함께 환산해야 함
        unit = 'ml';
      }
      const key = `${value}-${unit}`;
      if (!isNaN(value) && value > 0 && !found.has(key)) {
        found.set(key, { value, unit, raw: m[0].trim() });
      }
    }

    return Array.from(found.values()).slice(0, 6);
  }

  /**
   * OCR 텍스트에서 상품명으로 보이는 한 줄을 추측한다.
   * 숫자/단위/통화기호만 있는 줄은 제외하고, 한글이 가장 많이 포함된 줄을 상품명으로 본다.
   */
  function guessProductName(input) {
    const text = input && typeof input === 'object' ? (input.text || '') : (input || '');
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    let best = null;
    let bestScore = 0;
    for (const line of lines) {
      const hangulCount = (line.match(/[\uAC00-\uD7A3]/g) || []).length;
      const isMostlyNumeric = /^[\d,.\s원₩%\-+/a-zA-Z]*$/.test(line);
      if (hangulCount >= 2 && !isMostlyNumeric && line.length <= 30 && hangulCount > bestScore) {
        bestScore = hangulCount;
        best = line;
      }
    }
    return best;
  }

  /**
   * 상품 카테고리 자동 분류 — 상품명에 포함된 키워드로 판단한다.
   * ESL 스캔 결과와 사용자가 직접 입력한 계획 항목("고기", "과자" 등) 둘 다에 사용된다.
   * 완벽할 수 없으므로 사용자가 화면에서 직접 수정할 수 있게 해야 한다(UI 쪽 책임).
   */
  const CATEGORIES = ['신선', '과일', '육류', '수산', '유제품', '과자·음료', '생필품', '기타'];

  const CATEGORY_KEYWORDS = {
    '신선': ['채소', '야채', '상추', '배추', '무', '대파', '마늘', '양파', '감자', '고구마', '오이', '당근', '시금치', '버섯', '두부', '콩나물', '부추', '나물'],
    '과일': ['사과', '바나나', '포도', '딸기', '수박', '참외', '귤', '오렌지', '배', '복숭아', '자두', '키위', '망고', '체리', '멜론', '과일'],
    '육류': ['고기', '소고기', '돼지고기', '삼겹살', '목살', '불고기', '닭고기', '닭', '돈까스', '안심', '등심', '갈비', '다짐육', '한우', '스테이크', '육류', '베이컨', '햄'],
    '수산': ['생선', '고등어', '갈치', '오징어', '새우', '조개', '김', '미역', '멸치', '참치', '연어', '굴', '낙지', '문어', '어묵', '수산'],
    '유제품': ['우유', '치즈', '요거트', '요구르트', '버터', '생크림', '두유', '유제품'],
    '과자·음료': ['과자', '스낵', '초콜릿', '사탕', '껌', '음료', '콜라', '사이다', '주스', '커피', '맥주', '소주', '라면', '빵', '아이스크림'],
    '생필품': ['휴지', '세제', '샴푸', '비누', '치약', '칫솔', '물티슈', '쓰레기봉투', '세탁', '화장지', '생필품'],
  };

  // 일반 키워드 매칭보다 먼저 확인한다. 브랜드/제품명 안에 다른 카테고리 키워드가
  // 우연히 포함된 경우를 막기 위함 (예: "새우깡"의 "새우" 때문에 수산으로 오분류되는 것 방지)
  const CATEGORY_OVERRIDES = {
    '과자·음료': ['새우깡', '고래밥', '꿀꽈배기', '포카칩', '조리퐁', '빼빼로', '초코파이', '오징어땅콩', '자갈치', '바나나킥'],
  };

  function guessCategory(name) {
    if (!name) return '기타';
    const compact = String(name).replace(/\s/g, '');
    for (const cat of Object.keys(CATEGORY_OVERRIDES)) {
      if (CATEGORY_OVERRIDES[cat].some((k) => compact.includes(k))) return cat;
    }
    for (const cat of CATEGORIES) {
      const keywords = CATEGORY_KEYWORDS[cat];
      if (keywords && keywords.some((k) => compact.includes(k))) return cat;
    }
    return '기타';
  }

  /**
   * 라벨이 ESL 디지털 태그인지, 정육점/수산 같은 구조화된 인쇄 라벨인지 힌트만 준다.
   * 파싱 로직 분기용이 아니라 "카테고리 자동 추정"(육류/수산 등) 참고용.
   */
  function detectLabelHint(input) {
    const text = input && typeof input === 'object' ? (input.text || '') : (input || '');
    const compact = text.replace(/\s/g, '');
    const score = BUTCHER_KEYWORDS.filter((k) => compact.includes(k)).length;
    return score >= 2 ? 'butcher' : 'esl';
  }

  /**
   * 쇼핑리스트 자동추가용: 후보들 중 가장 그럴듯한 값 하나씩만 뽑아서 반환한다.
   * @param {string|Object} input - OCR 원본 텍스트 또는 {text, lines} 구조화 결과
   * @returns {{ name: string|null, price: number|null, amount: number|null, unit: string|null, complete: boolean, labelHint: string }}
   */
  function autoExtract(input) {
    const priceCandidates = extractPriceCandidates(input);
    const amountCandidates = extractAmountCandidates(input);
    const price = priceCandidates.length > 0 ? priceCandidates[0].value : null; // 이미 우선순위대로 정렬됨
    const amountInfo = amountCandidates.length > 0 ? amountCandidates[0] : null;
    const name = guessProductName(input);
    return {
      name,
      price,
      amount: amountInfo ? amountInfo.value : null,
      unit: amountInfo ? amountInfo.unit : null,
      complete: price != null && amountInfo != null, // 이름은 못 찾아도 계산 자체는 가능
      labelHint: detectLabelHint(input),
      category: guessCategory(name),
    };
  }

  /**
   * OCR 결과 전체를 분석해서 가격/용량 후보를 한번에 반환한다.
   */
  function analyze(input) {
    return {
      priceCandidates: extractPriceCandidates(input),
      amountCandidates: extractAmountCandidates(input),
      labelHint: detectLabelHint(input),
    };
  }

  return { analyze, autoExtract, extractPriceCandidates, extractAmountCandidates, guessProductName, detectLabelHint, guessCategory, CATEGORIES };
})();

// ocr.js
// Tesseract.js가 반환한 텍스트에서 "가격 후보"와 "용량 후보"를 뽑아내는 순수 함수 모음.
// DOM이나 Tesseract 자체를 몰라도 되게 분리 — 나중에 다른 OCR 엔진으로 바꿔도 이 파일만 교체하면 됨.

const OcrParser = (() => {

  const WEIGHT_VOLUME_UNITS = ['kg', 'g', 'lb', 'oz', 'ml', 'l'];

  /**
   * 통화 표시가 붙은 숫자를 가격 후보로 추출한다.
   * 우선순위: "원"/₩ 표시가 붙은 것 우선, 없으면 3자리 이상 숫자를 fallback으로 사용.
   *
   * [수정] 콤마(,) 자리가 OCR에서 공백으로 잘못 읽히는 경우가 실제로 자주 있다
   * (예: "3,580" -> "3 580"). 원래는 콤마만 구분자로 인정해서 이런 경우 앞자리(3)가
   * 통째로 버려지고 뒷자리(580)만 가격으로 잘못 뽑혔다. 공백도 같은 자리의 구분자로
   * 허용하도록 고쳤다. 단, 줄바꿈(\n)까지 구분자로 인정하면 서로 무관한 숫자를
   * 잘못 이어붙일 위험이 있어 일반 공백(스페이스)만 허용한다(줄바꿈은 \s에 포함되므로 제외).
   */
  function extractPriceCandidates(text) {
    const found = new Map(); // value -> raw

    // 콤마 또는 공백으로 3자리씩 묶인 숫자는 자릿수 제한 없음(정상적인 가격 표기 방식이라 안전).
    // 구분자 없는 숫자는 3~6자리까지만 허용 — 장보기 가격은 보통 이 범위(최대 99만원대)라
    // 바코드처럼 7자리 이상 길게 이어지는 숫자가 "가격"으로 오인식되는 것을 막는다.
    const markedRe = /(?:₩\s?)?(\d{1,3}(?:[, ]\d{3})+|(?<!\d)\d{3,6}(?!\d))\s?원?/g;
    let m;
    while ((m = markedRe.exec(text)) !== null) {
      const raw = m[0].trim();
      const value = parseInt(m[1].replace(/[, ]/g, ''), 10);
      if (!isNaN(value) && value > 0) {
        found.set(value, raw);
      }
    }

    return Array.from(found.entries())
      .map(([value, raw]) => ({ value, raw }))
      .sort((a, b) => b.value - a.value) // 큰 금액(보통 정가)이 먼저 오도록 정렬
      .slice(0, 6); // 후보가 너무 많으면 UI가 지저분해지므로 상위 6개까지만
  }

  /**
   * 숫자+단위(g, kg, ml, l, lb, oz) 조합을 용량 후보로 추출한다.
   */
  function extractAmountCandidates(text) {
    const found = new Map(); // key(value+unit) -> {value, unit, raw}

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
   * (ESL 라벨은 보통 상품명이 한 줄, 가격/용량은 숫자 위주라 이 방식이 실사용에서 잘 맞는다)
   */
  function guessProductName(text) {
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
   * 쇼핑리스트 자동추가용: 후보들 중 가장 그럴듯한 값 하나씩만 뽑아서 반환한다.
   * (기존 analyze()는 후보 목록을 반환해서 사용자가 직접 고르게 했지만,
   *  자동추가 흐름에서는 사람이 고를 시간이 없으므로 "가장 그럴듯한 것 하나"를 바로 확정한다)
   * @returns {{ name: string|null, price: number|null, amount: number|null, unit: string|null, complete: boolean }}
   */
  function autoExtract(text) {
    const priceCandidates = extractPriceCandidates(text);
    const amountCandidates = extractAmountCandidates(text);
    const price = priceCandidates.length > 0 ? priceCandidates[0].value : null; // 이미 큰 금액순 정렬됨
    const amountInfo = amountCandidates.length > 0 ? amountCandidates[0] : null;
    const name = guessProductName(text);
    return {
      name,
      price,
      amount: amountInfo ? amountInfo.value : null,
      unit: amountInfo ? amountInfo.unit : null,
      complete: price != null && amountInfo != null, // 이름은 못 찾아도 계산 자체는 가능
    };
  }

  /**
   * OCR 텍스트 전체를 분석해서 가격/용량 후보를 한번에 반환한다.
   */
  function analyze(text) {
    return {
      priceCandidates: extractPriceCandidates(text),
      amountCandidates: extractAmountCandidates(text),
    };
  }

  return { analyze, autoExtract, extractPriceCandidates, extractAmountCandidates, guessProductName };
})();

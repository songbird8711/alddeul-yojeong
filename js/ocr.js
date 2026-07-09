// ocr.js
// Tesseract.js가 반환한 텍스트에서 "가격 후보"와 "용량 후보"를 뽑아내는 순수 함수 모음.
// DOM이나 Tesseract 자체를 몰라도 되게 분리 — 나중에 다른 OCR 엔진으로 바꿔도 이 파일만 교체하면 됨.

const OcrParser = (() => {

  const WEIGHT_VOLUME_UNITS = ['kg', 'g', 'lb', 'oz', 'ml', 'l'];

  /**
   * 통화 표시가 붙은 숫자를 가격 후보로 추출한다.
   * 우선순위: "원"/₩ 표시가 붙은 것 우선, 없으면 3자리 이상 숫자를 fallback으로 사용.
   */
  function extractPriceCandidates(text) {
    const found = new Map(); // value -> raw

    const markedRe = /(?:₩\s?)?(\d{1,3}(?:,\d{3})+|\d{3,})\s?원?/g;
    let m;
    while ((m = markedRe.exec(text)) !== null) {
      const raw = m[0].trim();
      const value = parseInt(m[1].replace(/,/g, ''), 10);
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
   * OCR 텍스트 전체를 분석해서 가격/용량 후보를 한번에 반환한다.
   */
  function analyze(text) {
    return {
      priceCandidates: extractPriceCandidates(text),
      amountCandidates: extractAmountCandidates(text),
    };
  }

  return { analyze, extractPriceCandidates, extractAmountCandidates };
})();

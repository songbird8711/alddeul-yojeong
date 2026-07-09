// calculator.js
// 순수 계산 함수만 모아둔 모듈. DOM을 전혀 건드리지 않는다.

const Calculator = (() => {

  // 1단위(unit) 당 그램 수 — 물리 상수라 오프라인에서도 정확함 (환율과 다름)
  const WEIGHT_TO_GRAM = {
    g: 1,
    kg: 1000,
    oz: 28.3495,
    lb: 453.592,
  };

  const SUPPORTED_CURRENCIES = ['KRW', 'USD', 'CAD', 'GBP', 'EUR', 'JPY'];

  function getCategory(unit) {
    if (Object.prototype.hasOwnProperty.call(WEIGHT_TO_GRAM, unit)) return 'weight';
    if (unit === 'ml') return 'volume';
    if (unit === 'ea') return 'count';
    throw new Error('알 수 없는 단위입니다.');
  }

  /**
   * 상품 하나의 실질 단가를 계산한다. (KRW 기준으로 통일해서 반환)
   * @param {Object} input
   * @param {number} input.price   정가 (해당 통화 기준)
   * @param {number} input.amount  1개 기준 용량/수량
   * @param {string} input.unit    'g'|'kg'|'oz'|'lb'|'ml'|'ea'
   * @param {string} input.currency 'KRW'|'USD'|'CAD'|'GBP'|'EUR'|'JPY'
   * @param {number} input.exchangeRate 1 외화 = ? 원 (KRW면 무시됨)
   * @param {string} input.discountType 'none'|'bundle'|'percent'|'flat'|'card'
   * @param {Object} input.discountParams
   * @param {boolean} input.useCard
   */
  function calcUnitPrice(input) {
    const {
      price, amount, unit,
      currency = 'KRW',
      exchangeRate,
      discountType, discountParams = {}, useCard = true,
    } = input;

    if (!isFinite(price) || price <= 0) throw new Error('가격을 올바르게 입력해주세요.');
    if (!isFinite(amount) || amount <= 0) throw new Error('용량/수량을 올바르게 입력해주세요.');
    if (!SUPPORTED_CURRENCIES.includes(currency)) throw new Error('지원하지 않는 통화입니다.');

    let payAmount = price;
    let totalQty = amount;
    let note = '';

    switch (discountType) {
      case 'none':
        break;

      case 'bundle': {
        const buy = Number(discountParams.buy) || 1;
        const free = Number(discountParams.free) || 0;
        if (buy <= 0) throw new Error('구매 개수는 1개 이상이어야 합니다.');
        payAmount = price * buy;
        totalQty = amount * (buy + free);
        note = `${buy}개 구매 시 ${free}개 무료`;
        break;
      }

      case 'percent': {
        const rate = Number(discountParams.rate) || 0;
        if (rate < 0 || rate >= 100) throw new Error('할인율은 0~99% 사이여야 합니다.');
        payAmount = price * (1 - rate / 100);
        note = `${rate}% 할인 적용`;
        break;
      }

      case 'flat': {
        const off = Number(discountParams.amount) || 0;
        payAmount = Math.max(price - off, 0);
        note = `${off.toLocaleString()} ${currency} 정액 할인`;
        break;
      }

      case 'card': {
        const off = Number(discountParams.amount) || 0;
        if (useCard) {
          payAmount = Math.max(price - off, 0);
          note = `카드 결제 조건부 할인 적용 (-${off.toLocaleString()} ${currency})`;
        } else {
          note = `카드 미사용 (정가 기준)`;
        }
        break;
      }

      default:
        throw new Error('알 수 없는 할인 유형입니다.');
    }

    // 환율 처리 (KRW 고정, 물리 상수 아님 → 사용자가 직접 입력한 값 사용)
    let rate = 1;
    if (currency !== 'KRW') {
      rate = Number(exchangeRate);
      if (!isFinite(rate) || rate <= 0) {
        throw new Error('환율을 올바르게 입력해주세요. (예: 1USD = 1350)');
      }
    }
    const payAmountKRW = payAmount * rate;

    // 카테고리별 표준 단위로 환산 (무게: 100g당 / 부피: 100ml당 / 개수: 1개당)
    // 단, '개' 단위인데 1개당 무게(weightPerUnit)가 주어지면 -> 정확한 무게로 환산해서 비교 가능하게 함
    // (밀도 가정 같은 근사치가 아니라 "개수 x 개당무게 = 총 무게"라는 정확한 계산)
    let category = getCategory(unit);
    let baseQty, unitLabel, divisor;
    const weightPerUnit = Number(input.weightPerUnit);
    const hasWeightPerUnit = category === 'count' && isFinite(weightPerUnit) && weightPerUnit > 0;

    if (hasWeightPerUnit) {
      category = 'weight';
      baseQty = totalQty * weightPerUnit;
      unitLabel = '100g당';
      divisor = 100;
    } else if (category === 'weight') {
      baseQty = totalQty * WEIGHT_TO_GRAM[unit];
      unitLabel = '100g당';
      divisor = 100;
    } else if (category === 'volume') {
      baseQty = totalQty; // ml만 지원
      unitLabel = '100ml당';
      divisor = 100;
    } else {
      baseQty = totalQty;
      unitLabel = '1개당';
      divisor = 1;
    }

    const unitPriceKRW = (payAmountKRW / baseQty) * divisor;

    return {
      payAmount: round2(payAmount),
      payAmountKRW: round2(payAmountKRW),
      currency,
      exchangeRate: rate,
      totalQty: round2(totalQty),
      unit,
      category,
      unitPriceKRW: round2(unitPriceKRW),
      unitLabel,
      note: hasWeightPerUnit
        ? (note ? `${note} · 1개당 ${weightPerUnit}g 기준 환산` : `1개당 ${weightPerUnit}g 기준 환산`)
        : note,
    };
  }

  /**
   * 두 상품의 결과를 비교한다.
   * - 같은 카테고리(무게-무게, 부피-부피, 개수-개수): 그대로 정확히 비교
   * - 무게 vs 부피: 물 기준(밀도=1, 100g≈100ml)으로 근사 비교. approximate:true로 표시해 UI에서 경고 문구를 띄운다.
   * - 개수 vs 무게/부피: 개당 무게 정보가 없어 물리적으로 등치 불가 → 비교 불가 유지
   */
  function compare(resultA, resultB) {
    const sameCategory = resultA.category === resultB.category;
    const isWeightVolumePair =
      (resultA.category === 'weight' && resultB.category === 'volume') ||
      (resultA.category === 'volume' && resultB.category === 'weight');

    if (!sameCategory && !isWeightVolumePair) {
      return {
        comparable: false,
        reason: '개수(개) 단위는 무게/부피와 물리적으로 등치할 수 없어 비교가 불가능해요. 무게나 부피 단위로 다시 입력해주세요.',
      };
    }

    const diff = Math.abs(resultA.unitPriceKRW - resultB.unitPriceKRW);
    const cheaper = resultA.unitPriceKRW <= resultB.unitPriceKRW ? 'A' : 'B';
    const higher = cheaper === 'A' ? resultB.unitPriceKRW : resultA.unitPriceKRW;
    const savingRate = higher > 0 ? (diff / higher) * 100 : 0;

    return {
      comparable: true,
      cheaper,
      diff: round2(diff),
      savingRate: round1(savingRate),
      approximate: !sameCategory, // 무게-부피 근사 비교인 경우 true
    };
  }

  function round2(n) {
    return Math.round(n * 100) / 100;
  }
  function round1(n) {
    return Math.round(n * 10) / 10;
  }

  return { calcUnitPrice, compare, WEIGHT_TO_GRAM, SUPPORTED_CURRENCIES, getCategory };
})();

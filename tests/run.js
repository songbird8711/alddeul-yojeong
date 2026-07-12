// tests/run.js
// 알뜰요정 핵심 로직 테스트 스위트.
// 실행법: cd tests && npm install && npm test
//
// 브라우저 전용 API(localStorage 등)를 쓰는 storage.js를 테스트하기 위해 jsdom으로
// 가짜 브라우저 환경을 띄운 뒤, 실제 소스 파일(js/*.js)을 그대로 읽어서 실행한다.
// 즉 "테스트용으로 복사한 로직"이 아니라 실제 배포되는 코드 그 자체를 검증한다.

const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

let failCount = 0;
let passCount = 0;

function assert(condition, message) {
  if (!condition) {
    failCount += 1;
    console.error('  ✗ FAIL:', message);
  } else {
    passCount += 1;
    console.log('  ✓', message);
  }
}

function section(title) {
  console.log('\n=== ' + title + ' ===');
}

function loadEnv() {
  const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { url: 'https://example.com' });
  global.window = dom.window;
  global.localStorage = dom.window.localStorage;

  const storageCode = fs.readFileSync(path.join(ROOT, 'js/storage.js'), 'utf8');
  const ocrCode = fs.readFileSync(path.join(ROOT, 'js/ocr.js'), 'utf8');
  const calcCode = fs.readFileSync(path.join(ROOT, 'js/calculator.js'), 'utf8');

  dom.window.eval(storageCode + ocrCode + calcCode + `
    window.HistoryStore = HistoryStore;
    window.ExchangeRateStore = ExchangeRateStore;
    window.ShoppingListStore = ShoppingListStore;
    window.MonthlyLogStore = MonthlyLogStore;
    window.BudgetStore = BudgetStore;
    window.OcrParser = OcrParser;
    window.Calculator = Calculator;
  `);

  return dom.window;
}

function krw(n) {
  return Math.round(n).toLocaleString();
}

// ---------------------------------------------------------------------------

function testHistoryStore(win) {
  section('HistoryStore (30일 보관 + 이번 주 절약액)');
  const { HistoryStore } = win;

  function daysAgoISO(days) {
    return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  win.localStorage.setItem('alddeul-yojeong:grocery-history', JSON.stringify([
    { id: 'old1', savedAt: daysAgoISO(40), cmp: { comparable: true, diff: 1000, cheaper: 'A' } },
    { id: 'mid1', savedAt: daysAgoISO(20), cmp: { comparable: true, diff: 500, cheaper: 'B' } },
    { id: 'new1', savedAt: daysAgoISO(2), cmp: { comparable: true, diff: 300, cheaper: 'A' } },
    { id: 'new2', savedAt: daysAgoISO(5), cmp: { comparable: true, diff: 700, cheaper: 'B' } },
  ]));

  const all = HistoryStore.getAll();
  assert(all.length === 3, '30일 지난 기록(old1)은 자동으로 제거됨');
  assert(!all.find((i) => i.id === 'old1'), 'old1이 실제로 사라졌는지 확인');

  const weekly = HistoryStore.getWeeklySavings();
  assert(weekly.total === 1000, `이번 주(7일) 절약액 합계 = 1000원 (실제: ${weekly.total})`);
  assert(weekly.count === 2, `이번 주 집계 건수 = 2건 (실제: ${weekly.count})`);
}

function testExchangeRateStore(win) {
  section('ExchangeRateStore (일 1회 캐싱)');
  const { ExchangeRateStore } = win;

  assert(ExchangeRateStore.get() === null, '초기 상태에는 캐시 없음');
  ExchangeRateStore.set({ USD: 1350 });
  assert(ExchangeRateStore.isFresh(ExchangeRateStore.get()) === true, '방금 저장한 캐시는 fresh');

  const stale = { ...ExchangeRateStore.get(), date: '2000-01-01' };
  win.localStorage.setItem('alddeul-yojeong:exchange-rate-cache', JSON.stringify(stale));
  assert(ExchangeRateStore.isFresh(ExchangeRateStore.get()) === false, '날짜 지난 캐시는 fresh 아님(재조회 트리거)');
}

function testOcrParser(win) {
  section('OcrParser (카테고리 분류 + 가격/용량 추출)');
  const { OcrParser } = win;

  assert(OcrParser.guessCategory('삼겹살') === '육류', '삼겹살 -> 육류');
  assert(OcrParser.guessCategory('사과') === '과일', '사과 -> 과일');
  assert(OcrParser.guessCategory('새우깡') === '과자·음료', '새우깡 -> 과자·음료 (새우 때문에 수산으로 오분류되면 안 됨)');
  assert(OcrParser.guessCategory('국내산 생새우 200g') === '수산', '진짜 새우는 여전히 수산으로 분류');
  assert(OcrParser.guessCategory('고기') === '육류', '계획항목 "고기" -> 육류');

  const r1 = OcrParser.autoExtract('한우 불고기\n500g\n18,900원');
  assert(r1.name === '한우 불고기' && r1.price === 18900 && r1.amount === 500 && r1.unit === 'g', 'ESL 텍스트 기본 추출 확인');
  assert(r1.category === '육류', 'autoExtract 결과에 카테고리 포함 확인');

  const r2 = OcrParser.autoExtract('국산 돼지고기 삼겹살\n원산지 국내산\n800g\n14,900원\n1122334455667');
  assert(r2.price === 14900, `바코드(13자리)가 가격으로 오인식되지 않는지 확인 (실제: ${r2.price})`);

  const r3 = OcrParser.autoExtract('흐릿해서 읽기 어려움');
  assert(r3.complete === false, '인식 실패 시 complete=false');
}

function testShoppingListAndMonthly(win) {
  section('ShoppingListStore + MonthlyLogStore + BudgetStore (통합 시나리오)');
  const { ShoppingListStore, MonthlyLogStore, BudgetStore, OcrParser, Calculator } = win;

  // 실제 confirmAddBtn 핸들러와 동일한 결정 로직 재현
  function simulateConfirmAdd(name, price, amount, unit) {
    const calc = Calculator.calcUnitPrice({ price, amount, unit, currency: 'KRW', discountType: 'none' });
    const category = OcrParser.guessCategory(name);
    const patch = {
      name, price, amount, unit,
      unitLabel: calc.unitLabel, unitPriceKRW: calc.unitPriceKRW, priceKRW: price,
      category, checked: true, planned: false, onlineStatus: 'loading',
    };
    const nameMatch = ShoppingListStore.findUncheckedNameMatch(name);
    if (nameMatch) return { record: ShoppingListStore.update(nameMatch.id, patch), matchType: 'name' };
    const categoryMatch = ShoppingListStore.findUncheckedCategoryMatch(category);
    if (categoryMatch) return { record: 'PENDING_CONFIRMATION', matchType: 'category', candidate: categoryMatch, patch };
    return { record: ShoppingListStore.add(patch), matchType: 'none' };
  }

  // 1) 계획 항목 3개
  ShoppingListStore.addPlanned('고기', OcrParser.guessCategory('고기'));
  ShoppingListStore.addPlanned('과자', OcrParser.guessCategory('과자'));
  ShoppingListStore.addPlanned('휴지', OcrParser.guessCategory('휴지'));
  assert(ShoppingListStore.getAll().length === 3 && ShoppingListStore.getAll().every((i) => !i.checked),
    '계획 항목 3개 전부 미체크 상태로 시작');

  // 2) "한우 목살" 스캔 -> 이름 안 겹침 -> 카테고리 매칭이라 "확인 필요" 상태로 보류되어야 함 (바로 확정되면 안 됨!)
  const attempt1 = simulateConfirmAdd('한우 목살', 15000, 400, 'g');
  assert(attempt1.matchType === 'category' && attempt1.record === 'PENDING_CONFIRMATION',
    '이름 안 겹치는 카테고리매칭은 바로 확정되지 않고 사용자 확인 대기 상태여야 함');

  // 사용자가 "예, 맞아요"를 눌렀다고 가정하고 확정
  const confirmed1 = ShoppingListStore.update(attempt1.candidate.id, attempt1.patch);
  assert(confirmed1.checked === true && confirmed1.name === '한우 목살', '확인 후 정상적으로 계획항목이 채워짐');

  // 3) "서울우유 900ml"는 계획에 전혀 없음 -> 이름/카테고리 매칭 모두 없어야 하고, 새 항목으로 즉시 추가
  const attempt2 = simulateConfirmAdd('서울우유 900ml', 2480, 900, 'ml');
  assert(attempt2.matchType === 'none' && attempt2.record && attempt2.record.checked === true,
    '계획에 없는 상품은 매칭 확인 없이 바로 새 항목으로 추가됨');

  const all = ShoppingListStore.getAll();
  assert(all.length === 4, '전체 개수 확인: 계획3 + 신규1 = 4개 (오매칭으로 항목이 사라지지 않았는지 확인)');

  // 4) 정렬: 미체크(휴지, 과자) 위 / 체크(목살, 우유) 아래
  const sorted = [...all].sort((a, b) => (a.checked === b.checked ? 0 : a.checked ? 1 : -1));
  assert(sorted[0].checked === false && sorted[sorted.length - 1].checked === true, '정렬: 미체크 항목이 앞, 체크 항목이 뒤');

  // 5) 오늘의 영수증 집계 (체크된 것 중 "오늘" 담긴 것만 - addedAt이 방금 추가된 거라 전부 오늘임)
  const todayStr = new Date().toISOString().slice(0, 10);
  const todayChecked = all.filter((i) => i.checked && i.addedAt.slice(0, 10) === todayStr);
  const todayTotal = todayChecked.reduce((s, i) => s + i.priceKRW, 0);
  assert(todayTotal === 15000 + 2480, `오늘 총액 확인 (실제: ${todayTotal})`);

  // 6) "장보기 완료": 체크된 것만 월간기록 보관 + 제거, 미체크(휴지,과자)는 남음
  const checkedItems = ShoppingListStore.removeChecked();
  MonthlyLogStore.archive(checkedItems);
  const remaining = ShoppingListStore.getAll();
  assert(remaining.length === 2 && remaining.every((i) => !i.checked),
    '장보기 완료 후 미체크 계획항목(휴지,과자)만 남는지 확인');

  // 7) 월간 총액/카테고리 집계 + 예산 초과 시나리오
  const monthKey = MonthlyLogStore.currentMonthKey();
  const monthlyTotal = MonthlyLogStore.getTotalForMonth(monthKey);
  assert(monthlyTotal === 15000 + 2480, `이번 달 총액 확인 (실제: ${monthlyTotal})`);

  const breakdown = MonthlyLogStore.getCategoryBreakdownForMonth(monthKey);
  assert(breakdown['육류'] === 15000, '월간 카테고리 집계(육류) 확인');

  BudgetStore.set(10000); // 일부러 낮게 잡아서 초과 재현
  const budget = BudgetStore.get();
  assert(budget - monthlyTotal < 0, `예산 초과 상황 재현 (초과액 ${krw(monthlyTotal - budget)}원)`);

  // 8) "전체 비우기"는 계획항목까지 다 지워야 함
  ShoppingListStore.clear();
  assert(ShoppingListStore.getAll().length === 0, '전체 비우기 후 완전히 빈 상태 확인');
}

function testCalculator(win) {
  section('Calculator (기본 단가 계산 정합성)');
  const { Calculator } = win;

  const r = Calculator.calcUnitPrice({ price: 18900, amount: 500, unit: 'g', currency: 'KRW', discountType: 'none' });
  assert(r.unitLabel === '100g당' && r.unitPriceKRW === 3780, `500g 18,900원 -> 100g당 3,780원 (실제: ${r.unitLabel} ${r.unitPriceKRW}원)`);
}

// ---------------------------------------------------------------------------

function testHiddenClassNeverLoses(win) {
  section('CSS: .hidden 클래스가 다른 클래스에 밀리지 않는지 (실제 버그 재발 방지)');
  // 실제로 겪었던 버그: .hidden { display:none }이 CSS 파일 앞쪽에 있고,
  // .confirm-add-overlay { display:flex }가 뒤에 있어서, "hidden"을 줘도 안 숨겨졌었다.
  // 이제는 .hidden에 !important가 붙어있어야 어떤 순서로 클래스가 추가되든 항상 이긴다.
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const hiddenRuleMatch = css.match(/\.hidden\s*\{[^}]*\}/);
  assert(!!hiddenRuleMatch, '.hidden 규칙이 style.css에 존재하는지 확인');
  if (hiddenRuleMatch) {
    assert(/display\s*:\s*none\s*!important/.test(hiddenRuleMatch[0]),
      '.hidden { display: none !important; } 로 되어있는지 확인 (다른 클래스에 밀리지 않도록)');
  }
}

function main() {
  const win = loadEnv();
  testHistoryStore(win);
  testExchangeRateStore(win);
  testOcrParser(win);
  testCalculator(win);
  testShoppingListAndMonthly(win);
  testHiddenClassNeverLoses(win);

  console.log('\n' + '='.repeat(40));
  console.log(`총 ${passCount + failCount}개 중 ${passCount}개 통과, ${failCount}개 실패`);
  if (failCount > 0) {
    console.log('❌ 실패한 테스트가 있습니다.');
    process.exitCode = 1;
  } else {
    console.log('✅ 전체 통과');
  }
}

main();

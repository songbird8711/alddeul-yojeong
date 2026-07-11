// app.js
// DOM 이벤트 처리 전담. 실제 계산은 calculator.js, 저장은 storage.js에 위임한다.

document.addEventListener('DOMContentLoaded', () => {
  const products = ['A', 'B'];

  const els = {};
  products.forEach((p) => {
    els[p] = {
      price: document.getElementById(`price${p}`),
      name: document.getElementById(`name${p}`),
      amount: document.getElementById(`amount${p}`),
      unit: document.getElementById(`unit${p}`),
      weightPerUnitWrap: document.getElementById(`weightPerUnitWrap${p}`),
      weightPerUnit: document.getElementById(`weightPerUnit${p}`),
      currency: document.getElementById(`currency${p}`),
      exchangeRateWrap: document.getElementById(`exchangeRateWrap${p}`),
      exchangeRate: document.getElementById(`exchangeRate${p}`),
      exrateHint: document.getElementById(`exrateHint${p}`),
      discountType: document.getElementById(`discountType${p}`),
      discountParams: document.getElementById(`discountParams${p}`),
      live: document.getElementById(`live${p}`),
      photoBtn: document.getElementById(`photoBtn${p}`),
      photoInput: document.getElementById(`photoInput${p}`),
      photoPreviewWrap: document.getElementById(`photoPreviewWrap${p}`),
      photoPreview: document.getElementById(`photoPreview${p}`),
      ocrStatus: document.getElementById(`ocrStatus${p}`),
      ocrCandidates: document.getElementById(`ocrCandidates${p}`),
      advancedToggle: document.getElementById(`advancedToggle${p}`),
      advancedPanel: document.getElementById(`advancedPanel${p}`),
      discountMoreBtn: document.getElementById(`discountMoreBtn${p}`),
    };
  });

  const compareBtn = document.getElementById('compareBtn');
  const resultSection = document.getElementById('result');
  const historyList = document.getElementById('historyList');

  // Frankfurter API가 지원하지 않아 환율 자동 조회가 불가능한 통화 (직접 입력 필요)
  const EXRATE_AUTO_UNSUPPORTED = ['VND', 'TWD'];

  const CURRENCY_SYMBOL = {
    KRW: '₩',
    JPY: '¥',
    VND: '₫',
    THB: '฿',
    CNY: '元',
    TWD: 'NT$',
    PHP: '₱',
    IDR: 'Rp',
    USD: '$',
    SGD: 'S$',
    MYR: 'RM',
    CAD: 'C$',
    GBP: '£',
    EUR: '€',
  };

  // 기호만으로는 어느 나라 통화인지 헷갈릴 수 있어(예: JPY/CNY 둘 다 ¥ 계열) 표시할 때 국가명을 같이 붙인다
  const CURRENCY_LABEL = {
    KRW: '한국',
    JPY: '일본',
    VND: '베트남',
    THB: '태국',
    CNY: '중국',
    TWD: '대만',
    PHP: '필리핀',
    IDR: '인도네시아',
    USD: '미국',
    SGD: '싱가포르',
    MYR: '말레이시아',
    CAD: '캐나다',
    GBP: '영국',
    EUR: '유럽',
  };

  // 한국 원화는 소수점 없이 표시 (반올림)
  function krw(n) {
    return Math.round(n).toLocaleString();
  }

  // ---- 통화가 KRW가 아니면 환율 입력칸 노출 ----
  function toggleExchangeRate(p) {
    const isKRW = els[p].currency.value === 'KRW';
    els[p].exchangeRateWrap.classList.toggle('hidden', isKRW);
    renderExrateHint(p);
  }

  // ---- 환율이 자동으로 채워졌는지/오프라인 캐시인지 안내 문구 표시 ----
  function renderExrateHint(p) {
    if (!els[p].exrateHint) return;
    const currency = els[p].currency.value;
    const isKRW = currency === 'KRW';
    if (isKRW) {
      els[p].exrateHint.textContent = '';
      els[p].exrateHint.className = 'exrate-hint';
      return;
    }
    if (EXRATE_AUTO_UNSUPPORTED.includes(currency)) {
      els[p].exrateHint.textContent = '이 통화는 자동 환율 조회를 지원하지 않아요. 환율을 직접 입력해주세요.';
      els[p].exrateHint.className = 'exrate-hint manual';
      return;
    }
    const cache = ExchangeRateStore.get();
    const hasRate = cache && cache.rates && cache.rates[currency] != null;
    if (hasRate && ExchangeRateStore.isFresh(cache)) {
      els[p].exrateHint.textContent = '오늘 환율 자동 적용됨 (필요하면 직접 수정하세요)';
      els[p].exrateHint.className = 'exrate-hint auto';
    } else if (hasRate) {
      els[p].exrateHint.textContent = `⚠ ${cache.date} 기준 환율이에요 (오프라인이라 갱신 못함, 직접 수정 가능)`;
      els[p].exrateHint.className = 'exrate-hint stale';
    } else {
      els[p].exrateHint.textContent = '';
      els[p].exrateHint.className = 'exrate-hint';
    }
  }

  // ---- 단위가 '개'일 때만 1개당 무게 입력칸 노출 ----
  function toggleWeightPerUnit(p) {
    const isEa = els[p].unit.value === 'ea';
    els[p].weightPerUnitWrap.classList.toggle('hidden', !isEa);
  }

  // ---- 고급옵션(자세히 입력하기) 접기/펼치기 ----
  function openAdvanced(p) {
    els[p].advancedPanel.classList.remove('hidden');
    els[p].advancedToggle.setAttribute('aria-expanded', 'true');
    els[p].advancedToggle.innerHTML = '<span class="advanced-toggle-icon">▾</span> 접기';
  }
  function closeAdvanced(p) {
    els[p].advancedPanel.classList.add('hidden');
    els[p].advancedToggle.setAttribute('aria-expanded', 'false');
    els[p].advancedToggle.innerHTML = '<span class="advanced-toggle-icon">▾</span> 자세히 입력하기';
  }
  function toggleAdvanced(p) {
    const isOpen = els[p].advancedToggle.getAttribute('aria-expanded') === 'true';
    if (isOpen) closeAdvanced(p);
    else openAdvanced(p);
  }
  // 복원된 값 중에 "고급옵션" 항목(상품명/통화/할인/1개당무게)이 실제로 채워져 있으면
  // 패널이 접힌 채로 있어서 사용자가 값이 반영된 걸 못 보고 지나치는 일이 없도록 자동으로 펼친다.
  function maybeExpandAdvanced(p) {
    const hasAdvancedValue =
      (els[p].name.value && els[p].name.value.trim() !== '') ||
      els[p].currency.value !== 'KRW' ||
      els[p].discountType.value !== 'none' ||
      els[p].unit.value === 'ea';
    if (hasAdvancedValue) openAdvanced(p);
  }

  // ---- 할인 "더보기" — 기본 노출 3종(없음/1+1/%) 외에 정액할인/카드할인 옵션을 뒤늦게 추가 ----
  function ensureDiscountMoreOptions(p) {
    const select = els[p].discountType;
    if (select.querySelector('option[value="flat"]')) return; // 이미 추가된 경우 중복 방지
    select.insertAdjacentHTML(
      'beforeend',
      `<option value="flat">정액 할인 (원)</option><option value="card">카드 조건부 할인</option>`
    );
    if (els[p].discountMoreBtn) els[p].discountMoreBtn.classList.add('hidden');
  }

  // ---- 할인 유형별 추가 입력 필드 렌더링 ----
  function renderDiscountParams(p) {
    const type = els[p].discountType.value;
    const box = els[p].discountParams;
    const currency = els[p].currency.value;
    box.innerHTML = '';

    const field = (id, label, placeholder, value = '') => `
      <label class="mini-field">
        ${label}
        <input type="number" id="${id}" placeholder="${placeholder}" value="${value}" inputmode="decimal">
      </label>`;

    if (type === 'bundle') {
      box.innerHTML = field(`buy${p}`, '구매 개수', '예: 1') + field(`free${p}`, '무료 개수', '예: 1');
    } else if (type === 'percent') {
      box.innerHTML = field(`rate${p}`, '할인율(%)', '예: 10');
    } else if (type === 'flat') {
      box.innerHTML = field(`flatAmount${p}`, `할인 금액(${currency})`, '예: 2000');
    } else if (type === 'card') {
      box.innerHTML =
        field(`cardAmount${p}`, `카드 할인 금액(${currency})`, '예: 5000') +
        `<label class="mini-field checkbox">
          <input type="checkbox" id="useCard${p}" checked> 카드 사용 (체크 해제 시 정가로 계산)
        </label>`;
    }

    box.querySelectorAll('input').forEach((inp) => inp.addEventListener('input', () => {
      liveUpdate(p);
      saveLastDiscountPref(p);
    }));
  }

  function readInput(p) {
    const type = els[p].discountType.value;
    const discountParams = {};
    let useCard = true;

    if (type === 'bundle') {
      discountParams.buy = document.getElementById(`buy${p}`)?.value;
      discountParams.free = document.getElementById(`free${p}`)?.value;
    } else if (type === 'percent') {
      discountParams.rate = document.getElementById(`rate${p}`)?.value;
    } else if (type === 'flat') {
      discountParams.amount = document.getElementById(`flatAmount${p}`)?.value;
    } else if (type === 'card') {
      discountParams.amount = document.getElementById(`cardAmount${p}`)?.value;
      useCard = document.getElementById(`useCard${p}`)?.checked ?? true;
    }

    return {
      price: parseFloat(els[p].price.value),
      name: (els[p].name.value || '').trim(),
      amount: parseFloat(els[p].amount.value),
      unit: els[p].unit.value,
      weightPerUnit: parseFloat(els[p].weightPerUnit.value),
      currency: els[p].currency.value,
      exchangeRate: parseFloat(els[p].exchangeRate.value),
      discountType: type,
      discountParams,
      useCard,
    };
  }

  function numOrEmpty(v) {
    return Number.isFinite(v) ? v : '';
  }

  function setVal(id, v) {
    const el = document.getElementById(id);
    if (el && v !== undefined && v !== null && v !== '') el.value = v;
  }

  // 할인 유형별 세부 입력값(버튼/개수/할인율 등)을 채워넣는다. applyState와 초기 기본값 적용 둘 다에서 재사용.
  function fillDiscountParamInputs(p, type, dp = {}, useCard) {
    if (type === 'bundle') {
      setVal(`buy${p}`, dp.buy);
      setVal(`free${p}`, dp.free);
    } else if (type === 'percent') {
      setVal(`rate${p}`, dp.rate);
    } else if (type === 'flat') {
      setVal(`flatAmount${p}`, dp.amount);
    } else if (type === 'card') {
      setVal(`cardAmount${p}`, dp.amount);
      const cb = document.getElementById(`useCard${p}`);
      if (cb) cb.checked = useCard !== false;
    }
  }

  // input 형태의 상태 객체(readInput과 같은 모양)를 상품 카드 A/B에 그대로 채워넣는다.
  // 히스토리 복원, A/B 바꾸기(swap), 임시저장 복원에서 모두 이 함수 하나로 처리한다.
  function applyState(p, input) {
    if (!input) return;
    els[p].name.value = input.name || '';
    els[p].price.value = numOrEmpty(input.price);
    els[p].amount.value = numOrEmpty(input.amount);
    els[p].unit.value = input.unit || 'g';
    els[p].currency.value = input.currency || 'KRW';
    if (input.discountType === 'flat' || input.discountType === 'card') ensureDiscountMoreOptions(p);
    els[p].discountType.value = input.discountType || 'none';

    toggleExchangeRate(p);
    toggleWeightPerUnit(p);
    renderDiscountParams(p);

    els[p].weightPerUnit.value = numOrEmpty(input.weightPerUnit);
    els[p].exchangeRate.value = numOrEmpty(input.exchangeRate);
    fillDiscountParamInputs(p, input.discountType, input.discountParams, input.useCard);

    liveUpdate(p);
    maybeExpandAdvanced(p);
  }

  function saveLastDiscountPref(p) {
    const input = readInput(p);
    PrefsStore.update({
      lastDiscount: { type: input.discountType, params: input.discountParams, useCard: input.useCard },
    });
  }

  // ---- 실시간 단가 표시 ----
  function liveUpdate(p) {
    try {
      const input = readInput(p);
      const result = Calculator.calcUnitPrice(input);
      const sym = CURRENCY_SYMBOL[result.currency] || '';
      const label = CURRENCY_LABEL[result.currency] ? `${CURRENCY_LABEL[result.currency]} ` : '';
      let text = `${result.unitLabel} ${krw(result.unitPriceKRW)}원`;
      if (result.currency !== 'KRW') {
        text += ` (${label}${sym}${result.payAmount.toLocaleString()} × ${krw(result.exchangeRate)} = ${krw(result.payAmountKRW)}원)`;
      }
      els[p].live.textContent = text;
      els[p].live.classList.remove('live-error');
    } catch (e) {
      els[p].live.textContent = e.message || '값을 입력해주세요';
      els[p].live.classList.add('live-error');
    }
  }

  products.forEach((p) => {
    els[p].price.addEventListener('input', () => liveUpdate(p));
    els[p].amount.addEventListener('input', () => liveUpdate(p));
    els[p].unit.addEventListener('change', () => {
      toggleWeightPerUnit(p);
      liveUpdate(p);
    });
    els[p].weightPerUnit.addEventListener('input', () => liveUpdate(p));
    els[p].exchangeRate.addEventListener('input', () => {
      liveUpdate(p);
      const currency = els[p].currency.value;
      const val = parseFloat(els[p].exchangeRate.value);
      if (currency !== 'KRW' && Number.isFinite(val) && val > 0) {
        const rates = PrefsStore.get().exchangeRates || {};
        PrefsStore.update({ exchangeRates: { ...rates, [currency]: val } });
      }
    });
    els[p].currency.addEventListener('change', () => {
      toggleExchangeRate(p);
      renderDiscountParams(p);
      const currency = els[p].currency.value;
      // 버그 수정: 통화가 바뀌면 이전 통화의 환율 값은 더 이상 의미가 없으므로
      // 필드에 값이 남아있는지 여부와 상관없이 항상 새 통화 기준으로 다시 채운다
      // (기억된 값이 없으면 비워서 사용자가 직접 입력하도록 한다).
      const remembered = currency !== 'KRW' ? (PrefsStore.get().exchangeRates || {})[currency] : null;
      els[p].exchangeRate.value = remembered || '';
      liveUpdate(p);
    });
    els[p].discountType.addEventListener('change', () => {
      renderDiscountParams(p);
      saveLastDiscountPref(p);
      liveUpdate(p);
    });
    els[p].advancedToggle.addEventListener('click', () => toggleAdvanced(p));
    els[p].discountMoreBtn.addEventListener('click', () => ensureDiscountMoreOptions(p));

    toggleExchangeRate(p);
    toggleWeightPerUnit(p);
    renderDiscountParams(p);
    initPhotoOcr(p);
  });

  // ---- 초기 상태 로드: 임시저장이 있으면 복원, 없으면 마지막에 쓰던 할인설정을 기본값으로 ----
  function loadInitialState() {
    const draft = DraftStore.get();
    if (draft && (draft.inputA || draft.inputB)) {
      if (draft.inputA) applyState('A', draft.inputA);
      if (draft.inputB) applyState('B', draft.inputB);
      return;
    }
    const prefs = PrefsStore.get();
    if (prefs.lastDiscount && prefs.lastDiscount.type && prefs.lastDiscount.type !== 'none') {
      ['A', 'B'].forEach((p) => {
        if (prefs.lastDiscount.type === 'flat' || prefs.lastDiscount.type === 'card') ensureDiscountMoreOptions(p);
        els[p].discountType.value = prefs.lastDiscount.type;
        renderDiscountParams(p);
        fillDiscountParamInputs(p, prefs.lastDiscount.type, prefs.lastDiscount.params, prefs.lastDiscount.useCard);
        liveUpdate(p);
        maybeExpandAdvanced(p);
      });
    }
  }
  loadInitialState();

  // ---- 환율 자동 조회 (하루 1회, 실패 시 캐시/수동입력으로 자연스럽게 대체) ----
  // 주 소스: Frankfurter(ECB 기준, 31개 통화 지원). VND·TWD는 ECB가 다루지 않는 통화라
  // 보조 소스(open.er-api.com, 무료·키 불필요)로 별도 조회해서 합친다.
  // 두 소스는 서로 독립적으로 실패할 수 있으므로 Promise.allSettled로 한쪽이 죽어도
  // 다른 쪽 결과는 정상적으로 반영되게 한다.
  async function fetchFrankfurterRates() {
    const res = await fetch(
      'https://api.frankfurter.dev/v1/latest?base=KRW&symbols=USD,CAD,GBP,EUR,JPY,CNY,IDR,MYR,PHP,SGD,THB'
    );
    if (!res.ok) throw new Error('Frankfurter 환율 응답 실패: ' + res.status);
    const data = await res.json();
    const rates = {};
    Object.entries(data.rates || {}).forEach(([cur, krwPerUnit]) => {
      const n = Number(krwPerUnit);
      if (n > 0) rates[cur] = Math.round((1 / n) * 100) / 100; // KRW 기준 응답을 "1외화 = ?원"으로 뒤집음
    });
    return rates;
  }

  async function fetchExtraRates() {
    const res = await fetch('https://open.er-api.com/v6/latest/KRW');
    if (!res.ok) throw new Error('보조 환율 응답 실패: ' + res.status);
    const data = await res.json();
    if (data.result !== 'success') throw new Error('보조 환율 조회 결과가 정상이 아닙니다.');
    const rates = {};
    ['VND', 'TWD'].forEach((cur) => {
      const perKrw = Number(data.rates && data.rates[cur]); // 1원 = perKrw {cur}
      if (perKrw > 0) rates[cur] = Math.round((1 / perKrw) * 100) / 100; // "1외화 = ?원"으로 뒤집음
    });
    return rates;
  }

  async function ensureExchangeRates() {
    const cache = ExchangeRateStore.get();
    if (ExchangeRateStore.isFresh(cache)) {
      applyExchangeRates(cache.rates);
      return;
    }

    const results = await Promise.allSettled([fetchFrankfurterRates(), fetchExtraRates()]);
    let rates = {};
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        rates = { ...rates, ...r.value };
      } else {
        console.warn(`환율 소스 ${i === 0 ? 'Frankfurter' : 'open.er-api'} 조회 실패`, r.reason);
      }
    });

    if (Object.keys(rates).length > 0) {
      // 이전 캐시와 합쳐서 저장: 이번에 실패한 소스가 있어도 지난번 값은 유지
      const merged = { ...((cache && cache.rates) || {}), ...rates };
      ExchangeRateStore.set(merged);
      applyExchangeRates(merged);
    } else if (cache) {
      applyExchangeRates(cache.rates);
      // 캐시도 전혀 없으면 아무 것도 하지 않고 기존 수동 입력 흐름 그대로 유지
    }
  }

  // 조회/캐시된 환율을 "마지막에 쓰던 값"과 동일한 방식으로 저장하고,
  // 현재 화면에 비어있는 환율 입력칸이 있으면 자동으로 채워준다 (사용자가 입력한 값은 덮어쓰지 않음).
  function applyExchangeRates(rates) {
    const prefs = PrefsStore.get();
    PrefsStore.update({ exchangeRates: { ...(prefs.exchangeRates || {}), ...rates } });
    products.forEach((p) => {
      const currency = els[p].currency.value;
      if (currency !== 'KRW' && !els[p].exchangeRate.value && rates[currency]) {
        els[p].exchangeRate.value = rates[currency];
        liveUpdate(p);
      }
      renderExrateHint(p);
    });
  }

  ensureExchangeRates();
  initShoppingList();

  // ---- 입력 중 자동 임시저장 (products 영역 안의 모든 입력 변화를 위임 방식으로 감지) ----
  let draftSaveTimer = null;
  const productsSection = document.querySelector('.products');
  function scheduleDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(() => {
      DraftStore.set({ inputA: readInput('A'), inputB: readInput('B') });
    }, 300);
  }
  productsSection.addEventListener('input', scheduleDraftSave);
  productsSection.addEventListener('change', scheduleDraftSave);

  // ---- 초기화 버튼 ----
  function resetProduct(p) {
    els[p].name.value = '';
    els[p].price.value = '';
    els[p].amount.value = '';
    els[p].unit.value = 'g';
    els[p].weightPerUnit.value = '';
    els[p].currency.value = 'KRW';
    els[p].exchangeRate.value = '';
    els[p].discountType.value = 'none';
    toggleExchangeRate(p);
    toggleWeightPerUnit(p);
    renderDiscountParams(p);
    els[p].photoInput.value = '';
    els[p].photoPreviewWrap.classList.add('hidden');
    els[p].photoPreview.src = '';
    els[p].ocrCandidates.innerHTML = '';
    els[p].ocrStatus.textContent = '';

    // 할인 "더보기"로 추가됐던 정액/카드 옵션 제거 + 버튼 다시 노출
    const flatOpt = els[p].discountType.querySelector('option[value="flat"]');
    const cardOpt = els[p].discountType.querySelector('option[value="card"]');
    if (flatOpt) flatOpt.remove();
    if (cardOpt) cardOpt.remove();
    if (els[p].discountMoreBtn) els[p].discountMoreBtn.classList.remove('hidden');

    closeAdvanced(p);
    liveUpdate(p);
  }

  document.getElementById('resetBtn').addEventListener('click', () => {
    resetProduct('A');
    resetProduct('B');
    resultSection.classList.add('hidden');
    resultSection.innerHTML = '';
    DraftStore.clear();
  });

  // ---- A/B 값 서로 바꾸기 ----
  document.getElementById('swapBtn').addEventListener('click', () => {
    const a = readInput('A');
    const b = readInput('B');
    applyState('A', b);
    applyState('B', a);
    scheduleDraftSave();
  });

  // ---- 사진 OCR (PaddleOCR - 한국어 전용 모델) ----
  let ocrService = null; // 초기화된 서비스 인스턴스 재사용 (상품 A/B 둘 다 같은 서비스 공유)
  let ocrInitPromise = null; // 동시에 두 번 초기화되지 않도록 진행 중인 초기화 프로미스를 공유

  async function getOcrService() {
    if (ocrService) return ocrService;
    if (ocrInitPromise) return ocrInitPromise;
    if (typeof PaddleOcrService === 'undefined') {
      throw new Error('OCR 라이브러리를 아직 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    ocrInitPromise = (async () => {
      const service = new PaddleOcrService({
        model: window.PADDLE_KOREAN_MODEL,
        // 원인 진단용: 콘솔에 감지/인식 단계별 로그를 출력한다.
        // (문제 원인이 확인되면 다시 꺼도 됨 — 성능에 큰 영향은 없지만 로그가 계속 쌓이는 건 지저분함)
        debugging: { verbose: true },
      });
      await service.initialize();
      ocrService = service;
      return service;
    })();
    try {
      return await ocrInitPromise;
    } catch (e) {
      ocrInitPromise = null; // 초기화 실패 시 다음 시도에서 다시 시도할 수 있게 초기화
      throw e;
    }
  }

  // 사진 파일을 PaddleOCR가 받을 수 있는 캔버스로 변환
  async function fileToCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = () => reject(new Error('이미지를 불러오지 못했어요.'));
        img.src = url;
      });
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext('2d').drawImage(img, 0, 0);
      return canvas;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  // ---- ESL 영역 자동 감지 + 기울기 보정 (OpenCV.js) ----
  // OCR 전에 라벨 영역만 찾아서 반듯하게 펴 놓으면 인식률이 크게 올라간다.
  // 실패하면(라벨을 못 찾거나 OpenCV 자체가 안 불러와지면) 원본 사진을 그대로 반환해서
  // 이 단계가 없던 것처럼 동작한다 — 즉 이 단계는 "있으면 좋고 없어도 되는" 보강 단계.
  let cvReadyPromise = null;
  function getOpenCv() {
    if (cvReadyPromise) return cvReadyPromise;
    cvReadyPromise = (async () => {
      if (typeof cv === 'undefined') {
        throw new Error('OpenCV 라이브러리를 아직 불러오지 못했어요.');
      }
      if (cv instanceof Promise) return await cv;
      if (cv.Mat) return cv;
      await new Promise((resolve) => { cv['onRuntimeInitialized'] = resolve; });
      return cv;
    })();
    return cvReadyPromise;
  }

  // 감지된 4개 점을 [좌상단, 우상단, 우하단, 좌하단] 순서로 정렬
  function orderCornerPoints(pts) {
    const sums = pts.map((p) => p.x + p.y);
    const diffs = pts.map((p) => p.x - p.y);
    const tl = pts[sums.indexOf(Math.min(...sums))];
    const br = pts[sums.indexOf(Math.max(...sums))];
    const tr = pts[diffs.indexOf(Math.max(...diffs))];
    const bl = pts[diffs.indexOf(Math.min(...diffs))];
    return [tl, tr, br, bl];
  }

  function cornerMatToPoints(mat) {
    const pts = [];
    for (let i = 0; i < mat.rows; i++) {
      pts.push({ x: mat.data32S[i * 2], y: mat.data32S[i * 2 + 1] });
    }
    return pts;
  }

  // 사진 안에서 사각형 라벨(ESL) 후보를 찾는다. 못 찾으면 null.
  function detectEslQuad(cvLib, src) {
    const gray = new cvLib.Mat();
    const blurred = new cvLib.Mat();
    const edged = new cvLib.Mat();
    const kernel = cvLib.Mat.ones(3, 3, cvLib.CV_8U);
    const dilated = new cvLib.Mat();
    const contours = new cvLib.MatVector();
    const hierarchy = new cvLib.Mat();
    let best = null;

    try {
      cvLib.cvtColor(src, gray, cvLib.COLOR_RGBA2GRAY);
      cvLib.GaussianBlur(gray, blurred, new cvLib.Size(5, 5), 0);
      cvLib.Canny(blurred, edged, 50, 150);
      cvLib.dilate(edged, dilated, kernel);
      cvLib.findContours(dilated, contours, hierarchy, cvLib.RETR_LIST, cvLib.CHAIN_APPROX_SIMPLE);

      let bestArea = 0;
      const imgArea = src.rows * src.cols;
      for (let i = 0; i < contours.size(); i++) {
        const cnt = contours.get(i);
        const peri = cvLib.arcLength(cnt, true);
        const approx = new cvLib.Mat();
        cvLib.approxPolyDP(cnt, approx, 0.02 * peri, true);
        if (approx.rows === 4) {
          const area = Math.abs(cvLib.contourArea(approx));
          // 이미지 전체 면적의 5% 이상인 사각형만 "라벨 후보"로 인정 (너무 작은 잡음 제외)
          if (area > imgArea * 0.05 && area > bestArea && cvLib.isContourConvex(approx)) {
            bestArea = area;
            if (best) best.delete();
            best = approx.clone();
          }
        }
        approx.delete();
        cnt.delete();
      }
      return best;
    } finally {
      gray.delete(); blurred.delete(); edged.delete(); dilated.delete(); kernel.delete();
      contours.delete(); hierarchy.delete();
    }
  }

  /**
   * 사진에서 ESL 라벨 영역을 찾아 기울기를 펴고 크롭한 새 캔버스를 반환한다.
   * 라벨을 못 찾거나 OpenCV를 못 불러온 경우, 원본 캔버스를 그대로 반환한다(안전한 폴백).
   */
  async function detectAndCropEsl(canvas) {
    let cvLib;
    try {
      cvLib = await getOpenCv();
    } catch (e) {
      console.warn('OpenCV를 불러오지 못해 원본 사진으로 진행합니다.', e);
      return canvas;
    }

    let src = null;
    let quad = null;
    try {
      src = cvLib.imread(canvas);
      quad = detectEslQuad(cvLib, src);
      if (!quad) {
        console.log('[알뜰요정 ESL 감지] 라벨 영역을 못 찾아 원본 사진으로 진행합니다.');
        return canvas;
      }

      const pts = cornerMatToPoints(quad);
      const [tl, tr, br, bl] = orderCornerPoints(pts);

      const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
      const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
      const maxWidth = Math.max(Math.round(Math.max(widthA, widthB)), 10);
      const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
      const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
      const maxHeight = Math.max(Math.round(Math.max(heightA, heightB)), 10);

      const srcTri = cvLib.matFromArray(4, 1, cvLib.CV_32FC2, [tl.x, tl.y, tr.x, tr.y, br.x, br.y, bl.x, bl.y]);
      const dstTri = cvLib.matFromArray(4, 1, cvLib.CV_32FC2, [0, 0, maxWidth - 1, 0, maxWidth - 1, maxHeight - 1, 0, maxHeight - 1]);
      const M = cvLib.getPerspectiveTransform(srcTri, dstTri);
      const dst = new cvLib.Mat();
      try {
        cvLib.warpPerspective(src, dst, M, new cvLib.Size(maxWidth, maxHeight), cvLib.INTER_LINEAR, cvLib.BORDER_CONSTANT, new cvLib.Scalar());
        const outCanvas = document.createElement('canvas');
        outCanvas.width = maxWidth;
        outCanvas.height = maxHeight;
        cvLib.imshow(outCanvas, dst);
        console.log(`[알뜰요정 ESL 감지] 라벨 영역 감지 및 보정 완료 (${maxWidth}x${maxHeight})`);
        return outCanvas;
      } finally {
        srcTri.delete(); dstTri.delete(); M.delete(); dst.delete();
      }
    } catch (e) {
      console.warn('ESL 영역 보정 중 오류가 발생해 원본 사진으로 진행합니다.', e);
      return canvas;
    } finally {
      if (src) src.delete();
      if (quad) quad.delete();
    }
  }

  function initPhotoOcr(p) {
    els[p].photoBtn.addEventListener('click', () => els[p].photoInput.click());

    els[p].photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      els[p].photoPreviewWrap.classList.remove('hidden');
      els[p].photoPreview.src = URL.createObjectURL(file);
      els[p].ocrCandidates.innerHTML = '';
      setOcrStatus(p, '가격표 읽는 중이에요... (처음 사용 시 모델을 내려받느라 다소 걸릴 수 있어요)', 'loading');

      try {
        const service = await getOcrService();
        const rawCanvas = await fileToCanvas(file);
        const canvas = await detectAndCropEsl(rawCanvas);
        const result = await service.recognize(canvas);
        const text = result && result.text ? result.text : '';
        const analysis = OcrParser.analyze(text);
        renderOcrCandidates(p, analysis);
      } catch (err) {
        console.error('OCR 오류:', err);
        setOcrStatus(p, '인식하지 못했어요. 직접 입력해주세요.', 'error');
      }
    });
  }

  // ---- 오늘 장보기 리스트 (ESL 자동추가, 베타) ----
  let addToastTimer = null;

  function renderOnlinePriceRow(item) {
    if (item.onlineStatus === 'loading') {
      return `<div class="list-item-online loading">🔍 온라인 최저가 확인 중...</div>`;
    }
    if (item.onlineStatus === 'done' && item.onlinePrice != null) {
      const diff = item.price - item.onlinePrice;
      if (diff > 0) {
        return `<a class="list-item-online cheaper" href="${item.onlineLink}" target="_blank" rel="noopener noreferrer">
          🛒 온라인이 ${krw(diff)}원 더 저렴해요 (${krw(item.onlinePrice)}원 · ${escapeHtml(item.onlineMall || '')})
        </a>`;
      }
      return `<div class="list-item-online ok">✓ 마트가 더 저렴하거나 비슷해요 (온라인 ${krw(item.onlinePrice)}원)</div>`;
    }
    if (item.onlineStatus === 'none') {
      return `<div class="list-item-online muted">온라인 검색 결과가 없어요</div>`;
    }
    if (item.onlineStatus === 'error') {
      return `<div class="list-item-online muted">온라인 최저가 확인 실패</div>`;
    }
    return '';
  }

  function renderShoppingList() {
    const list = ShoppingListStore.getAll();
    const listEl = document.getElementById('shoppingList');
    const totalEl = document.getElementById('listTotal');

    if (list.length === 0) {
      listEl.innerHTML = '';
      totalEl.textContent = '담은 상품이 없어요';
      return;
    }

    const total = ShoppingListStore.getTotal();
    totalEl.innerHTML = `담은 상품 <b>${list.length}개</b> · 합계 <b>${krw(total)}원</b>`;

    listEl.innerHTML = list.map((item) => `
      <li class="list-item" data-id="${item.id}">
        <div class="list-item-main">
          <span class="list-item-name">${item.name || '(상품명 미확인)'}</span>
          <span class="list-item-price">${krw(item.price)}원</span>
        </div>
        <div class="list-item-unit">${item.unitLabel} ${krw(item.unitPriceKRW)}원</div>
        ${renderOnlinePriceRow(item)}
        <button type="button" class="list-item-remove" data-remove-id="${item.id}" aria-label="삭제">✕</button>
      </li>
    `).join('');

    listEl.querySelectorAll('[data-remove-id]').forEach((btn) => {
      btn.addEventListener('click', () => {
        ShoppingListStore.remove(btn.getAttribute('data-remove-id'));
        renderShoppingList();
      });
    });
  }

  function showAddToast(record) {
    const toast = document.getElementById('addToast');
    const textEl = document.getElementById('addToastText');
    const undoBtn = document.getElementById('addToastUndoBtn');

    textEl.textContent = `✓ ${record.name || '상품'} 담았습니다`;
    toast.classList.remove('hidden', 'toast-error');

    if (addToastTimer) clearTimeout(addToastTimer);
    addToastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);

    // 이전 클릭 리스너가 남아있지 않도록 버튼을 매번 새로 교체(clone)한 뒤 새 리스너를 하나만 붙인다
    const freshUndoBtn = undoBtn.cloneNode(true);
    undoBtn.replaceWith(freshUndoBtn);
    freshUndoBtn.addEventListener('click', () => {
      ShoppingListStore.remove(record.id);
      renderShoppingList();
      toast.classList.add('hidden');
      if (addToastTimer) clearTimeout(addToastTimer);
    });
  }

  function showErrorToast(message) {
    const toast = document.getElementById('addToast');
    const textEl = document.getElementById('addToastText');
    const undoBtn = document.getElementById('addToastUndoBtn');
    textEl.textContent = message;
    undoBtn.classList.add('hidden');
    toast.classList.remove('hidden');
    toast.classList.add('toast-error');
    if (addToastTimer) clearTimeout(addToastTimer);
    addToastTimer = setTimeout(() => toast.classList.add('hidden'), 4000);
  }

  // ESL로 담은 항목의 온라인 최저가를 백그라운드에서 조회해서 리스트 항목에 채워넣는다.
  // 실패하거나 결과가 없어도 리스트 추가 자체(이미 끝남)에는 영향 없음 — 어디까지나 "덤" 정보.
  async function fetchOnlinePriceForItem(itemId, name) {
    try {
      const res = await fetch(`/api/search-price?query=${encodeURIComponent(name)}`);
      const data = await res.json();

      if (!res.ok || !data.items || data.items.length === 0) {
        ShoppingListStore.update(itemId, { onlineStatus: 'none' });
        renderShoppingList();
        return;
      }

      const cheapest = data.items[0]; // API가 이미 오름차순(sort=asc)으로 정렬해서 반환
      ShoppingListStore.update(itemId, {
        onlineStatus: 'done',
        onlinePrice: cheapest.price,
        onlineMall: cheapest.mallName,
        onlineLink: cheapest.link,
      });
      renderShoppingList();
    } catch (e) {
      console.warn('온라인 최저가 조회 실패:', e);
      ShoppingListStore.update(itemId, { onlineStatus: 'error' });
      renderShoppingList();
    }
  }

  function initShoppingList() {
    renderShoppingList();

    const captureBtn = document.getElementById('eslCaptureBtn');
    const captureInput = document.getElementById('eslCaptureInput');
    const clearBtn = document.getElementById('listClearBtn');

    captureBtn.addEventListener('click', () => captureInput.click());

    captureInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      captureBtn.disabled = true;
      captureBtn.textContent = '📷 인식하는 중...';

      try {
        const service = await getOcrService();
        const rawCanvas = await fileToCanvas(file);
        const canvas = await detectAndCropEsl(rawCanvas);
        const result = await service.recognize(canvas);
        const text = result && result.text ? result.text : '';
        // 진단용 로그: 인식 실패 시 콘솔에서 "OCR 원본 텍스트"가 비어있는지, 이상한 글자가 나오는지 확인 가능
        console.log('[알뜰요정 OCR 진단] 원본 인식 텍스트:', JSON.stringify(text));
        console.log('[알뜰요정 OCR 진단] 전체 결과 객체:', result);
        const extracted = OcrParser.autoExtract(text);

        if (!extracted.complete) {
          showErrorToast('가격이나 용량을 읽지 못했어요. 다시 촬영해주세요.');
          return;
        }

        const calc = Calculator.calcUnitPrice({
          price: extracted.price,
          amount: extracted.amount,
          unit: extracted.unit,
          currency: 'KRW',
          discountType: 'none',
        });

        const record = ShoppingListStore.add({
          name: extracted.name,
          price: extracted.price,
          amount: extracted.amount,
          unit: extracted.unit,
          unitLabel: calc.unitLabel,
          unitPriceKRW: calc.unitPriceKRW,
          priceKRW: extracted.price, // KRW 고정 흐름이라 payAmountKRW와 동일
          onlineStatus: extracted.name ? 'loading' : 'none', // 상품명을 못 찾았으면 검색 자체가 불가능
        });

        renderShoppingList();
        showAddToast(record);

        // 리스트 추가 자체는 바로 끝내고, 온라인 최저가는 도착하는 대로 채워넣는다(화면을 막지 않음)
        if (extracted.name) {
          fetchOnlinePriceForItem(record.id, extracted.name);
        }
      } catch (err) {
        console.error('ESL 자동추가 오류:', err);
        showErrorToast('인식에 실패했어요. 다시 촬영해주세요.');
      } finally {
        captureBtn.disabled = false;
        captureBtn.textContent = '📷 ESL 촬영해서 담기';
        captureInput.value = ''; // 같은 사진을 다시 선택해도 change 이벤트가 나가도록 초기화
      }
    });

    clearBtn.addEventListener('click', () => {
      ShoppingListStore.clear();
      renderShoppingList();
    });
  }

  function setOcrStatus(p, message, kind) {
    const el = els[p].ocrStatus;
    el.textContent = message;
    el.classList.remove('ocr-error', 'ocr-done');
    if (kind === 'error') el.classList.add('ocr-error');
    if (kind === 'done') el.classList.add('ocr-done');
  }

  function renderOcrCandidates(p, analysis) {
    const { priceCandidates, amountCandidates } = analysis;
    const box = els[p].ocrCandidates;

    if (priceCandidates.length === 0 && amountCandidates.length === 0) {
      setOcrStatus(p, '숫자를 인식하지 못했어요. 직접 입력해주세요.', 'error');
      box.innerHTML = '';
      return;
    }

    setOcrStatus(p, '아래 후보 중 맞는 값을 눌러 채워주세요.', 'done');

    let html = '';
    if (priceCandidates.length > 0) {
      html += `
        <div class="ocr-chip-group">
          <div class="ocr-chip-group-label">💰 가격 후보</div>
          <div class="ocr-chip-list">
            ${priceCandidates
              .map((c) => `<button type="button" class="ocr-chip" data-kind="price" data-value="${c.value}">${c.raw}</button>`)
              .join('')}
          </div>
        </div>`;
    }
    if (amountCandidates.length > 0) {
      html += `
        <div class="ocr-chip-group">
          <div class="ocr-chip-group-label">⚖️ 용량 후보</div>
          <div class="ocr-chip-list">
            ${amountCandidates
              .map((c) => `<button type="button" class="ocr-chip" data-kind="amount" data-value="${c.value}" data-unit="${c.unit}">${c.raw}</button>`)
              .join('')}
          </div>
        </div>`;
    }
    box.innerHTML = html;

    box.querySelectorAll('.ocr-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        if (chip.dataset.kind === 'price') {
          els[p].price.value = chip.dataset.value;
        } else {
          els[p].amount.value = chip.dataset.value;
          els[p].unit.value = chip.dataset.unit;
        }
        liveUpdate(p);
      });
    });
  }

  // ---- 비교하기 ----
  compareBtn.addEventListener('click', () => {
    let inputA, inputB, resultA, resultB;
    try {
      inputA = readInput('A');
      inputB = readInput('B');
      resultA = Calculator.calcUnitPrice(inputA);
      resultB = Calculator.calcUnitPrice(inputB);
    } catch (e) {
      renderError(e.message);
      return;
    }

    const cmp = Calculator.compare(resultA, resultB);
    renderResult({ inputA, inputB, resultA, resultB, cmp });

    if (cmp.comparable) {
      HistoryStore.add({ inputA, inputB, resultA, resultB, cmp });
      renderHistory();
    }
  });

  function renderError(message) {
    resultSection.classList.remove('hidden');
    resultSection.innerHTML = `<p class="receipt-error">⚠ ${escapeHtml(message)}</p>`;
  }

  function formatRow(label, r) {
    const sym = CURRENCY_SYMBOL[r.currency] || '';
    const countryLabel = CURRENCY_LABEL[r.currency] ? `${CURRENCY_LABEL[r.currency]} ` : '';
    const original = r.currency !== 'KRW'
      ? `<div class="receipt-note">· 원래 가격 ${countryLabel}${sym}${r.payAmount.toLocaleString()} × 환율 ${krw(r.exchangeRate)} = ${krw(r.payAmountKRW)}원</div>`
      : '';
    return { sym, original };
  }

  let lastRendered = null; // 공유하기 버튼에서 참조할 마지막 비교 결과

  function renderResult({ inputA, inputB, resultA, resultB, cmp }) {
    resultSection.classList.remove('hidden');

    if (!cmp.comparable) {
      resultSection.innerHTML = `<p class="receipt-error">⚠ ${escapeHtml(cmp.reason)}</p>`;
      lastRendered = null;
      return;
    }

    lastRendered = { inputA, inputB, resultA, resultB, cmp };

    const rows = [
      { label: '상품 A', key: 'A', r: resultA, name: inputA.name, win: cmp.cheaper === 'A' },
      { label: '상품 B', key: 'B', r: resultB, name: inputB.name, win: cmp.cheaper === 'B' },
    ];

    resultSection.innerHTML = `
      <div class="receipt">
        <div class="receipt-head">알뜰요정 비교 영수증</div>
        ${cmp.approximate ? `<div class="receipt-warning">⚠ 무게-부피 근사 비교예요 (물 기준 밀도=1 가정, 기름/꿀 등은 실제와 차이 날 수 있어요)</div>` : ''}
        <div class="receipt-divider"></div>
        ${rows
          .map((row) => {
            const { original } = formatRow(row.label, row.r);
            return `
          <div class="receipt-row ${row.win ? 'win' : ''}">
            <span>${row.label} · ${row.r.unitLabel}</span>
            <span>${krw(row.r.unitPriceKRW)}원${row.win ? ' <b class="stamp">저렴</b>' : ''}</span>
          </div>
          ${original}
          ${row.r.note ? `<div class="receipt-note">· ${escapeHtml(row.r.note)}</div>` : ''}
        `;
          })
          .join('')}
        <div class="receipt-divider"></div>
        <div class="receipt-summary">
          ${cmp.cheaper === 'A' ? '상품 A' : '상품 B'}가 ${krw(cmp.diff)}원 더 저렴해요 (약 ${cmp.savingRate}% 절약)
        </div>
      </div>
      <button type="button" class="share-btn" id="shareResultBtn">📤 결과 공유하기</button>
      <div class="share-status" id="shareStatus"></div>
      <div class="online-check">
        ${rows
          .map((row) =>
            row.name
              ? `<button type="button" class="online-btn" data-key="${row.key}" data-name="${escapeHtml(row.name)}">🔍 ${row.label} 온라인 최저가 확인</button>
                 <div class="online-result" id="onlineResult${row.key}"></div>`
              : `<div class="online-hint">${row.label}에 상품명을 입력하면 온라인 최저가를 확인할 수 있어요.</div>`
          )
          .join('')}
      </div>
    `;

    resultSection.querySelectorAll('.online-btn').forEach((btn) => {
      btn.addEventListener('click', () => checkOnlinePrice(btn.dataset.key, btn.dataset.name));
    });

    document.getElementById('shareResultBtn').addEventListener('click', shareResult);
  }

  // ---- 결과 공유하기 ----
  async function shareResult() {
    if (!lastRendered) return;
    const { inputA, inputB, resultA, resultB, cmp } = lastRendered;
    const nameA = inputA.name || '상품 A';
    const nameB = inputB.name || '상품 B';

    const text = [
      '🧚 알뜰요정 비교 결과',
      `${nameA}: ${resultA.unitLabel} ${krw(resultA.unitPriceKRW)}원`,
      `${nameB}: ${resultB.unitLabel} ${krw(resultB.unitPriceKRW)}원`,
      `👉 ${cmp.cheaper === 'A' ? nameA : nameB}가 ${krw(cmp.diff)}원 더 저렴해요 (약 ${cmp.savingRate}% 절약)`,
    ].join('\n');

    const statusEl = document.getElementById('shareStatus');

    if (navigator.share) {
      try {
        await navigator.share({ title: '알뜰요정 비교 결과', text });
      } catch (e) {
        // 사용자가 공유를 취소한 경우 등은 조용히 무시
      }
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      if (statusEl) statusEl.textContent = '결과가 복사됐어요. 원하는 곳에 붙여넣어 공유하세요.';
    } catch (e) {
      if (statusEl) statusEl.textContent = '공유하기가 지원되지 않는 환경이에요.';
    }
  }

  // ---- 온라인 최저가 확인 ----
  async function checkOnlinePrice(key, name) {
    const box = document.getElementById(`onlineResult${key}`);
    box.innerHTML = `<div class="online-status">최저가 검색 중...</div>`;

    try {
      const res = await fetch(`/api/search-price?query=${encodeURIComponent(name)}`);
      const data = await res.json();

      if (!res.ok) {
        box.innerHTML = `<div class="online-status online-error">⚠ ${escapeHtml(data.error || '검색에 실패했어요.')}</div>`;
        return;
      }

      if (!data.items || data.items.length === 0) {
        box.innerHTML = `<div class="online-status">검색 결과가 없어요.</div>`;
        return;
      }

      box.innerHTML = data.items
        .map(
          (item, i) => `
        <a class="online-item ${i === 0 ? 'cheapest' : ''}" href="${item.link}" target="_blank" rel="noopener noreferrer">
          <span class="online-item-price">${krw(item.price)}원${i === 0 ? ' <b class="stamp">최저가</b>' : ''}</span>
          <span class="online-item-title">${escapeHtml(item.title)}</span>
          <span class="online-item-mall">${escapeHtml(item.mallName)} ↗</span>
        </a>
      `
        )
        .join('');
    } catch (err) {
      box.innerHTML = `<div class="online-status online-error">⚠ 검색 중 오류가 발생했어요.</div>`;
    }
  }

  // ---- 이번 주 절약 금액 ----
  const weeklySavingsBox = document.getElementById('weeklySavingsBox');
  function renderWeeklySavings() {
    const { total, count } = HistoryStore.getWeeklySavings();
    if (count === 0) {
      weeklySavingsBox.classList.add('hidden');
      weeklySavingsBox.innerHTML = '';
      return;
    }
    weeklySavingsBox.classList.remove('hidden');
    weeklySavingsBox.innerHTML = `
      <div class="weekly-savings-label">🧚 이번 주 절약 금액</div>
      <div class="weekly-savings-amount">${krw(total)}원</div>
      <div class="weekly-savings-count">최근 7일간 비교 ${count}건 기준</div>
    `;
  }

  // ---- 히스토리 ----
  function renderHistory() {
    renderWeeklySavings();
    const list = HistoryStore.getAll();
    if (list.length === 0) {
      historyList.innerHTML = `<li class="history-empty">아직 비교 기록이 없어요.</li>`;
      return;
    }
    historyList.innerHTML = list
      .map(
        (item) => `
      <li class="history-item" data-id="${item.id}">
        <div class="history-main">
          <span>${item.cmp.cheaper === 'A' ? '상품 A' : '상품 B'} 승 · ${krw(item.resultA.unitPriceKRW)}원 vs ${krw(item.resultB.unitPriceKRW)}원</span>
          <button class="history-delete" data-id="${item.id}" aria-label="기록 삭제">✕</button>
        </div>
        <div class="history-date">${formatDate(item.savedAt)}</div>
      </li>
    `
      )
      .join('');

    historyList.querySelectorAll('.history-item').forEach((li) => {
      li.addEventListener('click', () => {
        const item = list.find((x) => x.id === li.dataset.id);
        if (item) restoreFromHistory(item);
      });
    });

    historyList.querySelectorAll('.history-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        HistoryStore.remove(btn.dataset.id);
        renderHistory();
      });
    });
  }

  // ---- 히스토리 항목 복원 ----
  function restoreFromHistory(item) {
    applyState('A', item.inputA);
    applyState('B', item.inputB);
    renderResult(item);
    scheduleDraftSave();
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(
      d.getMinutes()
    ).padStart(2, '0')}`;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  renderHistory();

  // ---- PWA: 서비스워커 등록 ----
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW 등록 실패', e));
    });
  }
});

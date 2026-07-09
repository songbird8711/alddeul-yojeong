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
    };
  });

  const compareBtn = document.getElementById('compareBtn');
  const resultSection = document.getElementById('result');
  const historyList = document.getElementById('historyList');

  const CURRENCY_SYMBOL = { KRW: '₩', USD: '$', CAD: 'C$', GBP: '£', EUR: '€', JPY: '¥' };

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
    const isKRW = els[p].currency.value === 'KRW';
    if (isKRW) {
      els[p].exrateHint.textContent = '';
      els[p].exrateHint.className = 'exrate-hint';
      return;
    }
    const cache = ExchangeRateStore.get();
    if (ExchangeRateStore.isFresh(cache)) {
      els[p].exrateHint.textContent = '오늘 환율 자동 적용됨 (필요하면 직접 수정하세요)';
      els[p].exrateHint.className = 'exrate-hint auto';
    } else if (cache) {
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
    els[p].discountType.value = input.discountType || 'none';

    toggleExchangeRate(p);
    toggleWeightPerUnit(p);
    renderDiscountParams(p);

    els[p].weightPerUnit.value = numOrEmpty(input.weightPerUnit);
    els[p].exchangeRate.value = numOrEmpty(input.exchangeRate);
    fillDiscountParamInputs(p, input.discountType, input.discountParams, input.useCard);

    liveUpdate(p);
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
      let text = `${result.unitLabel} ${krw(result.unitPriceKRW)}원`;
      if (result.currency !== 'KRW') {
        text += ` (${sym}${result.payAmount.toLocaleString()} × ${krw(result.exchangeRate)})`;
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
      const remembered = currency !== 'KRW' ? (PrefsStore.get().exchangeRates || {})[currency] : null;
      els[p].exchangeRate.value = remembered || '';   // 통화 바뀔 때마다 무조건 새로 세팅(없으면 비움)
      liveUpdate(p);
    });
    els[p].discountType.addEventListener('change', () => {
      renderDiscountParams(p);
      saveLastDiscountPref(p);
      liveUpdate(p);
    });
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
        els[p].discountType.value = prefs.lastDiscount.type;
        renderDiscountParams(p);
        fillDiscountParamInputs(p, prefs.lastDiscount.type, prefs.lastDiscount.params, prefs.lastDiscount.useCard);
        liveUpdate(p);
      });
    }
  }
  loadInitialState();

  // ---- 환율 자동 조회 (하루 1회, Frankfurter API, 실패 시 캐시/수동입력으로 자연스럽게 대체) ----
  async function ensureExchangeRates() {
    const cache = ExchangeRateStore.get();
    if (ExchangeRateStore.isFresh(cache)) {
      applyExchangeRates(cache.rates);
      return;
    }
    try {
      const res = await fetch('https://api.frankfurter.dev/v1/latest?base=KRW&symbols=USD,CAD,GBP,EUR,JPY');
      if (!res.ok) throw new Error('환율 응답 실패: ' + res.status);
      const data = await res.json();
      const rates = {};
      Object.entries(data.rates || {}).forEach(([cur, krwPerUnit]) => {
        const n = Number(krwPerUnit);
        if (n > 0) rates[cur] = Math.round((1 / n) * 100) / 100; // KRW 기준 응답을 "1외화 = ?원"으로 뒤집음
      });
      if (Object.keys(rates).length > 0) {
        ExchangeRateStore.set(rates);
        applyExchangeRates(rates);
      } else if (cache) {
        applyExchangeRates(cache.rates);
      }
    } catch (e) {
      console.warn('환율 자동 조회 실패, 캐시나 수동 입력으로 대체합니다.', e);
      if (cache) applyExchangeRates(cache.rates);
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

  // ---- 사진 OCR ----
  let ocrWorker = null; // 워커 하나를 재사용 (상품 A/B 둘 다 같은 워커 공유)

  async function getOcrWorker(onProgress) {
    if (ocrWorker) return ocrWorker;
    if (typeof Tesseract === 'undefined') {
      throw new Error('OCR 라이브러리를 아직 불러오지 못했어요. 잠시 후 다시 시도해주세요.');
    }
    ocrWorker = await Tesseract.createWorker('kor+eng', 1, {
      logger: onProgress,
    });
    return ocrWorker;
  }

  function initPhotoOcr(p) {
    els[p].photoBtn.addEventListener('click', () => els[p].photoInput.click());

    els[p].photoInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      els[p].photoPreviewWrap.classList.remove('hidden');
      els[p].photoPreview.src = URL.createObjectURL(file);
      els[p].ocrCandidates.innerHTML = '';
      setOcrStatus(p, '가격표 읽는 중... (처음 사용 시 10~30초 정도 걸려요)', 'loading');

      try {
        const worker = await getOcrWorker((m) => {
          if (m.status === 'recognizing text') {
            setOcrStatus(p, `글자 인식 중... ${Math.round((m.progress || 0) * 100)}%`, 'loading');
          }
        });
        const { data: { text } } = await worker.recognize(file);
        const analysis = OcrParser.analyze(text);
        renderOcrCandidates(p, analysis);
      } catch (err) {
        console.error('OCR 오류:', err);
        setOcrStatus(p, '인식하지 못했어요. 직접 입력해주세요.', 'error');
      }
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
    const original = r.currency !== 'KRW'
      ? `<div class="receipt-note">· 원래 가격 ${sym}${r.payAmount.toLocaleString()} × 환율 ${krw(r.exchangeRate)} = ${krw(r.payAmountKRW)}원</div>`
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

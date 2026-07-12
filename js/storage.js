// storage.js
// localStorage를 다루는 부분만 모아둔 모듈.
// 나중에 로그인/서버 동기화 기능을 추가할 때 이 파일의 내부 구현만
// 서버 API 호출로 교체하면 되도록, 외부에는 동일한 함수 시그니처를 유지한다.

// ---- 오늘 장보기 리스트 (ESL 자동추가 프로토타입) ----
// A/B 비교와는 별개의 저장 공간. 마트 안에서 담는 상품들을 순서대로 쌓아둔다.
const ShoppingListStore = (() => {
  const KEY = 'alddeul-yojeong:shopping-list';

  function getAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('쇼핑리스트를 불러오지 못했습니다.', e);
      return [];
    }
  }

  function save(list) {
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      console.error('쇼핑리스트 저장에 실패했습니다.', e);
    }
  }

  /**
   * ESL에서 자동 추출된 항목을 리스트 맨 위에 추가한다.
   * @param {Object} item { name, price, amount, unit, unitLabel, unitPriceKRW, priceKRW, category, checked }
   * @returns {Object} 저장된 레코드(id, addedAt 포함) — 되돌리기(취소)에 필요
   */
  function add(item) {
    const list = getAll();
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      addedAt: new Date().toISOString(),
      checked: true, // 기본값: ESL로 스캔한 건 이미 "산" 것으로 취급
      planned: false,
      category: '기타',
      ...item,
    };
    list.unshift(record);
    save(list);
    return record;
  }

  /**
   * 장보기 전에 미리 적어두는 계획 항목("고기", "휴지" 등). 아직 가격/용량 없이 체크 안 된 상태로 추가된다.
   */
  function addPlanned(name, category) {
    return add({
      name,
      category: category || '기타',
      checked: false,
      planned: true,
      price: null,
      amount: null,
      unit: null,
      unitLabel: null,
      unitPriceKRW: null,
      priceKRW: 0,
      onlineStatus: 'none',
    });
  }

  /**
   * 아직 체크 안 된(=아직 안 산) 계획 항목 중에서 이 스캔 결과와 어울리는 걸 찾는다.
   * 1순위: 이름이 서로 겹치는 경우 (예: "서울우유" 계획 + "서울우유 900ml" 스캔)
   * 2순위: 이름은 안 겹쳐도 카테고리가 같은 경우 (예: "고기"라고만 적어둔 계획 + "한우 목살" 스캔)
   *        — 사용자가 카테고리 단위로 대충 적어두는 경우가 많을 것으로 보고 추가한 규칙.
   * @param {string} name 스캔된 상품명
   * @param {string} category 스캔된 상품의 (자동추정) 카테고리
   */
  /**
   * 이름이 서로 겹치는 계획 항목을 찾는다 (예: "서울우유" 계획 + "서울우유 900ml" 스캔).
   * 이 매칭은 신뢰도가 높아서 자동으로 확정해도 안전하다.
   */
  function findUncheckedNameMatch(name) {
    if (!name) return null;
    const compact = String(name).replace(/\s/g, '');
    const list = getAll();
    return list.find((item) => {
      if (item.checked || !item.name) return false;
      const itemCompact = String(item.name).replace(/\s/g, '');
      return compact.includes(itemCompact) || itemCompact.includes(compact);
    }) || null;
  }

  /**
   * 이름은 안 겹치지만 카테고리가 같은 계획 항목을 찾는다 (예: "고기" 계획 + "한우 목살" 스캔).
   * 이 매칭은 신뢰도가 낮다 — 같은 카테고리 계획이 여러 개면 엉뚱한 걸 고를 수 있으므로
   * 호출하는 쪽(화면)에서 반드시 사용자에게 "이거 맞아요?" 확인을 받은 뒤에 사용해야 한다.
   */
  function findUncheckedCategoryMatch(category) {
    if (!category) return null;
    const list = getAll();
    return list.find((item) => !item.checked && item.name && item.category === category) || null;
  }

  function toggleChecked(id) {
    const list = getAll();
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], checked: !list[idx].checked };
    save(list);
    return list[idx];
  }

  function remove(id) {
    const list = getAll().filter((item) => item.id !== id);
    save(list);
    return list;
  }

  /**
   * 이미 담긴 항목 일부를 갱신한다 (예: 나중에 도착하는 온라인 최저가, 카테고리 수정 등).
   * @returns {Object|null} 갱신된 레코드, 해당 id가 없으면 null
   */
  function update(id, patch) {
    const list = getAll();
    const idx = list.findIndex((item) => item.id === id);
    if (idx === -1) return null;
    list[idx] = { ...list[idx], ...patch };
    save(list);
    return list[idx];
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  /**
   * 체크된(=이미 산) 항목만 리스트에서 제거하고, 제거된 항목들을 반환한다.
   * 아직 체크 안 된 계획 항목은 다음 장보기를 위해 그대로 남겨둔다.
   * (호출하는 쪽에서 반환값을 MonthlyLogStore에 보관한 뒤 이 함수를 부르는 순서로 사용)
   */
  function removeChecked() {
    const list = getAll();
    const checkedItems = list.filter((item) => item.checked);
    const remaining = list.filter((item) => !item.checked);
    save(remaining);
    return checkedItems;
  }

  function getTotal() {
    return getAll().reduce((sum, item) => sum + (Number(item.priceKRW) || 0), 0);
  }

  return { getAll, add, addPlanned, findUncheckedNameMatch, findUncheckedCategoryMatch, toggleChecked, update, remove, removeChecked, clear, getTotal };
})();

// ---- 월간 구매 기록 (영수증/예산 비교용) ----
// "비우기"를 누르면 그 시점까지 체크된 항목들이 여기에 영구적으로(약 13개월치) 쌓인다.
// 오늘 아직 안 비운 항목은 여기 없으므로, "이번 달 총액" 계산 시 오늘의 체크된 항목도 더해서 봐야 한다.
const MonthlyLogStore = (() => {
  const KEY = 'alddeul-yojeong:monthly-log';
  const RETENTION_DAYS = 400; // 대략 13개월치 보관 (전월/전년 비교 여지를 위해 넉넉히)

  function getAllRaw() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('월간 기록을 불러오지 못했습니다.', e);
      return [];
    }
  }

  function isWithinDays(iso, days) {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return false;
    return t >= Date.now() - days * 24 * 60 * 60 * 1000;
  }

  function getAll() {
    return getAllRaw().filter((r) => isWithinDays(r.boughtAt, RETENTION_DAYS));
  }

  /**
   * 체크된 항목들을 월간 기록에 보관한다 (ShoppingListStore.removeChecked()의 반환값을 그대로 넣으면 됨).
   */
  function archive(items) {
    if (!items || items.length === 0) return;
    const list = getAll();
    const now = new Date().toISOString();
    items.forEach((item) => {
      list.unshift({
        id: item.id,
        name: item.name,
        category: item.category || '기타',
        priceKRW: Number(item.priceKRW) || 0,
        boughtAt: item.addedAt || now, // 실제로 담았던 시각 기준 (더 정확한 "언제 샀는지")
      });
    });
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      console.error('월간 기록 저장에 실패했습니다.', e);
    }
  }

  function monthKeyOf(iso) {
    return String(iso).slice(0, 7); // 'YYYY-MM'
  }

  function getForMonth(yyyyMM) {
    return getAll().filter((r) => monthKeyOf(r.boughtAt) === yyyyMM);
  }

  function getTotalForMonth(yyyyMM) {
    return getForMonth(yyyyMM).reduce((sum, r) => sum + r.priceKRW, 0);
  }

  function getCategoryBreakdownForMonth(yyyyMM) {
    const items = getForMonth(yyyyMM);
    const totals = {};
    items.forEach((r) => {
      totals[r.category] = (totals[r.category] || 0) + r.priceKRW;
    });
    return totals;
  }

  function currentMonthKey() {
    return new Date().toISOString().slice(0, 7);
  }

  return { getAll, archive, getForMonth, getTotalForMonth, getCategoryBreakdownForMonth, currentMonthKey };
})();

// ---- 월간 예산 ----
const BudgetStore = (() => {
  const KEY = 'alddeul-yojeong:monthly-budget';

  function get() {
    const raw = localStorage.getItem(KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n > 0 ? n : null;
  }

  function set(amount) {
    try {
      localStorage.setItem(KEY, String(Math.round(Number(amount) || 0)));
    } catch (e) {
      console.error('예산 저장에 실패했습니다.', e);
    }
  }

  return { get, set };
})();

const HistoryStore = (() => {
  const KEY = 'alddeul-yojeong:grocery-history';
  const RETENTION_DAYS = 30; // 개수 제한 대신 "최근 30일" 기준으로 보관 (이번 주 절약액을 정확히 계산하기 위함)
  const HARD_CAP = 200; // localStorage 용량 보호용 안전장치 (30일 안에 200건 넘게 쌓이는 극단적 경우 대비)

  function isWithinDays(iso, days) {
    const savedAt = new Date(iso).getTime();
    if (!Number.isFinite(savedAt)) return false;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return savedAt >= cutoff;
  }

  /** 30일보다 오래된 기록을 걸러낸다. */
  function pruneOld(list) {
    return list.filter((item) => isWithinDays(item.savedAt, RETENTION_DAYS));
  }

  function getAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? pruneOld(parsed) : [];
    } catch (e) {
      console.error('히스토리를 불러오지 못했습니다.', e);
      return [];
    }
  }

  /**
   * 새 비교 결과를 맨 앞에 추가한다.
   * 30일이 지난 기록은 자동으로 제거되고, HARD_CAP을 넘으면 오래된 것부터 잘라낸다.
   * @param {Object} entry 저장할 비교 결과 스냅샷
   */
  function add(entry) {
    const list = pruneOld(getAllRaw());
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      savedAt: new Date().toISOString(),
      ...entry,
    };
    list.unshift(record);
    const trimmed = list.slice(0, HARD_CAP);
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('히스토리 저장에 실패했습니다.', e);
    }
    return trimmed;
  }

  // pruneOld를 적용하기 전 원본을 가져올 때 쓰는 내부 helper (getAll과 중복 파싱 피하기용)
  function getAllRaw() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }

  function remove(id) {
    const list = getAll().filter((item) => item.id !== id);
    try {
      localStorage.setItem(KEY, JSON.stringify(list));
    } catch (e) {
      console.error('히스토리 삭제에 실패했습니다.', e);
    }
    return list;
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  /**
   * 최근 7일간 비교 기록에서 절약된 금액의 합계를 구한다.
   * 각 기록의 cmp.diff(더 저렴한 쪽과의 단가 차이, 결과 화면에 표시되는 것과 동일한 값)를 합산한다.
   * @returns {{ total: number, count: number }} 이번 주 절약 합계(원)와 집계된 비교 건수
   */
  function getWeeklySavings() {
    const list = getAll().filter((item) => isWithinDays(item.savedAt, 7) && item.cmp && item.cmp.comparable);
    const total = list.reduce((sum, item) => sum + (Number(item.cmp.diff) || 0), 0);
    return { total: Math.round(total), count: list.length };
  }

  return { getAll, add, remove, clear, getWeeklySavings, RETENTION_DAYS };
})();

// ---- 환율 자동 조회 캐시 (하루 1회만 실제 조회하고, 나머지는 캐시 재사용) ----
const ExchangeRateStore = (() => {
  const KEY = 'alddeul-yojeong:exchange-rate-cache';

  function todayStr() {
    // 환율은 하루 단위 값이라 타임존 경계의 약간의 오차는 실질적으로 문제되지 않는다.
    return new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  }

  function get() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('환율 캐시를 불러오지 못했습니다.', e);
      return null;
    }
  }

  function set(rates) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ date: todayStr(), rates, fetchedAt: new Date().toISOString() }));
    } catch (e) {
      console.error('환율 캐시 저장에 실패했습니다.', e);
    }
  }

  function isFresh(cache) {
    return !!cache && cache.date === todayStr();
  }

  return { get, set, isFresh, todayStr };
})();

// ---- 입력 중 자동 임시저장 (새로고침/앱 재시작해도 입력값 유지) ----
const DraftStore = (() => {
  const KEY = 'alddeul-yojeong:draft';

  function get() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      console.error('임시저장을 불러오지 못했습니다.', e);
      return null;
    }
  }

  function set(draft) {
    try {
      localStorage.setItem(KEY, JSON.stringify(draft));
    } catch (e) {
      console.error('임시저장에 실패했습니다.', e);
    }
  }

  function clear() {
    localStorage.removeItem(KEY);
  }

  return { get, set, clear };
})();

// ---- 환율/할인 설정 등 "마지막에 쓰던 값" 기억 ----
const PrefsStore = (() => {
  const KEY = 'alddeul-yojeong:prefs';

  function get() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.error('환경설정을 불러오지 못했습니다.', e);
      return {};
    }
  }

  function set(prefs) {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch (e) {
      console.error('환경설정 저장에 실패했습니다.', e);
    }
  }

  function update(partial) {
    const merged = { ...get(), ...partial };
    set(merged);
    return merged;
  }

  return { get, set, update };
})();

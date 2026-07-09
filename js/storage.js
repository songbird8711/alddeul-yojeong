// storage.js
// localStorage를 다루는 부분만 모아둔 모듈.
// 나중에 로그인/서버 동기화 기능을 추가할 때 이 파일의 내부 구현만
// 서버 API 호출로 교체하면 되도록, 외부에는 동일한 함수 시그니처를 유지한다.

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

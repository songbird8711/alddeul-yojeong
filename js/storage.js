// storage.js
// localStorage를 다루는 부분만 모아둔 모듈.
// 나중에 로그인/서버 동기화 기능을 추가할 때 이 파일의 내부 구현만
// 서버 API 호출로 교체하면 되도록, 외부에는 동일한 함수 시그니처를 유지한다.

const HistoryStore = (() => {
  const KEY = 'alddeul-yojeong:grocery-history';
  const MAX_ITEMS = 10;

  function getAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      console.error('히스토리를 불러오지 못했습니다.', e);
      return [];
    }
  }

  /**
   * 새 비교 결과를 맨 앞에 추가하고, MAX_ITEMS를 넘으면 오래된 것부터 삭제한다.
   * @param {Object} entry 저장할 비교 결과 스냅샷
   */
  function add(entry) {
    const list = getAll();
    const record = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      savedAt: new Date().toISOString(),
      ...entry,
    };
    list.unshift(record);
    const trimmed = list.slice(0, MAX_ITEMS);
    try {
      localStorage.setItem(KEY, JSON.stringify(trimmed));
    } catch (e) {
      console.error('히스토리 저장에 실패했습니다.', e);
    }
    return trimmed;
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

  return { getAll, add, remove, clear, MAX_ITEMS };
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

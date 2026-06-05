// Vitest 全局 setup（所有用例前执行）。
// - 引入 jest-dom 的断言扩展（仅在 DOM 测试里用到，node 测试加载无害）。
// - 修正 localStorage：Node 25 默认注入一个「残缺」的实验性 localStorage 全局
//   （typeof === object 但没有 setItem/clear，因为未给 --localstorage-file），它在 jsdom
//   环境下会盖过 jsdom 自带的 localStorage，导致 store 持久化逻辑无法测。这里在 DOM 环境下
//   强制装一个 Map 背书的完整 localStorage。
// - 每个用例前清空 localStorage，避免持久化串扰。
import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

function makeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear() {
      m.clear();
    },
    getItem(key: string) {
      return m.has(key) ? m.get(key)! : null;
    },
    key(index: number) {
      return [...m.keys()][index] ?? null;
    },
    removeItem(key: string) {
      m.delete(key);
    },
    setItem(key: string, value: string) {
      m.set(String(key), String(value));
    },
  } as unknown as Storage;
}

function ensureLocalStorage() {
  // 仅在 DOM（jsdom）环境处理；node 环境的纯函数测试不用 localStorage。
  if (typeof window === 'undefined') return;
  const current = globalThis.localStorage as Storage | undefined;
  if (current && typeof current.setItem === 'function') return;
  const ls = makeStorage();
  for (const target of [globalThis, window] as Array<typeof globalThis | Window>) {
    try {
      Object.defineProperty(target, 'localStorage', { value: ls, configurable: true, writable: true });
    } catch {
      try {
        (target as unknown as { localStorage: Storage }).localStorage = ls;
      } catch {
        /* ignore */
      }
    }
  }
}

ensureLocalStorage();

beforeEach(() => {
  ensureLocalStorage();
  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
    localStorage.clear();
  }
});

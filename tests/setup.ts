// Vitest 全局 setup（所有用例前执行）。
// - 引入 jest-dom 的断言扩展（仅在 DOM 测试里用到，node 测试加载无害）。
// - 每个用例前清空 localStorage，避免 store/持久化测试相互串扰；
//   node 环境无 localStorage，跳过。
import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';

beforeEach(() => {
  // jsdom 提供完整 localStorage；node 环境（含 Node 实验性 webstorage）可能没有或缺 clear()，跳过。
  if (typeof localStorage !== 'undefined' && typeof localStorage.clear === 'function') {
    localStorage.clear();
  }
});

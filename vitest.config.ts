import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// ⚠️ macOS 本地跑测试需用 Homebrew 的 node：`PATH="/opt/homebrew/bin:$PATH" npm test`
//    （Vitest→Vite→Rollup 的 darwin-arm64 原生二进制在系统默认/硬化 node 下会因 Team ID
//    不匹配报签名错误，与 sharp/_icongen 同源问题）。CI 跑在 ubuntu，无此问题。
//
// 测试用 Vitest（复用 Vite 的 transform/alias）。
// 注意：Vitest 4 已移除 environmentMatchGlobs —— 默认 node 环境跑纯函数测试；
// 需要 DOM 的测试（Phase 1 store / Phase 2 组件）在各自文件顶部加：
//   // @vitest-environment jsdom
// 即可单文件切到 jsdom。
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': rootDir,
    },
  },
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
  },
});

import { defineConfig } from '@playwright/test';

// E2E：用 vite preview 起生产构建，page.route 拦截 /api 用 fixture，不依赖真代理/网络。
// 关键 1：构建时把 VITE_TICKET_PROXY_BASE_URL 设成 preview 同源地址，使搜索请求落到同源
// /api/search → 可被 page.route 拦截。
// 关键 2：产物写到独立的 dist-e2e/（不碰 dist/）—— capacitor webDir 是 dist/，若 E2E 覆写它，
// 之后单独 `cap sync` 会把烙着 localhost 代理地址的包装上真机（代理链路静默失效）。
// 注意：本机默认/硬化 node 跑 vite(rollup 原生二进制) 会签名失败 → 本地用
//   PATH="/opt/homebrew/bin:$PATH" npx playwright test
// CI(ubuntu) 无此问题。
const PORT = 4173;
const ORIGIN = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: ORIGIN,
    headless: true,
    trace: 'on-first-retry',
    viewport: { width: 1280, height: 900 },
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    command: `VITE_TICKET_PROXY_BASE_URL=${ORIGIN} npm run build -- --outDir dist-e2e && npm run preview -- --outDir dist-e2e --port ${PORT} --strictPort`,
    url: ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
  },
});

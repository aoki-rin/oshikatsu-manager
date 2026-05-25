import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.aoki.oshikatsumgr',
  appName: '推し活マネージャー',
  webDir: 'dist',
  plugins: {
    // 关键：让 webview 里的 fetch/XHR 走原生 HTTP。
    // 绕开浏览器 CORS（可直接抓 eplus/Pia 等平台），且走真机网络（反爬更友好）。
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;

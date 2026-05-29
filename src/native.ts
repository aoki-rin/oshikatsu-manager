import { Capacitor } from '@capacitor/core';
import { AppLauncher } from '@capacitor/app-launcher';

// 票务链接来自抓取的平台 HTML（不可信输入）：只放行 http(s)，
// 挡掉 javascript:/data:/intent: 等危险 scheme，避免被注入的 href 直达浏览器/AppLauncher。
const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

export async function openPurchaseUrl(url: string): Promise<void> {
  if (!url) return;
  let target: URL;
  try {
    target = new URL(url, window.location.href);
  } catch {
    return;
  }
  if (!SAFE_PROTOCOLS.has(target.protocol)) return;
  const href = target.toString();
  if (Capacitor.isNativePlatform()) {
    await AppLauncher.openUrl({ url: href });
    return;
  }
  window.open(href, '_blank', 'noopener,noreferrer');
}

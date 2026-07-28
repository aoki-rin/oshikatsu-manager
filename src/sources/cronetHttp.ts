import { Capacitor, registerPlugin } from '@capacitor/core';

// Chromium 网络栈（Cronet）的薄绑定层。为什么需要它见 docs/adr/0005：
// l-tike.com 背后的 Akamai 按「TLS 指纹 + HTTP/2 行为 + 头集与所声称 UA 的一致性」判客户端，
// OkHttp(CapacitorHttp) 会被静默丢弃，Chromium 则放行。仅 Android 有此插件。

export interface CronetResponse {
  status: number;
  url: string;
  negotiatedProtocol: string;
  data: string;
}

interface CronetHttpPlugin {
  get(options: { url: string; headers?: Record<string, string>; timeoutMs?: number }): Promise<CronetResponse>;
}

const CronetHttp = registerPlugin<CronetHttpPlugin>('CronetHttp');

// ⚠️ UA 与下面的 sec-ch-ua 必须同版本升级。只改 UA 不改 client hints，
// 反而是「假 Chrome」的明确信号——实测裸 UA 会被 h2 层直接重置（~60ms）。
export const CHROME_VERSION = '124';
export const CHROME_UA =
  `Mozilla/5.0 (Linux; Android 15; Pixel 10 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION}.0.0.0 Mobile Safari/537.36`;

// 导航请求的完整头集。缺任何一组 sec-* 都可能被判为伪装客户端（ADR-0005 实测）。
export const CHROME_NAV_HEADERS: Readonly<Record<string, string>> = Object.freeze({
  'sec-ch-ua': `"Chromium";v="${CHROME_VERSION}", "Google Chrome";v="${CHROME_VERSION}", "Not-A.Brand";v="99"`,
  'sec-ch-ua-mobile': '?1',
  'sec-ch-ua-platform': '"Android"',
  'upgrade-insecure-requests': '1',
  'user-agent': CHROME_UA,
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'sec-fetch-site': 'none',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-user': '?1',
  'sec-fetch-dest': 'document',
  'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
});

// iOS 没有这个原生插件；web/dev 也没有。调用前必须问一次，否则会拿到 Capacitor 的
// 「插件不存在」异常，被上层当成网络故障误报。
export function isCronetAvailable(): boolean {
  return Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('CronetHttp');
}

export async function cronetGet(url: string, timeoutMs = 20000): Promise<CronetResponse> {
  return CronetHttp.get({ url, headers: { ...CHROME_NAV_HEADERS }, timeoutMs });
}

// 失败原因分类。h2 协议错误不是网络故障，而是「Akamai 识破了客户端」——多半因为
// Chrome 大版本更迭后本文件的头集过期。文案要指向真正该修的地方，别让人去查网络。
export function describeCronetFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  if (/ERR_HTTP2_PROTOCOL_ERROR|ERR_SPDY|RST_STREAM/i.test(raw)) {
    return 'ローチケ拒绝了本次请求（浏览器指纹可能已过期，需同步 src/sources/cronetHttp.ts 的 Chrome 版本与头集）';
  }
  if (/timeout|ERR_TIMED_OUT|ERR_CONNECTION/i.test(raw)) {
    return 'ローチケ连接超时（网络不可达或被拦截），可点「打开ローチケ」用官方页搜索';
  }
  return `ローチケ抓取失败：${raw.slice(0, 80)}`;
}

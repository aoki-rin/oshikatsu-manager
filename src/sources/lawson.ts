import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent } from '../types';
import { buildPlatformSearchUrl, looksLikeAntiBot } from './shared';
import { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';
import { cronetGet, describeCronetFailure, isCronetAvailable, platformUserAgent } from './cronetHttp';

export { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';

// 抓取路径优先级（见 docs/adr/0005、0006）：
//  ① Cronet（Chromium 网络栈，仅 Android）——Android 上唯一能过 Akamai 的栈，300-500ms。
//  ② CapacitorHttp 直连——在 **iOS 上走 URLSession，实测能过**（Apple 的 CFNetwork 指纹被
//     Akamai 直接放行，ADR-0006）；在 Android 上则必失败（其 HTTP 栈指纹被静默丢弃）。
//     同一条兜底分支在两个平台上性质不同，超时文案因此按平台措辞。
// 代理路径（ADR-0002）仍可用但不再是必需品：两个平台都能端上自足。

const CAPACITOR_TIMEOUT_MS = 6000;

// 解析 + 校验：两条抓取路径共用，避免「换了传输层就漏掉反爬/零结果判定」。
export function interpretLawsonHtml(html: string, artist: string, status: number): ActivityEvent[] {
  if (looksLikeAntiBot(html, status).blocked) {
    throw new Error('ローチケ页面返回反爬或异常内容，请使用平台跳转继续搜索');
  }
  const events = parseLawsonSearch(html, artist);
  // 零结果是正常结局（该艺人在ローチケ无票），只有「非零结果页却解析不出东西」才是结构漂移。
  if (events.length === 0 && !isLawsonZeroResults(html)) {
    throw new Error('ローチケ搜索页结构无法识别，请使用平台跳转核对');
  }
  return events;
}

export async function searchLawson(artist: string): Promise<ActivityEvent[]> {
  const url = buildPlatformSearchUrl('Lawson Ticket', artist);

  if (isCronetAvailable()) {
    let res;
    try {
      res = await cronetGet(url);
    } catch (error: unknown) {
      // 分类后再抛：h2 协议错误代表头集/指纹过期，不该被当成网络故障排查。
      throw new Error(describeCronetFailure(error));
    }
    return interpretLawsonHtml(res.data, artist, res.status);
  }

  // 无 Cronet 的环境。iOS：URLSession 能正常过 Akamai，这是正经路径而非降级。
  // web/dev：浏览器 CORS 会拦，本就搜不了。
  let res;
  try {
    res = await CapacitorHttp.get({
      url: 'https://l-tike.com/search/',
      params: { keyword: artist },
      headers: { 'User-Agent': platformUserAgent() },
      connectTimeout: CAPACITOR_TIMEOUT_MS,
      readTimeout: CAPACITOR_TIMEOUT_MS + 1000,
    });
  } catch {
    throw new Error('直连ローチケ超时/受限（可点「打开ローチケ」用官方页搜索）');
  }
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return interpretLawsonHtml(html, artist, res.status);
}

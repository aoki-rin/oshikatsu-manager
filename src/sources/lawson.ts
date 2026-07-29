import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent } from '../types';
import { buildPlatformSearchUrl, looksLikeAntiBot } from './shared';
import { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';
import { CHROME_UA, cronetGet, describeCronetFailure, isCronetAvailable } from './cronetHttp';

export { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';

// 抓取路径优先级（见 docs/adr/0005）：
//  ① Cronet（Chromium 网络栈，仅 Android）——唯一能在设备本地过 Akamai 的栈，300-500ms。
//  ② CapacitorHttp 直连——OkHttp 的 TLS 指纹被 Akamai 静默丢弃，实测必失败；
//     保留只为在无 Cronet 的环境（iOS/web/旧包）给出明确失败文案而非静默空结果。
// 代理路径（ADR-0002）仍可用但不再是必需品：Lawson 已能端上自足。

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

  // 无 Cronet 的环境：直连基本必被反爬挂起，超时收紧以免拖满全局「搜索中」（QA #2）。
  let res;
  try {
    res = await CapacitorHttp.get({
      url: 'https://l-tike.com/search/',
      params: { keyword: artist },
      headers: { 'User-Agent': CHROME_UA },
      connectTimeout: CAPACITOR_TIMEOUT_MS,
      readTimeout: CAPACITOR_TIMEOUT_MS + 1000,
    });
  } catch {
    throw new Error('手机直连ローチケ超时/受限（Android 版走 Chromium 栈可直取；也可点「打开ローチケ」用官方页搜索）');
  }
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return interpretLawsonHtml(html, artist, res.status);
}

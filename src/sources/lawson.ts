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

// 曾是 6000——那是 ADR-0005 时期给「实测必失败的 OkHttp 直连」定的快速放弃值，
// 前提是这条路不可能成功、早点失败早点显示官方跳转。ADR-0006 把它提拔成 iOS 的
// 主路径后这个前提就没了：搜索页实测 ~190KB，移动网络下 6s 很容易误报失败。
// ⚠️ Capacitor 的 iOS 实现只认 connectTimeout——HttpRequestHandler.swift 取
// `connectTimeout ?? readTimeout ?? 600000` 塞进 URLRequest.timeoutInterval，
// readTimeout 在 iOS 上完全不生效（Android 的 HttpURLConnection 两个都用）。
// 上限受外层 platformSearchTimeoutMs（25s）约束：必须先于它触发，否则拿不到
// describeDirectFailure 的分类，只剩一句 "Lawson Ticket search timed out"。
export const CAPACITOR_TIMEOUT_MS = 15000;

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
  // 地址复用上面那个 url，不再另起一份硬编码：两份构造迟早会分叉，而这仓库刚在
  // LivePocket 上踩过站点改版换域名（shared.ts 的 buildPlatformSearchUrl 里有记录）。
  let res;
  try {
    res = await CapacitorHttp.get({
      url,
      headers: { 'User-Agent': platformUserAgent() },
      connectTimeout: CAPACITOR_TIMEOUT_MS,
      readTimeout: CAPACITOR_TIMEOUT_MS,
    });
  } catch (error: unknown) {
    throw new Error(describeDirectFailure(error));
  }
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return interpretLawsonHtml(html, artist, res.status);
}

// 兜底路径的失败分类。以前这里是 `catch { throw new Error('…超时/受限…') }`——
// 原始异常被整个丢掉。在 Android 上无所谓（那条路必失败），但 ADR-0006 之后它是
// iOS 的主路径：Akamai 收紧、DNS 解析不到、TLS 握手失败会显示同一句「超时」，
// 把排查引向网络。分桶按 NSURLError 的 localizedDescription（iOS）与
// HttpURLConnection 的 IOException（Android）措辞取，认不出来就走兜底分支——
// 原始摘要**任何分支都带上**，分类错了也不至于丢线索。
export function describeDirectFailure(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const cause = raw ? `（${raw.slice(0, 80)}）` : '';
  if (/timed? ?out|ETIMEDOUT/i.test(raw)) {
    return `直连ローチケ超时，可点「打开ローチケ」用官方页搜索${cause}`;
  }
  if (/hostname could not be found|appears to be offline|could not connect|unable to resolve host|ENOTFOUND|ECONNREFUSED/i.test(raw)) {
    return `连不上ローチケ（网络或 DNS 不可达），可点「打开ローチケ」用官方页搜索${cause}`;
  }
  return `直连ローチケ失败${cause}`;
}

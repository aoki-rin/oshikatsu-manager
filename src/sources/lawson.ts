import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent } from '../types';
import { looksLikeAntiBot } from './shared';
import { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';

export { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';

const UA =
  'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

export async function searchLawson(artist: string): Promise<ActivityEvent[]> {
  // 手机直连 l-tike 常被反爬挂起（ADR-0002：正经路径是住宅代理）——超时收紧到 6/7s，
  // 失败给明确文案 + 官方跳转，别拖满全局「搜索中」状态（QA #2）。
  let res;
  try {
    res = await CapacitorHttp.get({
      url: 'https://l-tike.com/search/',
      params: { keyword: artist },
      headers: { 'User-Agent': UA },
      connectTimeout: 6000,
      readTimeout: 7000,
    });
  } catch {
    throw new Error('手机直连ローチケ超时/受限（配置代理可自动解析；也可点「打开ローチケ」用官方页搜索）');
  }
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  if (looksLikeAntiBot(html, res.status).blocked) {
    throw new Error('ローチケ页面返回反爬或异常内容，请使用平台跳转继续搜索');
  }
  const events = parseLawsonSearch(html, artist);
  if (events.length === 0 && !isLawsonZeroResults(html)) {
    throw new Error('ローチケ搜索页结构无法识别，请使用平台跳转核对');
  }
  return events;
}

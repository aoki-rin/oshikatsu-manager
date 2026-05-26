import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent } from '../types';
import { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';

export { parseLawsonSearch, isLawsonZeroResults } from './lawsonParser';

const UA =
  'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

export async function searchLawson(artist: string): Promise<ActivityEvent[]> {
  const res = await CapacitorHttp.get({
    url: 'https://l-tike.com/search/',
    params: { keyword: artist },
    headers: { 'User-Agent': UA },
    connectTimeout: 10000,
    readTimeout: 20000,
  });
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  if (/captcha|access denied|forbidden|不正|bot/i.test(html) || html.length < 500) {
    throw new Error('ローチケ页面返回反爬或异常内容，请使用平台跳转继续搜索');
  }
  const events = parseLawsonSearch(html, artist);
  if (events.length === 0 && !isLawsonZeroResults(html)) {
    throw new Error('ローチケ搜索页结构无法识别，请使用平台跳转核对');
  }
  return events;
}

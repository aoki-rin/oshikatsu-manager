// 前端 Ticket Pia 平台搜索插件（Mihon 式）。两步：
//  1) search_all.do?kw=艺人 → 从内联 JS 解析 artistCd
//  2) artist/rlsInfo.do?apiRequest={artistCd} → HTML 片段(sales_list)，解析事件 + 发售/抽選轮次
// Pia 的 rlsInfo 给的是【状态】(抽選受付中/予定枚数終了)，精确受付締切日期需点详情页(getDetails，后续)。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';
import { canonicalArtistId, canonicalVenueId, deriveTimelineFromWindows, looksLikeAntiBot, normalizeLiveEvent } from './shared';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80';

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// Pia 页面里的轮次链接现在指向 ticket.pia.jp，而该域名对详情页 301 回 t.pia.jp——
// 解析时就归一到 t.pia.jp：存储 URL 干净、enrich/购票少一跳（也不赌 HTTP 客户端的重定向行为）。
export function toTPiaUrl(url: string): string {
  return url.replace('//ticket.pia.jp/', '//t.pia.jp/');
}
const dec = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const m1 = (s: string, re: RegExp): string | null => { const m = s.match(re); return m ? m[1] : null; };

export interface PiaArtistInfo {
  cd: string;
  // Pia 页面自带的真实艺人名（artistnm，常为全角 → NFKC 归一），有则 UI 可展示真实出演者。
  name: string | null;
}

// search_all.do 内联 JS:
//   var artistArray = "[score: 2.08, artistcd: M4140001, artistnm: ＦＲＵＩＴＳ ＺＩＰＰＥＲ, artistkn: ..., ...]"
// ⚠️ artistcd 可以带字母前缀（如 M4140001）——旧正则 \d+ 会漏配，导致这类艺人「无结果」。
export function parsePiaArtistInfo(searchHtml: string): PiaArtistInfo | null {
  const cd = m1(searchHtml, /artistcd:\s*([A-Za-z0-9]+)/);
  if (!cd) return null;
  const rawName = m1(searchHtml, /artistnm:\s*([^,\]]+)/);
  const name = rawName ? rawName.normalize('NFKC').trim() : null;
  return { cd, name: name || null };
}

// 兼容旧调用：只取 artistCd。
export function parsePiaArtistCd(searchHtml: string): string | null {
  return parsePiaArtistInfo(searchHtml)?.cd ?? null;
}

// 解析 rlsInfo.do 的 HTML 片段 → ActivityEvent[]
// artistSource：artist 是 Pia 页面的真实艺人名时传 'platform'，是搜索词回显时传 'query'。
export function parsePiaRlsInfo(html: string, artist: string, artistSource: 'platform' | 'query' = 'query'): ActivityEvent[] {
  const blocks = html.split('<section class="sales_data">').slice(1);
  const events: ActivityEvent[] = [];

  blocks.forEach((b, bi) => {
    const rawTitle = m1(b, /sales_data_title">([\s\S]*?)<\/h3>/) || '';
    const title = dec(stripTags(rawTitle)) || artist;
    const bundle = m1(b, /eventBundleCd=([A-Za-z0-9]+)/) || `b${bi}`;

    const roundSegs = b.split('<div class="event_link"').slice(1);
    const windows: TicketWindow[] = [];
    let eventDate = '';
    let region = '';

    roundSegs.forEach((seg, i) => {
      const rawUrl = m1(seg, /<a href="([^"]+)"\s+itemprop="url"/);
      const url = rawUrl ? toTPiaUrl(rawUrl) : rawUrl;
      const rt = m1(seg, /class="is_title">([\s\S]*?)<\/li>/);
      const roundType = (rt ? dec(stripTags(rt)).replace(/^「[^」]*」/, '') : '') || '受付';
      const status = m1(seg, /class="is_status"[^>]*>([\s\S]*?)<\/(?:li|span|td)>/);
      const statusText = status ? dec(stripTags(status)) : undefined;
      const sd = m1(seg, /itemprop="startDate"\s+datetime="([^"]+)"/);
      const place = m1(seg, /class="is_place"[\s\S]*?itemprop="name"[^>]*>([\s\S]*?)<\/span>/);
      if (sd && !eventDate) eventDate = sd.slice(0, 10);
      if (place && !region) region = dec(stripTags(place)).slice(0, 40);
      windows.push({
        id: `pia-${bundle}-${i}`,
        platform: 'Ticket Pia',
        roundType,
        statusText,
        applyStart: null,
        applyEnd: null,
        sourceUrl: url || undefined,
        applyUrl: url || undefined,
      });
    });

    if (windows.length === 0) return;
    // Pia app 对 /pia/event/event.do 做了 verified app-link（真机实测会直接开 app）；
    // 把它同时用作 purchaseUrl,「前往购票」即可深链进 Pia app。
    // 窗口 applyUrl 仍保留精确受付页(ticketInformation.do)——getDetails 富集 + 逐轮「申込」按钮用。
    const eventUrl = `https://t.pia.jp/pia/event/event.do?eventBundleCd=${bundle}`;
    const base: ActivityEvent = {
      id: `pia-${bundle}`,
      title,
      artistId: canonicalArtistId(artist) || `pia-artist-${artist}`,
      artistName: artist,
      artistSource,
      venueId: canonicalVenueId(region) || `pia-venue-${bundle}`,
      venueName: region || '—',
      date: eventDate || '',
      time: '',
      region,
      platform: 'Ticket Pia',
      price: '—',
      imageUrl: PLACEHOLDER_IMG,
      timeline: {},
      ticketWindows: windows,
      originalUrl: eventUrl,
      purchaseUrl: eventUrl,
      description: `${title}（Ticket Pia 平台实时搜索）`,
      category: 'J-Pop',
      tags: ['Ticket Pia', '实时'],
    };
    events.push(normalizeLiveEvent(base, 'pia'));
  });

  return events.map((event) => normalizeLiveEvent({
    ...event,
    timeline: deriveTimelineFromWindows(event.ticketWindows || []),
  }, 'pia'));
}

// ---- getDetails: 详情页(ticketInformation.do)取精确受付期間 + 結果発表 ----
const PIA_D = '(\\d{4})\\/(\\d{1,2})\\/(\\d{1,2})\\([^)]*\\)\\s*(?:昼|夜|朝|午前|午後)?\\s*(\\d{1,2}:\\d{2})';
function piaIso(y: string, mo: string, d: string, hm: string): string {
  const [H, M] = hm.split(':');
  const p = (n: string) => n.padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(H)}:${p(M)}:00+09:00`;
}
export interface PiaDetail { applyStart: string | null; applyEnd: string | null; resultStart: string | null }

// 纯函数：从详情页 HTML 解析受付/結果発表日期
export function parsePiaDetailDates(html: string): PiaDetail {
  const t = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .normalize('NFKC')
    .replace(/\s+/g, ' ');
  const a = t.match(new RegExp('受付期間\\s*' + PIA_D + '\\s*[~～〜]\\s*' + PIA_D));
  const r = t.match(new RegExp('結果発表開始日時\\s*' + PIA_D));
  return {
    applyStart: a ? piaIso(a[1], a[2], a[3], a[4]) : null,
    applyEnd: a ? piaIso(a[5], a[6], a[7], a[8]) : null,
    resultStart: r ? piaIso(r[1], r[2], r[3], r[4]) : null,
  };
}

export async function getPiaDetail(url: string): Promise<PiaDetail | null> {
  try {
    // 兜底：存量事件可能还存着 ticket.pia.jp 旧链接（该域名 301 回 t.pia.jp）
    const res = await CapacitorHttp.get({ url: toTPiaUrl(url), headers: { 'User-Agent': UA }, connectTimeout: 10000, readTimeout: 15000 });
    const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    return parsePiaDetailDates(html);
  } catch {
    return null;
  }
}

// artistCd 模式：艺人页的发售一览（注意：apiRequest 格式须与 Pia 一致——functions 不带引号）。
export function buildPiaArtistRlsInfoUrl(artistCd: string): string {
  const apiRequest = `{functions:[{"functionId":"SA403001","parameters":{"page":1,"artistCd":"${artistCd}","includeSaleEnd":"fuzzy","mode":"2","dispMode":"1","responsive":"true"}}]}`;
  const url = new URL('https://t.pia.jp/pia/artist/rlsInfo.do');
  url.searchParams.set('apiRequest', apiRequest);
  return url.toString();
}

// kw（公演名关键词）模式：官网搜索结果页实测的 XHR（searchMode=1）。
// 「PERSONA LIVE TOUR 2026」这类游戏/系列演唱会在 Pia 不是注册艺人（artistArray 空），
// 官网靠这条路展示公演命中——响应与 artistCd 模式同构，parsePiaRlsInfo 通吃。
export function buildPiaKeywordRlsInfoUrl(kw: string): string {
  const url = new URL('https://t.pia.jp/pia/rlsInfo.do');
  url.searchParams.set('kw', kw);
  url.searchParams.set('cAsgnFlg', 'false');
  url.searchParams.set('bAsgnFlg', 'false');
  url.searchParams.set('includeSaleEnd', 'false');
  url.searchParams.set('page', '1');
  url.searchParams.set('responsive', 'true');
  url.searchParams.set('noConvert', 'true');
  url.searchParams.set('searchMode', '1');
  url.searchParams.set('mode', '2');
  url.searchParams.set('dispMode', '1');
  return url.toString();
}

async function fetchPiaText(url: string): Promise<string> {
  const res = await CapacitorHttp.get({
    url,
    headers: { 'User-Agent': UA },
    connectTimeout: 10000,
    readTimeout: 20000,
  });
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}

export async function searchPia(artist: string): Promise<ActivityEvent[]> {
  // 1) 搜艺人拿 artistCd
  const s = await CapacitorHttp.get({
    url: 'https://t.pia.jp/pia/search_all.do',
    params: { kw: artist },
    headers: { 'User-Agent': UA },
    connectTimeout: 10000,
    readTimeout: 20000,
  });
  const searchHtml = typeof s.data === 'string' ? s.data : String(s.data ?? '');
  // 直连遇 403/503/挑战页 → 抛错(归 source error),别把拦截页当「艺人未命中」误标 empty(#72)。
  if (looksLikeAntiBot(searchHtml, s.status).blocked) {
    throw new Error('Ticket Pia 直连返回反爬/异常内容（配置代理或用平台跳转继续搜索）');
  }
  const artistInfo = parsePiaArtistInfo(searchHtml);

  // 2) 艺人命中 → 该艺人的发售/抽選一览。搜索只返回 rlsInfo（状态 + 链接，快），
  //    精确受付日期由 enrichPiaWindows 在点开详情时懒加载。
  //    Pia 自带真实艺人名（artistnm）→ 优先用它做出演者展示（artistSource:'platform'）。
  if (artistInfo) {
    const html = await fetchPiaText(buildPiaArtistRlsInfoUrl(artistInfo.cd));
    const events = parsePiaRlsInfo(html, artistInfo.name || artist, artistInfo.name ? 'platform' : 'query');
    if (events.length > 0) return events;
    // 艺人存在但名下 0 件（如「ペルソナ」艺人码无票、票挂在公演名下）→ 继续走关键词兜底
  }

  // 3) 兜底：公演名关键词直搜（官网同款路径）。命中的是「公演」不是艺人 → 检索词回显。
  const kwHtml = await fetchPiaText(buildPiaKeywordRlsInfoUrl(artist));
  return parsePiaRlsInfo(kwHtml, artist, 'query');
}

// 点开事件详情时懒加载：对【受付中】且还没精确日期的 Pia 轮次抓详情页补 applyStart/End/resultStart。
// best-effort：浏览器端会因 CORS 失败(getPiaDetail 返回 null)而原样返回；真机经 CapacitorHttp 可用。
export async function enrichPiaWindows(event: ActivityEvent): Promise<ActivityEvent> {
  const windows = event.ticketWindows ?? [];
  const targets = windows.filter(
    (w) => w.platform === 'Ticket Pia' && w.applyUrl && !w.applyStart && /受付中/.test(w.statusText ?? ''),
  );
  if (targets.length === 0) return event;
  const results = await Promise.allSettled(
    targets.slice(0, 4).map(async (w) => ({ id: w.id, detail: await getPiaDetail(w.applyUrl!) })),
  );
  const byId = new Map(windows.map((w) => [w.id, w] as const));
  let changed = false;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.detail && (r.value.detail.applyStart || r.value.detail.applyEnd)) {
      const w = byId.get(r.value.id);
      if (w) {
        byId.set(r.value.id, {
          ...w,
          applyStart: r.value.detail.applyStart,
          applyEnd: r.value.detail.applyEnd,
          resultStart: r.value.detail.resultStart ?? w.resultStart,
        });
        changed = true;
      }
    }
  }
  if (!changed) return event;
  const ticketWindows = [...byId.values()];
  return { ...event, ticketWindows, timeline: deriveTimelineFromWindows(ticketWindows) };
}

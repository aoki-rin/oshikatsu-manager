// 前端 Ticket Pia 平台搜索插件（Mihon 式）。两步：
//  1) search_all.do?kw=艺人 → 从内联 JS 解析 artistCd
//  2) artist/rlsInfo.do?apiRequest={artistCd} → HTML 片段(sales_list)，解析事件 + 发售/抽選轮次
// Pia 的 rlsInfo 给的是【状态】(抽選受付中/予定枚数終了)，精确受付締切日期需点详情页(getDetails，后续)。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';
import { deriveTimelineFromWindows, normalizeLiveEvent } from './shared';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80';

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const dec = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
const m1 = (s: string, re: RegExp): string | null => { const m = s.match(re); return m ? m[1] : null; };

// search_all.do 内联 JS: var artistArray = "[score: ..., artistcd: 49240081, ...]"
export function parsePiaArtistCd(searchHtml: string): string | null {
  return m1(searchHtml, /artistcd:\s*(\d+)/);
}

// 解析 rlsInfo.do 的 HTML 片段 → ActivityEvent[]
export function parsePiaRlsInfo(html: string, artist: string): ActivityEvent[] {
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
      const url = m1(seg, /<a href="([^"]+)"\s+itemprop="url"/);
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
    const base: ActivityEvent = {
      id: `pia-${bundle}`,
      title,
      artistId: `pia-artist-${artist}`,
      artistName: artist,
      venueId: `pia-venue-${bundle}`,
      venueName: region || '—',
      date: eventDate || '',
      time: '',
      region,
      platform: 'Ticket Pia',
      price: '—',
      imageUrl: PLACEHOLDER_IMG,
      timeline: {},
      ticketWindows: windows,
      originalUrl: `https://t.pia.jp/pia/event/event.do?eventBundleCd=${bundle}`,
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
    const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': UA }, connectTimeout: 10000, readTimeout: 15000 });
    const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    return parsePiaDetailDates(html);
  } catch {
    return null;
  }
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
  const artistCd = parsePiaArtistCd(searchHtml);
  if (!artistCd) return [];

  // 2) 取该艺人发售/抽選信息（注意：apiRequest 格式须与 Pia 一致——functions 不带引号）
  const apiRequest = `{functions:[{"functionId":"SA403001","parameters":{"page":1,"artistCd":"${artistCd}","includeSaleEnd":"fuzzy","mode":"2","dispMode":"1","responsive":"true"}}]}`;
  const r = await CapacitorHttp.get({
    url: 'https://t.pia.jp/pia/artist/rlsInfo.do',
    params: { apiRequest },
    headers: { 'User-Agent': UA },
    connectTimeout: 10000,
    readTimeout: 20000,
  });
  const html = typeof r.data === 'string' ? r.data : String(r.data ?? '');
  const events = parsePiaRlsInfo(html, artist);

  // 3) getDetails 富集：对【受付中】轮次抓详情页拿精确受付締切/結果発表（限量并发控延迟）
  const active: TicketWindow[] = [];
  for (const e of events)
    for (const w of e.ticketWindows)
      if (active.length < 4 && w.applyUrl && w.statusText && /受付中/.test(w.statusText)) active.push(w);
  await Promise.allSettled(
    active.map(async (w) => {
      const d = await getPiaDetail(w.applyUrl!);
      if (d && (d.applyStart || d.applyEnd)) {
        w.applyStart = d.applyStart;
        w.applyEnd = d.applyEnd;
        w.resultStart = d.resultStart;
      }
    })
  );
  return events.map((event) => normalizeLiveEvent({
    ...event,
    timeline: deriveTimelineFromWindows(event.ticketWindows || []),
  }, 'pia'));
}

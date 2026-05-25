// 前端 Ticket Pia 平台搜索插件（Mihon 式）。两步：
//  1) search_all.do?kw=艺人 → 从内联 JS 解析 artistCd
//  2) artist/rlsInfo.do?apiRequest={artistCd} → HTML 片段(sales_list)，解析事件 + 发售/抽選轮次
// Pia 的 rlsInfo 给的是【状态】(抽選受付中/予定枚数終了)，精确受付締切日期需点详情页(getDetails，后续)。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';

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
    events.push({
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
    });
  });

  return events;
}

export async function searchPia(artist: string): Promise<ActivityEvent[]> {
  // 1) 搜艺人拿 artistCd
  const s = await CapacitorHttp.get({
    url: 'https://t.pia.jp/pia/search_all.do',
    params: { kw: artist },
    headers: { 'User-Agent': UA },
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
  });
  const html = typeof r.data === 'string' ? r.data : String(r.data ?? '');
  return parsePiaRlsInfo(html, artist);
}

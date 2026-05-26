// 前端 TicketDive 平台搜索插件（Mihon 式）。
// ticketdive.com/search?q=艺人 是 Next.js 页面，结果在 __NEXT_DATA__.props.pageProps.__superjsonProps.json.eventList。
// 按 イベント/出演者/会場名 搜索；indie/地下偶像为主。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';
import { deriveTimelineFromWindows, normalizeLiveEvent } from './shared';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SEARCH_URL = 'https://ticketdive.com/search';
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80';

// salesStatus → 中文/日文状态文案
const STATUS: Record<string, string> = { coming: '発売予定', applied: '受付中', closed: '受付終了' };

// UTC ISO → JST 日期/时间
function toJst(iso: string | null | undefined, slice: [number, number]): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(slice[0], slice[1]);
}
const jstDate = (iso?: string | null) => toJst(iso, [0, 10]);
const jstTime = (iso?: string | null) => toJst(iso, [11, 16]);

export function parseTicketDiveSearch(html: string, artist: string): ActivityEvent[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let j: any;
  try { j = JSON.parse(m[1]); } catch { return []; }
  const list: any[] = j?.props?.pageProps?.__superjsonProps?.json?.eventList ?? [];

  return list.map((e): ActivityEvent => {
    const url = `https://ticketdive.com/event/${e.url}`;
    const statusText = STATUS[e.salesStatus] || e.salesStatus || undefined;
    const win: TicketWindow = {
      id: `td-${e.id}-0`,
      platform: 'TicketDive',
      roundType: '受付',
      statusText,
      applyStart: null,
      applyEnd: null,
      sourceUrl: url,
      applyUrl: url,
    };
    return normalizeLiveEvent({
      id: `td-${e.id}`,
      title: e.title || artist,
      artistId: `td-artist-${artist}`,
      artistName: artist,
      venueId: `td-venue-${e.id}`,
      venueName: e.venueName || '—',
      date: jstDate(e.startEventDate),
      time: jstTime(e.displayStageDate || e.startEventDate),
      region: '',
      platform: 'TicketDive',
      price: '—',
      imageUrl: e.imageSource || PLACEHOLDER_IMG,
      timeline: deriveTimelineFromWindows([win]),
      ticketWindows: [win],
      originalUrl: url,
      description: `${e.title}（TicketDive 平台实时搜索）`,
      category: 'Idol',
      tags: ['TicketDive', '实时'],
    }, 'ticketdive');
  });
}

export async function searchTicketDive(artist: string): Promise<ActivityEvent[]> {
  const res = await CapacitorHttp.get({
    url: SEARCH_URL,
    params: { q: artist },
    headers: { 'User-Agent': UA },
    connectTimeout: 10000,
    readTimeout: 20000,
  });
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return parseTicketDiveSearch(html, artist);
}

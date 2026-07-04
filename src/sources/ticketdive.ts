// 前端 TicketDive 平台搜索插件（Mihon 式）。
// ticketdive.com/search?q=艺人 是 Next.js 页面，结果在 __NEXT_DATA__.props.pageProps.__superjsonProps.json.eventList。
// 按 イベント/出演者/会場名 搜索；indie/地下偶像为主。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';
import { canonicalArtistId, canonicalVenueId, deriveTimelineFromWindows, normalizeLiveEvent } from './shared';

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

// TicketDive 的 __NEXT_DATA__ 最小结构（仅声明解析用到的字段）。
interface TicketDiveEvent {
  id?: string | number;
  url?: string;
  title?: string;
  venueName?: string;
  salesStatus?: string;
  startEventDate?: string | null;
  displayStageDate?: string | null;
  imageSource?: string;
}
interface TicketDiveArtist {
  name?: string;
}
interface TicketDiveNextData {
  props?: { pageProps?: { __superjsonProps?: { json?: { eventList?: TicketDiveEvent[]; artists?: TicketDiveArtist[] } } } };
}

export function parseTicketDiveSearch(html: string, artist: string): ActivityEvent[] {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let parsed: TicketDiveNextData;
  try { parsed = JSON.parse(m[1]) as TicketDiveNextData; } catch { return []; }
  const json = parsed.props?.pageProps?.__superjsonProps?.json ?? {};
  const list = json.eventList ?? [];
  // 响应自带 artists 匹配列表：唯一命中时，事件归属即平台确认 → 用真实艺人名
  //（TicketDive 按艺人检索；多命中/无命中时不敢断言，回退搜索词回显）。
  const soleArtist = (json.artists ?? []).length === 1 ? json.artists![0]?.name : undefined;
  const artistName = soleArtist || artist;
  const artistSource: ActivityEvent['artistSource'] = soleArtist ? 'platform' : 'query';

  return list.map((e): ActivityEvent => {
    const url = `https://ticketdive.com/event/${e.url ?? ''}`;
    const statusText = STATUS[e.salesStatus ?? ''] || e.salesStatus || undefined;
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
      title: e.title || artistName,
      artistId: canonicalArtistId(artistName) || `td-artist-${artistName}`,
      artistName,
      artistSource,
      venueId: canonicalVenueId(e.venueName) || `td-venue-${e.id}`,
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
      description: `${e.title ?? artist}（TicketDive 平台实时搜索）`,
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

// ---- 详情页(/event/<slug>)富集：取精确受付期间 ----
// 详情页 __NEXT_DATA__ 的 eventDetail.ticketInfoList[] 每个 plan 有 startApply/endApply（UTC ISO）。
// 搜索页只有粗略状态——点开详情时懒加载补齐（整体最早开始 / 最晚结束）。
interface TicketDiveTicketInfo { startApply?: string | null; endApply?: string | null }
interface TicketDiveDetailNext {
  props?: { pageProps?: { __superjsonProps?: { json?: { eventDetail?: { ticketInfoList?: TicketDiveTicketInfo[] } } } } };
}

function tdUtcToJstIso(utc: string | null | undefined): string | null {
  if (!utc) return null;
  const d = new Date(utc);
  if (isNaN(d.getTime())) return null;
  return `${new Date(d.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 19)}+09:00`;
}

export interface TicketDiveDetailWindow {
  applyStart: string | null;
  applyEnd: string | null;
}

// 纯函数：从详情页 HTML 的 __NEXT_DATA__ 解析整体受付期间。
export function parseTicketDiveDetailWindow(html: string): TicketDiveDetailWindow {
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { applyStart: null, applyEnd: null };
  let list: TicketDiveTicketInfo[] = [];
  try {
    const parsed = JSON.parse(m[1]) as TicketDiveDetailNext;
    list = parsed.props?.pageProps?.__superjsonProps?.json?.eventDetail?.ticketInfoList ?? [];
  } catch {
    return { applyStart: null, applyEnd: null };
  }
  const starts = list.map((t) => tdUtcToJstIso(t.startApply)).filter((v): v is string => !!v).sort();
  const ends = list.map((t) => tdUtcToJstIso(t.endApply)).filter((v): v is string => !!v).sort();
  return { applyStart: starts[0] ?? null, applyEnd: ends.pop() ?? null };
}

async function getTicketDiveDetail(url: string): Promise<TicketDiveDetailWindow | null> {
  try {
    const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': UA }, connectTimeout: 10000, readTimeout: 15000 });
    const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    return parseTicketDiveDetailWindow(html);
  } catch {
    return null;
  }
}

// 点开详情时懒加载：给还没精确日期的 TicketDive 窗口补 applyStart/applyEnd。best-effort（同上）。
export async function enrichTicketDiveWindows(event: ActivityEvent): Promise<ActivityEvent> {
  const windows = event.ticketWindows ?? [];
  // 聚合事件可能含多个 TicketDive 窗口（各自详情页不同）：逐个补，而不是只补第一个。
  const targets = windows.filter((w) => w.platform === 'TicketDive' && !w.applyStart && (w.sourceUrl || w.applyUrl));
  if (targets.length === 0) return event;
  const results = await Promise.allSettled(
    targets.slice(0, 5).map(async (w) => ({ id: w.id, detail: await getTicketDiveDetail((w.sourceUrl || w.applyUrl)!) })),
  );
  const byId = new Map(windows.map((w) => [w.id, w] as const));
  let changed = false;
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.detail && (r.value.detail.applyStart || r.value.detail.applyEnd)) {
      const w = byId.get(r.value.id);
      if (w) {
        byId.set(r.value.id, { ...w, applyStart: r.value.detail.applyStart, applyEnd: r.value.detail.applyEnd });
        changed = true;
      }
    }
  }
  if (!changed) return event;
  const ticketWindows = [...byId.values()];
  return { ...event, ticketWindows, timeline: deriveTimelineFromWindows(ticketWindows) };
}

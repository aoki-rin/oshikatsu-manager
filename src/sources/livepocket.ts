// 前端 LivePocket 平台搜索插件（Mihon 式）。
// 正确端点是 t.livepocket.jp/event/search?word=艺人（不是 /search?keyword=）——服务端渲染 HTML，CapacitorHttp 可抓。
// 卡片 <li class="item">：链接(/e/) + 图(thumb-vertical) + 状态(status-X 的 li) + 日期(M/D) + 标题(title-inner)。
// 注：M/D 无年份(推断)；精确受付窗口需详情页(后续)。indie/地下偶像为主。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';
import { canonicalArtistId, canonicalVenueId, decodeHtml, deriveTimelineFromWindows, normalizeLiveEvent } from './shared';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SEARCH_URL = 'https://t.livepocket.jp/event/search';
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=80';

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const m1 = (s: string, re: RegExp): string | null => { const m = s.match(re); return m ? m[1] : null; };
const normalizeSearchText = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

function includesQuery(title: string, venue: string, artist: string): boolean {
  const needle = normalizeSearchText(artist);
  if (!needle) return true;
  const haystack = normalizeSearchText(`${title} ${venue}`);
  return haystack.includes(needle);
}

// "5/29"(无年) → YYYY-MM-DD：今年若已过则推断为明年
function inferDate(md: string | null): string {
  const mm = md && md.match(/(\d{1,2})\/(\d{1,2})/);
  if (!mm) return '';
  const now = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const M = +mm[1], D = +mm[2];
  const todayStr = `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
  let cand = `${now.getFullYear()}-${p(M)}-${p(D)}`;
  if (cand < todayStr) cand = `${now.getFullYear() + 1}-${p(M)}-${p(D)}`;
  return cand;
}

export function parseLivePocketSearch(html: string, artist: string): ActivityEvent[] {
  const blocks = html.split('<li class="item">').slice(1);
  const events: ActivityEvent[] = [];
  blocks.forEach((b, i) => {
    const url = m1(b, /<a href="(https:\/\/t\.livepocket\.jp\/e\/[^"]+)"/);
    if (!url) return;
    const img = m1(b, /class="thumb-vertical" src="([^"]+)"/);
    const titleRaw = m1(b, /class="title-inner">([\s\S]*?)<\/span>/);
    const title = titleRaw ? stripTags(titleRaw) : artist;
    const sm = b.match(/<ul class="status-[a-z_]+">\s*<li>([^<]*)<\/li>\s*<li>([^<]*)<\/li>/);
    const statusText = sm ? sm[1].trim() : undefined;
    const date = inferDate(sm ? sm[2].trim() : null);
    const venueRaw = m1(b, /class="info"[^>]*>([\s\S]*?)<\/(?:div|ul|p)>/);
    const venue = venueRaw ? stripTags(venueRaw).slice(0, 30) : '—';
    if (!includesQuery(title, venue, artist)) return;
    const slug = url.split('/e/')[1] || String(i);
    const win: TicketWindow = {
      id: `lp-${slug}-0`,
      platform: 'LivePocket',
      roundType: '受付',
      statusText,
      applyStart: null,
      applyEnd: null,
      sourceUrl: url,
      applyUrl: url,
    };
    events.push(normalizeLiveEvent({
      id: `lp-${slug}`,
      title,
      artistId: canonicalArtistId(artist) || `lp-artist-${artist}`,
      artistName: artist,
      venueId: canonicalVenueId(venue) || `lp-venue-${slug}`,
      venueName: venue,
      date,
      time: '',
      region: '',
      platform: 'LivePocket',
      price: '—',
      imageUrl: img || PLACEHOLDER_IMG,
      timeline: deriveTimelineFromWindows([win]),
      ticketWindows: [win],
      originalUrl: url,
      description: `${title}（LivePocket 平台实时搜索）`,
      category: 'Idol',
      tags: ['LivePocket', '实时'],
    }, 'livepocket'));
  });
  return events;
}

export async function searchLivePocket(artist: string): Promise<ActivityEvent[]> {
  const res = await CapacitorHttp.get({
    url: SEARCH_URL,
    params: { word: artist },
    headers: { 'User-Agent': UA },
    connectTimeout: 10000,
    readTimeout: 20000,
  });
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return parseLivePocketSearch(html, artist);
}

// ---- 详情页(/e/<slug>)富集：取精确受付期间 ----
// 详情页内嵌实体编码 JSON：各售票 plan 的 starttime/endtime + 整体 group_starttime/group_endtime
// （"YYYY-MM-DD HH:MM:SS" JST）。搜索页只有粗略状态，没有精确窗口——点开详情时懒加载补齐。
function lpJstIso(value: string): string | null {
  const m = value.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+09:00` : null;
}

export interface LivePocketDetailWindow {
  applyStart: string | null;
  applyEnd: string | null;
}

// 纯函数：从详情页 HTML 解析整体受付期间（最早开始 / 最晚结束）。
export function parseLivePocketDetailWindow(html: string): LivePocketDetailWindow {
  const text = decodeHtml(html); // &quot; → " ，让内嵌 JSON 能被正则命中
  const starts = [...text.matchAll(/"(?:group_)?starttime"\s*:\s*"([\d :-]+)"/g)]
    .map((m) => lpJstIso(m[1])).filter((v): v is string => !!v).sort();
  const ends = [...text.matchAll(/"(?:group_)?endtime"\s*:\s*"([\d :-]+)"/g)]
    .map((m) => lpJstIso(m[1])).filter((v): v is string => !!v).sort();
  return { applyStart: starts[0] ?? null, applyEnd: ends.pop() ?? null };
}

async function getLivePocketDetail(url: string): Promise<LivePocketDetailWindow | null> {
  try {
    const res = await CapacitorHttp.get({ url, headers: { 'User-Agent': UA }, connectTimeout: 10000, readTimeout: 15000 });
    const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
    return parseLivePocketDetailWindow(html);
  } catch {
    return null;
  }
}

// 点开详情时懒加载：给还没精确日期的 LivePocket 窗口补 applyStart/applyEnd。
// best-effort：网页端 CORS 失败则原样返回；真机经 CapacitorHttp 可用。
export async function enrichLivePocketWindows(event: ActivityEvent): Promise<ActivityEvent> {
  const windows = event.ticketWindows ?? [];
  // 聚合事件可能含多个 LivePocket 窗口（各自详情页不同）：逐个补，而不是只补第一个。
  const targets = windows.filter((w) => w.platform === 'LivePocket' && !w.applyStart && (w.sourceUrl || w.applyUrl));
  if (targets.length === 0) return event;
  const results = await Promise.allSettled(
    targets.slice(0, 5).map(async (w) => ({ id: w.id, detail: await getLivePocketDetail((w.sourceUrl || w.applyUrl)!) })),
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

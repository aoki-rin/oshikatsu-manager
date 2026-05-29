// 前端 eplus 平台搜索插件（Mihon 式）。
// 用 CapacitorHttp 发请求：真机(原生)绕开 CORS + 走真机网络；浏览器端会因 CORS 失败（属正常，去真机测）。
// 解析逻辑与 scraper/sources/eplus.mjs 同源：eplus 搜索页内嵌 application/json，data.record_list 直接含多轮受付。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';
import { deriveTimelineFromWindows, normalizeLiveEvent } from './shared';

const SEARCH_URL = 'https://eplus.jp/sf/search';
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80';

// "20260216120000"(JST) -> "2026-02-16T12:00:00+09:00"
function dtToIso(s?: string | null): string | null {
  if (!s || s.length < 8) return null;
  const y = s.slice(0, 4), mo = s.slice(4, 6), d = s.slice(6, 8);
  const h = s.slice(8, 10) || '00', mi = s.slice(10, 12) || '00', se = s.slice(12, 14) || '00';
  return `${y}-${mo}-${d}T${h}:${mi}:${se}+09:00`;
}
const ymd = (s?: string | null) => (s && s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : '');
const hm = (s?: string | null) => (s && s.length >= 4 ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : '');
const dec = (s: unknown): string =>
  typeof s === 'string'
    ? s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    : '';

interface EplusEvent {
  eventId: string;
  title: string;
  date: string;
  time: string;
  venue: string;
  prefecture: string;
  detailUrl: string | null;
  ticketWindows: TicketWindow[];
}

// eplus 搜索页内嵌 JSON 的最小结构（仅声明解析用到的字段，其余忽略）。
interface EplusRound {
  uketsuke_name_pc?: string;
  uketsuke_name_mobile?: string;
  hambai_hoho_label?: string;
  uketsuke_start_datetime?: string | null;
  uketsuke_end_datetime?: string | null;
  info_kokai_start_datetime?: string | null;
  info_kokai_end_datetime?: string | null;
}
interface EplusRecord {
  kogyo_code?: string;
  koen_code?: string;
  koenbi_term?: string;
  kaien_time?: string;
  kanren_kogyo_sub?: { kogyo_name_1?: string; kogyo_name_2?: string };
  kanren_venue?: { venue_name?: string; todofuken_name?: string; venue_code?: string };
  koen_detail_url_pc?: string | null;
  kanren_uketsuke_koen_list?: EplusRound[];
}
interface EplusSearchJson {
  data?: { record_list?: EplusRecord[] };
}

// 纯函数：从 eplus 搜索 HTML(内嵌 JSON) 解析事件 + 多轮窗口
export function parseEplusSearch(html: string, query: string): EplusEvent[] {
  const m = html.match(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return [];
  let parsed: EplusSearchJson;
  try { parsed = JSON.parse(m[1]) as EplusSearchJson; } catch { return []; }
  const list = parsed.data?.record_list ?? [];

  return list.map((r): EplusEvent => {
    const sub = r.kanren_kogyo_sub ?? {};
    const venue = r.kanren_venue ?? {};
    const rounds = r.kanren_uketsuke_koen_list ?? [];
    // 唯一 id：同巡演多场次要区分（加日期 + 场馆 code）
    const eventId = `eplus-${r.kogyo_code}-${r.koenbi_term || ''}-${venue.venue_code || r.koen_code || ''}`;
    const ticketWindows: TicketWindow[] = rounds.map((u, i) => ({
      id: `${eventId}-${i}`,
      platform: 'eplus',
      roundType: dec(u.uketsuke_name_pc || u.uketsuke_name_mobile || u.hambai_hoho_label || '受付'),
      labelRaw: dec(u.hambai_hoho_label) || undefined,
      applyStart: dtToIso(u.uketsuke_start_datetime),
      applyEnd: dtToIso(u.uketsuke_end_datetime),
      resultStart: dtToIso(u.info_kokai_start_datetime),
      resultEnd: dtToIso(u.info_kokai_end_datetime),
      sourceUrl: r.koen_detail_url_pc || undefined,
      applyUrl: r.koen_detail_url_pc || undefined,
    }));
    return {
      eventId,
      title: dec(`${sub.kogyo_name_1 ?? ''}${sub.kogyo_name_2 ? ` ${sub.kogyo_name_2}` : ''}`) || query,
      date: ymd(r.koenbi_term),
      time: hm(r.kaien_time),
      venue: dec(venue.venue_name) || '—',
      prefecture: dec(venue.todofuken_name) || '',
      detailUrl: r.koen_detail_url_pc || null,
      ticketWindows,
    };
  });
}

// 把 eplus 事件映射成 app 的 ActivityEvent（含派生 timeline 给卡片倒计时用）
function toActivityEvent(e: EplusEvent, query: string): ActivityEvent {
  const fallbackDate = e.ticketWindows.find((window) => window.applyEnd)?.applyEnd?.slice(0, 10) || '';
  const base: ActivityEvent = {
    id: e.eventId,
    title: e.title,
    artistId: `eplus-artist-${query}`,
    artistName: query,
    venueId: `eplus-venue-${e.eventId}`,
    venueName: e.venue,
    date: e.date || fallbackDate,
    time: e.time || '18:00',
    region: e.prefecture,
    platform: 'eplus',
    price: '—',
    imageUrl: PLACEHOLDER_IMG,
    timeline: deriveTimelineFromWindows(e.ticketWindows),
    ticketWindows: e.ticketWindows,
    originalUrl: e.detailUrl || 'https://eplus.jp/',
    description: `${e.title}（eplus 平台实时搜索结果）`,
    category: 'J-Pop',
    tags: ['eplus', '实时'],
  };
  return normalizeLiveEvent(base, 'eplus');
}

// 入口：search(artist) → ActivityEvent[]
export async function searchEplus(artist: string): Promise<ActivityEvent[]> {
  const res = await CapacitorHttp.get({
    url: SEARCH_URL,
    params: { keyword: artist },
    headers: { 'User-Agent': DESKTOP_UA },
    connectTimeout: 10000,
    readTimeout: 20000,
  });
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return parseEplusSearch(html, artist).map((e) => toActivityEvent(e, artist));
}

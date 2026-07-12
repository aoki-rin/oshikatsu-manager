// 前端 LivePocket 平台搜索插件（Mihon 式）。
// 2026-07 新版站点（livepocket.jp，旧 t.livepocket.jp 已挂【旧サイト】标且数据残缺）：
//  - 搜索：livepocket.jp/event/search?word=艺人（服务端渲染）。结果卡 = <li class="event-card-list__item">，
//    页面下方的「ピックアップ/新着」轮播用别的 item 类，不能混进结果。
//  - 卡片字段全面升级：完整日期(含年!)、開演时间、会場（都道府県）、出演者（真实艺人名 →
//    artistSource:'platform'）、販売状态 tag（販売中/販売前/売切/終了）。
//  - 详情页 /e/<slug>：#ticket 区每轮一个 event-detail-ticket__item（轮次名 + 状态 + 販売受付期間
//    起〜止），旧站的内嵌 starttime/endtime JSON 在新站已移除（保留旧解析作 legacy 兜底）。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';
import { canonicalArtistId, canonicalVenueId, decodeHtml, deriveTimelineFromWindows, looksLikeAntiBot, normalizeLiveEvent } from './shared';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const BASE_URL = 'https://livepocket.jp';
const SEARCH_URL = `${BASE_URL}/event/search`;
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=80';

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const m1 = (s: string, re: RegExp): string | null => { const m = s.match(re); return m ? m[1] : null; };
const normalizeSearchText = (s: string) => s.normalize('NFKC').toLowerCase().replace(/\s+/g, '');

// 旧持久化事件里的 t.livepocket.jp 链接 → 新域名（旧域名只剩残缺的【旧サイト】页面）。
export function toNewLivePocketUrl(url: string): string {
  return url.replace('//t.livepocket.jp', '//livepocket.jp');
}

// 卡片字段行：<span class="event-card__date">日程</span> 2026年3月28日(土) —— 取 label 后的文本
function cardField(block: string, cls: string): string | null {
  const m = block.match(new RegExp(`class="event-card__${cls}">[^<]*</span>([^<]+)`));
  return m ? decodeHtml(m[1]).replace(/\s+/g, ' ').trim() : null;
}

// "2026年3月28日(土)" → "2026-03-28"（新站带完整年份，不再需要推断）
function parseJpDate(text: string | null): string {
  const m = text && text.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return '';
  const p = (n: string) => n.padStart(2, '0');
  return `${m[1]}-${p(m[2])}-${p(m[3])}`;
}

// 出演者列表里挑与查询匹配的真实艺人名；没匹配上取第一位（仍是平台真实出演者）。
function pickArtistFromCast(cast: string | null, query: string): { name: string; source: 'platform' | 'query' } {
  const names = (cast || '').split(/[/／、,]|\s{2,}/).map((s) => s.trim()).filter(Boolean);
  if (names.length === 0) return { name: query, source: 'query' };
  const needle = normalizeSearchText(query);
  const hit = names.find((n) => normalizeSearchText(n).includes(needle) || needle.includes(normalizeSearchText(n)));
  return { name: hit || names[0], source: 'platform' };
}

function includesQuery(haystackParts: Array<string | null>, artist: string): boolean {
  const needle = normalizeSearchText(artist);
  if (!needle) return true;
  return normalizeSearchText(haystackParts.filter(Boolean).join(' ')).includes(needle);
}

export function parseLivePocketSearch(html: string, artist: string): ActivityEvent[] {
  // 只取搜索结果区（event-card-list__item）；ピックアップ/新着轮播是别的 item 类，天然排除。
  const blocks = html.split('event-card-list__item').slice(1);
  const events: ActivityEvent[] = [];
  blocks.forEach((b, i) => {
    const href = m1(b, /href="((?:https?:\/\/[^"]*)?\/e\/[^"]+)"/);
    if (!href) return;
    const url = href.startsWith('http') ? toNewLivePocketUrl(href) : `${BASE_URL}${href}`;
    const title = decodeHtml(m1(b, /event-card__title">([\s\S]*?)<\/h3>/) || '').trim() || artist;
    const statusText = m1(b, /event-card__tag">([^<]+)</)?.trim() || undefined;
    const img = m1(b, /<img[^>]*src="(https?:\/\/[^"]+)"/);
    const date = parseJpDate(cardField(b, 'date'));
    const time = m1(cardField(b, 'time') || '', /(\d{1,2}:\d{2})/) || '';
    const placeRaw = cardField(b, 'place') || '';
    const region = placeRaw.match(/[（(]([^）)]+[都道府県])[）)]\s*$/)?.[1] || '';
    const venue = placeRaw.replace(/[（(][^）)]+[）)]\s*$/, '').trim() || '—';
    const cast = cardField(b, 'cast');
    if (!includesQuery([title, venue, cast], artist)) return;

    const { name: artistName, source: artistSource } = pickArtistFromCast(cast, artist);
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
      artistId: canonicalArtistId(artistName) || `lp-artist-${artistName}`,
      artistName,
      artistSource,
      venueId: canonicalVenueId(venue) || `lp-venue-${slug}`,
      venueName: venue,
      date,
      time,
      region,
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
  // 直连遇 403/503/挑战页 → 抛错(归 source error),别把拦截页解析成空数组被上层误标 empty(#72)。
  if (looksLikeAntiBot(html, res.status).blocked) {
    throw new Error('LivePocket 直连返回反爬/异常内容（配置代理或用平台跳转继续搜索）');
  }
  return parseLivePocketSearch(html, artist);
}

// ---- 详情页(/e/<slug>)富集：#ticket 区逐轮解析販売受付期間 ----
function lpJstIso(y: string, mo: string, d: string, h: string, mi: string): string {
  const p = (n: string) => n.padStart(2, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${mi}:00+09:00`;
}

export interface LivePocketDetailRound {
  roundType: string; // 如「先着販売受付」
  statusText?: string; // 販売中 / 販売前 / 売切 / 終了
  applyStart: string | null;
  applyEnd: string | null;
}

// 纯函数：新版详情页 #ticket 区 → 每轮 {轮次名, 状态, 販売受付期間 起/止}
export function parseLivePocketDetailRounds(html: string): LivePocketDetailRound[] {
  const items = html.split('event-detail-ticket__item').slice(1);
  const rounds: LivePocketDetailRound[] = [];
  for (const item of items) {
    const titleRaw = m1(item, /event-detail-ticket-head__title">([\s\S]*?)<\/h3>/);
    const afterLabel = titleRaw ? titleRaw.split('</span>').pop() : null;
    const roundType = decodeHtml((afterLabel || titleRaw || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim() || '受付';
    const statusText = m1(item, /event-detail-ticket-head__status">\s*<span[^>]*>([^<]+)</)?.trim() || undefined;
    const periodRaw = m1(item, /販売受付期間<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/);
    const times = periodRaw
      ? [...periodRaw.matchAll(/(\d{4})年(\d{1,2})月(\d{1,2})日[^\d]*?(\d{1,2}):(\d{2})/g)]
      : [];
    const applyStart = times[0] ? lpJstIso(times[0][1], times[0][2], times[0][3], times[0][4], times[0][5]) : null;
    const last = times.length > 1 ? times[times.length - 1] : null;
    const applyEnd = last ? lpJstIso(last[1], last[2], last[3], last[4], last[5]) : null;
    if (roundType || applyStart || applyEnd) rounds.push({ roundType, statusText, applyStart, applyEnd });
  }
  return rounds.filter((round) => round.applyStart || round.applyEnd || round.statusText);
}

// legacy 兜底：旧站详情页内嵌实体编码 JSON（starttime/endtime）。旧域名页面仍可能吐这种格式。
export interface LivePocketDetailWindow {
  applyStart: string | null;
  applyEnd: string | null;
}

export function parseLivePocketDetailWindow(html: string): LivePocketDetailWindow {
  const text = decodeHtml(html);
  const toIso = (v: string) => {
    const m = v.match(/(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] || '00'}+09:00` : null;
  };
  const starts = [...text.matchAll(/"(?:group_)?starttime"\s*:\s*"([\d :-]+)"/g)]
    .map((m) => toIso(m[1])).filter((v): v is string => !!v).sort();
  const ends = [...text.matchAll(/"(?:group_)?endtime"\s*:\s*"([\d :-]+)"/g)]
    .map((m) => toIso(m[1])).filter((v): v is string => !!v).sort();
  return { applyStart: starts[0] ?? null, applyEnd: ends.pop() ?? null };
}

async function fetchDetailHtml(url: string): Promise<string | null> {
  try {
    const res = await CapacitorHttp.get({
      url: toNewLivePocketUrl(url),
      headers: { 'User-Agent': UA },
      connectTimeout: 10000,
      readTimeout: 15000,
    });
    return typeof res.data === 'string' ? res.data : String(res.data ?? '');
  } catch {
    return null;
  }
}

// 点开详情时懒加载：把搜索页占位窗口展开成详情页的多轮受付（含精确起止）。
// 占位窗口没有日期 → 不可能已挂提醒，替换窗口 id 安全。新版解析不到时退回 legacy JSON。
// best-effort：网页端 CORS 失败原样返回；真机经 CapacitorHttp 可用。
export async function enrichLivePocketWindows(event: ActivityEvent): Promise<ActivityEvent> {
  const windows = event.ticketWindows ?? [];
  const targets = windows.filter((w) => w.platform === 'LivePocket' && !w.applyStart && (w.sourceUrl || w.applyUrl));
  if (targets.length === 0) return event;

  const detailByWindowId = new Map<string, LivePocketDetailRound[]>();
  await Promise.all(targets.slice(0, 5).map(async (w) => {
    const url = (w.sourceUrl || w.applyUrl)!;
    const html = await fetchDetailHtml(url);
    if (!html) return;
    let rounds = parseLivePocketDetailRounds(html);
    if (rounds.filter((r) => r.applyStart || r.applyEnd).length === 0) {
      const legacy = parseLivePocketDetailWindow(html);
      if (legacy.applyStart || legacy.applyEnd) {
        rounds = [{ roundType: w.roundType || '受付', statusText: w.statusText, ...legacy }];
      }
    }
    if (rounds.length > 0) detailByWindowId.set(w.id, rounds);
  }));
  if (detailByWindowId.size === 0) return event;

  const ticketWindows = windows.flatMap((w) => {
    const rounds = detailByWindowId.get(w.id);
    if (!rounds) return [w];
    const stem = w.id.replace(/-\d+$/, '');
    return rounds.map((round, i): TicketWindow => ({
      id: `${stem}-${i}`,
      platform: 'LivePocket',
      roundType: round.roundType,
      statusText: round.statusText ?? w.statusText,
      applyStart: round.applyStart,
      applyEnd: round.applyEnd,
      sourceUrl: w.sourceUrl,
      applyUrl: w.applyUrl,
    }));
  });
  return { ...event, ticketWindows, timeline: deriveTimelineFromWindows(ticketWindows) };
}

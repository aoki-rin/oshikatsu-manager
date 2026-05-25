// 前端 LivePocket 平台搜索插件（Mihon 式）。
// 正确端点是 t.livepocket.jp/event/search?word=艺人（不是 /search?keyword=）——服务端渲染 HTML，CapacitorHttp 可抓。
// 卡片 <li class="item">：链接(/e/) + 图(thumb-vertical) + 状态(status-X 的 li) + 日期(M/D) + 标题(title-inner)。
// 注：M/D 无年份(推断)；精确受付窗口需详情页(后续)。indie/地下偶像为主。
import { CapacitorHttp } from '@capacitor/core';
import type { ActivityEvent, TicketWindow } from '../types';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SEARCH_URL = 'https://t.livepocket.jp/event/search';
const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=80';

const stripTags = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const m1 = (s: string, re: RegExp): string | null => { const m = s.match(re); return m ? m[1] : null; };

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
    events.push({
      id: `lp-${slug}`,
      title,
      artistId: `lp-artist-${artist}`,
      artistName: artist,
      venueId: `lp-venue-${slug}`,
      venueName: venue,
      date,
      time: '',
      region: '',
      platform: 'LivePocket',
      price: '—',
      imageUrl: img || PLACEHOLDER_IMG,
      timeline: {},
      ticketWindows: [win],
      originalUrl: url,
      description: `${title}（LivePocket 平台实时搜索）`,
      category: 'Idol',
      tags: ['LivePocket', '实时'],
    });
  });
  return events;
}

export async function searchLivePocket(artist: string): Promise<ActivityEvent[]> {
  const res = await CapacitorHttp.get({
    url: SEARCH_URL,
    params: { word: artist },
    headers: { 'User-Agent': UA },
  });
  const html = typeof res.data === 'string' ? res.data : String(res.data ?? '');
  return parseLivePocketSearch(html, artist);
}

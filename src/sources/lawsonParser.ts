import type { ActivityEvent, TicketWindow } from '../types';
import {
  absoluteUrl,
  buildPlatformSearchUrl,
  canonicalArtistId,
  canonicalVenueId,
  decodeHtml,
  deriveTimelineFromWindows,
  normalizeLiveEvent,
  stripTags,
} from './shared';

const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80';

const z2 = (value: string | number) => String(value).padStart(2, '0');

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

function lawsonIso(value: string): string | null {
  const normalized = normalizeDigits(value).normalize('NFKC');
  const match = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${z2(match[2])}-${z2(match[3])}T${z2(match[4])}:${match[5]}:00+09:00`;
}

function lawsonDate(value: string): string {
  const normalized = normalizeDigits(value).normalize('NFKC');
  const match = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return match ? `${match[1]}-${z2(match[2])}-${z2(match[3])}` : '';
}

function firstMatch(value: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return decodeHtml(stripTags(match[1])).trim();
  }
  return '';
}

function allResultBlocks(html: string): string[] {
  const explicit = [
    ...html.matchAll(/<section[^>]*class="[^"]*search-result-item[^"]*"[^>]*>([\s\S]*?)<\/section>/gi),
  ].map((match) => match[1]);
  if (explicit.length > 0) return explicit;

  return html
    .replace(/<h3/gi, '\n@@LAWSON_H3@@<h3')
    .split('@@LAWSON_H3@@')
    .filter((block) => /公演日|受付期間|申込\/詳細|お申し込みはこちら/.test(block));
}

function extractTitle(block: string, query: string): string {
  return firstMatch(block, [
    /<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i,
    /<h3[^>]*>([\s\S]*?)<\/h3>/i,
    /###\s*([^\n]+)/,
  ]) || query;
}

function extractHref(block: string, fallback: RegExp): string | null {
  const anchors = [...block.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const applyAnchor = anchors.find((anchor) => {
    const href = anchor[1];
    const label = decodeHtml(stripTags(anchor[2]));
    return /お申し込み|申込/.test(label) || /\/(?:order|entry)\//i.test(href);
  });
  const href = applyAnchor?.[1] || block.match(fallback)?.[1];
  return absoluteUrl(href || null);
}

function extractSourceHref(block: string): string | null {
  const h3 = block.match(/<h3[^>]*>\s*<a[^>]+href="([^"]+)"/i)?.[1];
  const href = h3 || block.match(/href="([^"]*mevent[^"]*)"/i)?.[1];
  return absoluteUrl(href || null);
}

function extractWindow(block: string, eventId: string): TicketWindow | null {
  const text = decodeHtml(stripTags(block)).normalize('NFKC');
  const range = text.match(/(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)?\s*\d{1,2}:\d{2})\s*[~～〜]\s*(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)?\s*\d{1,2}:\d{2})/);
  if (!range) return null;
  const methodMatch = text.match(/販売方法\s*([^\n]*?)(?:受付期間|発売前|発売中|申込\/詳細)/);
  const statusMatch = text.match(/(発売前|発売中|受付中|予定枚数終了|販売終了)/);
  const roundType = methodMatch?.[1]?.replace(/\s+/g, ' ').trim() || (/先着/.test(text) ? '先着' : '受付');
  const applyUrl = extractHref(block, /href="([^"]*(?:order|entry|ticket|event)[^"]*)"/i);
  const sourceUrl = extractSourceHref(block) || applyUrl || buildPlatformSearchUrl('Lawson Ticket', '');
  return {
    id: `${eventId}-0`,
    platform: 'Lawson Ticket',
    roundType,
    labelRaw: methodMatch?.[1]?.trim(),
    applyStart: lawsonIso(range[1]),
    applyEnd: lawsonIso(range[2]),
    statusText: statusMatch?.[1],
    sourceUrl,
    applyUrl,
  };
}

export function isLawsonZeroResults(html: string): boolean {
  const text = decodeHtml(stripTags(html)).normalize('NFKC');
  return /検索結果[:：]\s*0\s*件|条件に一致する|該当する公演はありません|見つかりませんでした/.test(text);
}

export function parseLawsonSearch(html: string, query: string, fetchedAt = new Date().toISOString()): ActivityEvent[] {
  const blocks = allResultBlocks(html);
  const events: ActivityEvent[] = [];
  blocks.forEach((block, index) => {
    const title = extractTitle(block, query);
    const text = decodeHtml(stripTags(block));
    const detailUrl = extractSourceHref(block) || buildPlatformSearchUrl('Lawson Ticket', query);
    const code = detailUrl.match(/(?:mid|lcd|gLcode)=?(\d+)/)?.[1] || String(index);
    const eventId = `lawson-${code}`;
    const venue = firstMatch(text, [
      /会場[:：]\s*([\s\S]*?)(?:販売方法|受付期間|申込\/詳細|$)/,
    ]) || '—';
    const date = lawsonDate(firstMatch(text, [/公演日[:：]\s*([\s\S]*?)(?:会場|販売方法|$)/]));
    const window = extractWindow(block, eventId);
    const windows = window ? [window] : [];
    const purchaseUrl = window?.applyUrl || detailUrl;
    if (!title || (!date && windows.length === 0)) return;
    events.push(normalizeLiveEvent({
      id: eventId,
      title,
      artistId: canonicalArtistId(query) || `lawson-artist-${query}`,
      artistName: query,
      artistSource: 'query',
      venueId: canonicalVenueId(venue) || `lawson-venue-${code}`,
      venueName: venue,
      date: date || windows[0]?.applyEnd?.slice(0, 10) || '',
      time: '00:00',
      region: venue.match(/[（(]([^）)]+)[）)]/)?.[1] || '',
      platform: 'Lawson Ticket',
      price: '—',
      imageUrl: PLACEHOLDER_IMG,
      timeline: deriveTimelineFromWindows(windows),
      ticketWindows: windows,
      originalUrl: detailUrl,
      description: `${title}（Lawson Ticket 平台实时搜索结果）`,
      category: 'J-Pop',
      tags: ['Lawson Ticket', '实时'],
      purchaseUrl,
    }, 'lawson', fetchedAt));
  });
  return events;
}

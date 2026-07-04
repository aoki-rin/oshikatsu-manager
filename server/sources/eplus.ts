import type { ActivityEvent, TicketWindow } from '../../src/types';
import { buildPlatformSearchUrl, canonicalArtistId, canonicalVenueId, deriveTimelineFromWindows, normalizeLiveEvent } from '../../src/sources/shared';
import { parseEplusSearch } from '../../src/sources/eplus';
import type { ServerTicketSource } from '../types';

const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80';

export const eplusSource: ServerTicketSource = {
  id: 'eplus',
  platform: 'eplus',
  parserVersion: 'eplus-json-v1',
  buildSearchUrl: (query) => buildPlatformSearchUrl('eplus', query),
  async search(query, ctx): Promise<ActivityEvent[]> {
    const html = await ctx.fetchText(this.buildSearchUrl(query));
    return parseEplusSearch(html, query).map((event) => {
      const ticketWindows = event.ticketWindows as TicketWindow[];
      const fallbackDate = ticketWindows.find((window) => window.applyEnd)?.applyEnd?.slice(0, 10) || '';
      return normalizeLiveEvent({
        id: event.eventId,
        title: event.title,
        // 与客户端对齐（QA #1）：eplus 无出演者字段，艺人名=搜索词回显 → 标 'query'，
        // 否则代理路径的结果会在 UI 里冒充 ⭐ 真实艺人。
        artistId: canonicalArtistId(query) || `eplus-artist-${query}`,
        artistName: query,
        artistSource: 'query',
        venueId: canonicalVenueId(event.venue) || `eplus-venue-${event.eventId}`,
        venueName: event.venue,
        date: event.date || fallbackDate,
        time: event.time || '18:00',
        region: event.prefecture,
        platform: 'eplus',
        price: '—',
        imageUrl: PLACEHOLDER_IMG,
        timeline: deriveTimelineFromWindows(ticketWindows),
        ticketWindows,
        originalUrl: event.detailUrl || this.buildSearchUrl(query),
        description: `${event.title}（eplus 平台代理搜索结果）`,
        category: 'J-Pop',
        tags: ['eplus', '代理'],
      }, 'eplus', ctx.fetchedAt);
    });
  },
};

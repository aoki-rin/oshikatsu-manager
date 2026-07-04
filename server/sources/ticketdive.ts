import { buildPlatformSearchUrl } from '../../src/sources/shared';
import { parseTicketDiveSearch } from '../../src/sources/ticketdive';
import type { ServerTicketSource } from '../types';

export const ticketDiveSource: ServerTicketSource = {
  id: 'ticketdive',
  platform: 'TicketDive',
  parserVersion: 'ticketdive-nextdata-v2', // v2：artists 唯一命中 → 平台真实艺人名
  buildSearchUrl: (query) => buildPlatformSearchUrl('TicketDive', query),
  async search(query, ctx) {
    const html = await ctx.fetchText(this.buildSearchUrl(query));
    return parseTicketDiveSearch(html, query).map((event) => ({
      ...event,
      lastFetchedAt: ctx.fetchedAt,
    }));
  },
};

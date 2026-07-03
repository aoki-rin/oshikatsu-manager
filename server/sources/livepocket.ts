import { buildPlatformSearchUrl } from '../../src/sources/shared';
import { parseLivePocketSearch } from '../../src/sources/livepocket';
import type { ServerTicketSource } from '../types';

export const livePocketSource: ServerTicketSource = {
  id: 'livepocket',
  platform: 'LivePocket',
  parserVersion: 'livepocket-html-v2', // 2026-07 新版站点（livepocket.jp event-card 结构）
  buildSearchUrl: (query) => buildPlatformSearchUrl('LivePocket', query),
  async search(query, ctx) {
    const html = await ctx.fetchText(this.buildSearchUrl(query));
    return parseLivePocketSearch(html, query).map((event) => ({
      ...event,
      lastFetchedAt: ctx.fetchedAt,
    }));
  },
};

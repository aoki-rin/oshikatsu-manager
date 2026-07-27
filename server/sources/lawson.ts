import type { ActivityEvent } from '../../src/types';
import { buildPlatformSearchUrl } from '../../src/sources/shared';
import { isLawsonZeroResults, parseLawsonSearch } from '../../src/sources/lawsonParser';
import { PlatformSearchError, type ServerTicketSource } from '../types';

export const lawsonSource: ServerTicketSource = {
  id: 'lawson',
  platform: 'Lawson Ticket',
  parserVersion: 'lawson-html-v2', // 2026-07 现行 ResultBox 结构（每公演一事件、每轮一窗口）
  buildSearchUrl: (query) => buildPlatformSearchUrl('Lawson Ticket', query),
  async search(query, ctx): Promise<ActivityEvent[]> {
    const url = this.buildSearchUrl(query);
    const html = await ctx.fetchText(url);
    const events = parseLawsonSearch(html, query, ctx.fetchedAt);
    if (events.length === 0 && isLawsonZeroResults(html)) return [];
    if (events.length === 0) {
      throw new PlatformSearchError('error', 'ローチケ搜索页结构无法识别，请打开平台搜索核对');
    }
    return events;
  },
};

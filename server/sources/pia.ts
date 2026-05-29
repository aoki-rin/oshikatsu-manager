import { buildPlatformSearchUrl, deriveTimelineFromWindows, normalizeLiveEvent } from '../../src/sources/shared';
import { parsePiaArtistCd, parsePiaRlsInfo } from '../../src/sources/pia';
import type { ServerTicketSource } from '../types';

function piaRlsInfoUrl(artistCd: string): string {
  const apiRequest = `{functions:[{"functionId":"SA403001","parameters":{"page":1,"artistCd":"${artistCd}","includeSaleEnd":"fuzzy","mode":"2","dispMode":"1","responsive":"true"}}]}`;
  const url = new URL('https://t.pia.jp/pia/artist/rlsInfo.do');
  url.searchParams.set('apiRequest', apiRequest);
  return url.toString();
}

export const piaSource: ServerTicketSource = {
  id: 'pia',
  platform: 'Ticket Pia',
  parserVersion: 'pia-html-v1',
  buildSearchUrl: (query) => buildPlatformSearchUrl('Ticket Pia', query),
  async search(query, ctx) {
    const searchHtml = await ctx.fetchText(this.buildSearchUrl(query));
    const artistCd = parsePiaArtistCd(searchHtml);
    if (!artistCd) return [];

    // 搜索阶段只取 rlsInfo（轻量、快）。精确受付日期改为点开事件详情时再懒加载，
    // 避免在搜索时为每个「受付中」轮次额外抓详情页拖慢整体（参考 Mihon：搜索拿列表，详情按需）。
    const rlsHtml = await ctx.fetchText(piaRlsInfoUrl(artistCd));
    const events = parsePiaRlsInfo(rlsHtml, query);
    return events.map((event) => normalizeLiveEvent({
      ...event,
      timeline: deriveTimelineFromWindows(event.ticketWindows || []),
    }, 'pia', ctx.fetchedAt));
  },
};

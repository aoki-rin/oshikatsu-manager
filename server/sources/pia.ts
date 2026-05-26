import type { TicketWindow } from '../../src/types';
import { buildPlatformSearchUrl, deriveTimelineFromWindows, normalizeLiveEvent } from '../../src/sources/shared';
import { parsePiaArtistCd, parsePiaDetailDates, parsePiaRlsInfo } from '../../src/sources/pia';
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

    const rlsHtml = await ctx.fetchText(piaRlsInfoUrl(artistCd));
    const events = parsePiaRlsInfo(rlsHtml, query);
    const active: TicketWindow[] = [];
    for (const event of events) {
      for (const window of event.ticketWindows || []) {
        if (active.length < 4 && window.applyUrl && window.statusText && /受付中/.test(window.statusText)) {
          active.push(window);
        }
      }
    }
    await Promise.allSettled(active.map(async (window) => {
      const detailHtml = await ctx.fetchText(window.applyUrl!);
      const detail = parsePiaDetailDates(detailHtml);
      if (detail.applyStart || detail.applyEnd) {
        window.applyStart = detail.applyStart;
        window.applyEnd = detail.applyEnd;
        window.resultStart = detail.resultStart;
      }
    }));

    return events.map((event) => normalizeLiveEvent({
      ...event,
      timeline: deriveTimelineFromWindows(event.ticketWindows || []),
    }, 'pia', ctx.fetchedAt));
  },
};

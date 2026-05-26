import type { TicketSearchReport, TicketSearchResult } from '../src/types';
import { dedupeEvents } from '../src/sources/shared';
import { createPlatformHttpClient } from './network';
import { defaultSources } from './sources';
import { PlatformSearchError, type ServerTicketSource, type SourceSearchContext } from './types';

export interface ProxySearchResult extends TicketSearchResult {
  servedBy: 'proxy';
  fetchedAt: string;
}

export interface SearchServiceOptions {
  sources?: ServerTicketSource[];
  context?: Partial<SourceSearchContext>;
}

export function createSearchService(options: SearchServiceOptions = {}) {
  const sources = options.sources || defaultSources;
  const defaultHttp = createPlatformHttpClient();
  const byIdOrPlatform = new Map<string, ServerTicketSource>();
  for (const source of sources) {
    byIdOrPlatform.set(source.id, source);
    byIdOrPlatform.set(source.platform, source);
  }

  function selectSources(sourceNames: string[]): ServerTicketSource[] {
    if (sourceNames.length === 0 || sourceNames.includes('All')) return sources;
    const selected: ServerTicketSource[] = [];
    for (const name of sourceNames) {
      const source = byIdOrPlatform.get(name);
      if (source && !selected.includes(source)) selected.push(source);
    }
    return selected;
  }

  async function search(query: string, sourceNames: string[] = []): Promise<ProxySearchResult> {
    const q = query.trim();
    const fetchedAt = options.context?.fetchedAt || new Date().toISOString();
    const ctx: SourceSearchContext = {
      fetchText: options.context?.fetchText || defaultHttp.fetchText,
      fetchedAt,
    };
    const targets = q ? selectSources(sourceNames) : [];
    const events = [];
    const reports: TicketSearchReport[] = [];

    await Promise.all(targets.map(async (source) => {
      const startedAt = Date.now();
      const handoffUrl = source.buildSearchUrl(q);
      try {
        const sourceEvents = await source.search(q, ctx);
        events.push(...sourceEvents);
        reports.push({
          platform: source.platform,
          status: sourceEvents.length > 0 ? 'ok' : 'empty',
          count: sourceEvents.length,
          handoffUrl,
          runtime: 'proxy',
          elapsedMs: Date.now() - startedAt,
          parserVersion: source.parserVersion,
        });
      } catch (error: any) {
        const status = error instanceof PlatformSearchError ? error.status : 'error';
        reports.push({
          platform: source.platform,
          status,
          count: 0,
          error: String(error?.message || error),
          handoffUrl,
          runtime: 'proxy',
          elapsedMs: Date.now() - startedAt,
          parserVersion: source.parserVersion,
        });
      }
    }));

    const order = new Map(targets.map((source, index) => [source.platform, index]));
    reports.sort((a, b) => (order.get(a.platform) ?? 0) - (order.get(b.platform) ?? 0));

    return {
      events: dedupeEvents(events),
      reports,
      fetchedAt,
      servedBy: 'proxy',
    };
  }

  return { search, sources };
}

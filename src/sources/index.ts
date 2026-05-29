// 平台插件注册表 + 聚合搜索（Mihon 式）。
// 每个平台一个 search(artist) → ActivityEvent[]。搜索框只调【已启用】的插件。
import type { ActivityEvent, TicketPlatform, TicketSearchReport, TicketSearchResult } from '../types';
import { searchEplus } from './eplus';
import { searchPia } from './pia';
import { searchTicketDive } from './ticketdive';
import { searchLivePocket } from './livepocket';
import { searchLawson } from './lawson';
import { buildPlatformSearchUrl, dedupeEvents, PLATFORM_SEARCH_TIMEOUT_MS, withPlatformTimeout, type TicketSource } from './shared';
import { aggregateConcerts } from './aggregate';
import { searchWithProxyFallback } from './proxy';

// platform 名（与 ExtensionSource.platform / TicketPlatform 对齐）→ 插件 search
const REGISTRY: Record<TicketPlatform, TicketSource> = {
  eplus: { id: 'eplus', platform: 'eplus', search: searchEplus, buildSearchUrl: (query) => buildPlatformSearchUrl('eplus', query) },
  'Ticket Pia': { id: 'pia', platform: 'Ticket Pia', search: searchPia, buildSearchUrl: (query) => buildPlatformSearchUrl('Ticket Pia', query) },
  TicketDive: { id: 'ticketdive', platform: 'TicketDive', search: searchTicketDive, buildSearchUrl: (query) => buildPlatformSearchUrl('TicketDive', query) },
  LivePocket: { id: 'livepocket', platform: 'LivePocket', search: searchLivePocket, buildSearchUrl: (query) => buildPlatformSearchUrl('LivePocket', query) },
  'Lawson Ticket': { id: 'lawson', platform: 'Lawson Ticket', search: searchLawson, buildSearchUrl: (query) => buildPlatformSearchUrl('Lawson Ticket', query) },
};

export function hasPlugin(platform: string): boolean {
  return platform in REGISTRY;
}

export interface AggregateResult {
  events: ActivityEvent[];
  reports: TicketSearchReport[];
  perPlatform: { platform: string; count: number; error?: string; handoffUrl?: string }[];
}

// App 内直连兜底：对所有【已启用且有插件】的平台并发搜索，聚合去重
export async function searchClientPlatforms(query: string, activePlatforms: string[]): Promise<TicketSearchResult & AggregateResult> {
  const q = query.trim();
  const configured = activePlatforms.includes('All')
    ? Object.keys(REGISTRY)
    : activePlatforms;
  const targets = configured.filter((p): p is TicketPlatform => p in REGISTRY);
  if (!q || targets.length === 0) return { events: [], reports: [], perPlatform: [] };

  const settled = await Promise.allSettled(targets.map((p) => withPlatformTimeout(REGISTRY[p].search(q), PLATFORM_SEARCH_TIMEOUT_MS, p)));
  const reports: TicketSearchReport[] = [];
  const events: ActivityEvent[] = [];

  settled.forEach((r, i) => {
    const platform = targets[i];
    const handoffUrl = REGISTRY[platform].buildSearchUrl(q);
    if (r.status === 'fulfilled') {
      reports.push({
        platform,
        status: r.value.length > 0 ? 'ok' : 'empty',
        count: r.value.length,
        handoffUrl,
        runtime: 'client',
      });
      events.push(...r.value);
    } else {
      reports.push({
        platform,
        status: 'error',
        count: 0,
        error: String(r.reason?.message || r.reason),
        handoffUrl,
        runtime: 'client',
      });
    }
  });

  const deduped = dedupeEvents(events);
  return {
    events: deduped,
    reports,
    fetchedAt: new Date().toISOString(),
    servedBy: 'client',
    perPlatform: reports.map((report) => ({
      platform: report.platform,
      count: report.count,
      error: report.error,
      handoffUrl: report.handoffUrl,
    })),
  };
}

// 默认入口：代理优先，代理不可达或未配置时退回 CapacitorHttp 直连。
// 各平台原始结果合并后，做跨平台「同一场演出」聚合（同艺人+日期+会场 → 一张卡，多平台窗口）。
// 注意：reports 仍是各平台「原始」命中数（聚合只影响展示用的 events 列表）。
export async function searchAllPlatforms(query: string, activePlatforms: string[]): Promise<TicketSearchResult & AggregateResult> {
  const result = await searchWithProxyFallback(query, activePlatforms, searchClientPlatforms);
  return {
    ...result,
    events: aggregateConcerts(result.events),
    perPlatform: result.reports.map((report) => ({
      platform: report.platform,
      count: report.count,
      error: report.error,
      handoffUrl: report.handoffUrl,
    })),
  };
}

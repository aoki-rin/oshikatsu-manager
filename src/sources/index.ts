// 平台插件注册表 + 聚合搜索（Mihon 式）。
// 每个平台一个 search(artist) → ActivityEvent[]。搜索框只调【已启用】的插件。
import type { ActivityEvent, TicketPlatform, TicketSearchReport, TicketSearchResult } from '../types';
import { searchEplus } from './eplus';
import { searchPia, enrichPiaWindows } from './pia';
import { searchTicketDive, enrichTicketDiveWindows } from './ticketdive';
import { searchLivePocket, enrichLivePocketWindows } from './livepocket';
import { searchLawson } from './lawson';
import { buildPlatformSearchUrl, dedupeEvents, platformSearchTimeoutMs, withPlatformTimeout, type TicketSource } from './shared';
import { aggregateConcerts, eventPlatforms } from './aggregate';
import { isProxyConfigured, searchViaProxy, searchWithProxyFallback } from './proxy';
import { supportsLawsonSource, type AppPlatform } from '../platform';

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

// 解析出本次要搜索的平台（'All' → 全部已注册插件；否则只取有插件的）。
// 平台裁剪在此权威生效（src/platform.ts 的 supportsLawsonSource）——代理/直连两条路径
// 都从这里取目标，所以下游把 targets（显式列表）而非 activePlatforms（可能含 'All'）
// 传给代理，服务端不会替客户端搜一个它已裁掉的平台。
// 注：ADR-0006 之后 Lawson 三平台皆可，这个过滤当前不裁任何东西；保留是因为它是
// 「某平台被反爬挡住时一处关掉」的唯一开关。
export function searchableTargets(activePlatforms: string[], platform?: AppPlatform): TicketPlatform[] {
  const configured = activePlatforms.includes('All') ? Object.keys(REGISTRY) : activePlatforms;
  return configured
    .filter((p): p is TicketPlatform => p in REGISTRY)
    .filter((p) => p !== 'Lawson Ticket' || supportsLawsonSource(platform));
}

export interface StreamMeta {
  // 配置了代理但本次请求失败（走了客户端直连兜底）。UI 用于显示降级提示。
  proxyDegraded: boolean;
}

export interface StreamOptions {
  signal?: AbortSignal;
  onMeta?: (meta: StreamMeta) => void;
}

// 流式搜索：每个源 settle 就立刻回调 onSource，UI 可增量渲染、不必等最慢的源（Mihon 式全局搜索）。
// 代理优先：配了代理用代理结果（服务端已并行，一次性回调各平台）；否则各源客户端直连、独立流式。
export async function searchPlatformsStreaming(
  query: string,
  activePlatforms: string[],
  onSource: (report: TicketSearchReport, events: ActivityEvent[]) => void,
  options: StreamOptions = {},
): Promise<void> {
  const q = query.trim();
  const targets = searchableTargets(activePlatforms);
  if (!q || targets.length === 0) return;

  // 代理优先（未配置代理时 searchViaProxy 返回 null → 走客户端流式）
  // 传 targets 而非 activePlatforms：平台裁剪对代理路径同样生效。
  let proxyResult: TicketSearchResult | null = null;
  let proxyDegraded = false;
  try {
    proxyResult = await searchViaProxy(q, targets);
  } catch {
    proxyResult = null;
    // 配置了代理但请求失败 = 降级（Tailscale/代理进程没开等）。通知 UI 明示，别静默退化（QA #2）。
    proxyDegraded = isProxyConfigured();
  }
  options.onMeta?.({ proxyDegraded });
  if (proxyResult) {
    for (const report of proxyResult.reports) {
      if (options.signal?.aborted) return;
      const evs = proxyResult.events.filter((event) => eventPlatforms(event).includes(report.platform));
      onSource({ ...report, runtime: report.runtime ?? 'proxy' }, evs);
    }
    return;
  }

  // 客户端：各源并发，谁先回来谁先回调（每平台超时上限见 platformSearchTimeoutMs）
  await Promise.all(targets.map(async (platform) => {
    if (options.signal?.aborted) return;
    const startedAt = Date.now();
    const handoffUrl = REGISTRY[platform].buildSearchUrl(q);
    try {
      const events = await withPlatformTimeout(REGISTRY[platform].search(q), platformSearchTimeoutMs(platform), platform);
      if (options.signal?.aborted) return;
      onSource({
        platform,
        status: events.length > 0 ? 'ok' : 'empty',
        count: events.length,
        handoffUrl,
        runtime: 'client',
        elapsedMs: Date.now() - startedAt,
      }, events);
    } catch (error: unknown) {
      if (options.signal?.aborted) return;
      onSource({
        platform,
        status: 'error',
        count: 0,
        error: error instanceof Error ? error.message : String(error),
        handoffUrl,
        runtime: 'client',
        elapsedMs: Date.now() - startedAt,
      }, []);
    }
  }));
}

export interface AggregateResult {
  events: ActivityEvent[];
  reports: TicketSearchReport[];
  perPlatform: { platform: string; count: number; error?: string; handoffUrl?: string }[];
}

// App 内直连兜底：对所有【已启用且有插件】的平台并发搜索，聚合去重
export async function searchClientPlatforms(query: string, activePlatforms: string[]): Promise<TicketSearchResult & AggregateResult> {
  const q = query.trim();
  const targets = searchableTargets(activePlatforms);
  if (!q || targets.length === 0) return { events: [], reports: [], perPlatform: [] };

  const settled = await Promise.allSettled(targets.map((p) => withPlatformTimeout(REGISTRY[p].search(q), platformSearchTimeoutMs(p), p)));
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
  // 先解析成显式目标列表（已过平台裁剪），代理和客户端兜底吃到同一份。
  const result = await searchWithProxyFallback(query, searchableTargets(activePlatforms), searchClientPlatforms);
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

// 点开事件详情时按平台懒加载精确受付窗口（best-effort）。聚合事件可能含多平台窗口，逐个尝试；
// 无对应平台窗口的 enricher 立即原样返回（不发请求）。
export async function enrichEventWindows(event: ActivityEvent): Promise<ActivityEvent> {
  let enriched = event;
  enriched = await enrichPiaWindows(enriched);
  enriched = await enrichLivePocketWindows(enriched);
  enriched = await enrichTicketDiveWindows(enriched);
  return enriched;
}

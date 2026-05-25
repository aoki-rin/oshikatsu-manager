// 平台插件注册表 + 聚合搜索（Mihon 式）。
// 每个平台一个 search(artist) → ActivityEvent[]。搜索框只调【已启用】的插件。
import type { ActivityEvent } from '../types';
import { searchEplus } from './eplus';

type PlatformSearch = (artist: string) => Promise<ActivityEvent[]>;

// platform 名（与 ExtensionSource.platform / TicketPlatform 对齐）→ 插件 search
const REGISTRY: Record<string, PlatformSearch> = {
  eplus: searchEplus,
  // 'Ticket Pia': searchPia,        // 待做
  // 'LivePocket': searchLivePocket, // 待做(JS/XHR)
  // 'Lawson Ticket': searchLawson,  // 押后(反爬硬)
};

export function hasPlugin(platform: string): boolean {
  return platform in REGISTRY;
}

export interface AggregateResult {
  events: ActivityEvent[];
  perPlatform: { platform: string; count: number; error?: string }[];
}

// 对所有【已启用且有插件】的平台并发搜索，聚合去重
export async function searchAllPlatforms(query: string, activePlatforms: string[]): Promise<AggregateResult> {
  const q = query.trim();
  const targets = activePlatforms.filter((p) => p in REGISTRY);
  if (!q || targets.length === 0) return { events: [], perPlatform: [] };

  const settled = await Promise.allSettled(targets.map((p) => REGISTRY[p](q)));
  const perPlatform: AggregateResult['perPlatform'] = [];
  const seen = new Set<string>();
  const events: ActivityEvent[] = [];

  settled.forEach((r, i) => {
    const platform = targets[i];
    if (r.status === 'fulfilled') {
      perPlatform.push({ platform, count: r.value.length });
      for (const ev of r.value) {
        if (!seen.has(ev.id)) { seen.add(ev.id); events.push(ev); }
      }
    } else {
      perPlatform.push({ platform, count: 0, error: String(r.reason?.message || r.reason) });
    }
  });

  return { events, perPlatform };
}

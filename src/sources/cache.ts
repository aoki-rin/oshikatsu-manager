import type { ActivityEvent } from '../types';
import { aggregateConcerts } from './aggregate';
import { dedupeEvents } from './shared';
import { favoriteAliases } from '../favorites';

function urls(event: ActivityEvent): string[] {
  return [...new Set([event.originalUrl, ...(event.ticketWindows ?? []).flatMap(w => [w.sourceUrl, w.applyUrl])].filter((url): url is string => !!url))];
}
function covers(fresh: ActivityEvent, old: ActivityEvent): boolean {
  if (favoriteAliases(old).includes(fresh.id)) return true;
  return fresh.date === old.date && urls(fresh).some(url => (old.ticketWindows ?? []).some(w => w.platform === fresh.platform && (w.sourceUrl === url || w.applyUrl === url)));
}

export interface CacheReplacement { old: ActivityEvent; replacements: ActivityEvent[] }
export function refreshSearchCache(fresh: ActivityEvent[], cached: ActivityEvent[]): { events: ActivityEvent[]; replacements: CacheReplacement[]; searchIds: string[] } {
  const replacements: CacheReplacement[] = [];
  const remainder: ActivityEvent[] = [];
  const unresolved: ActivityEvent[] = [];
  for (const old of cached) {
    if (Array.isArray(old.sourceEvents) && old.sourceEvents.length) {
      // 聚合后的懒加载结果按来源回填到快照，避免刷新别的平台时丢掉精确受付。
      remainder.push(...old.sourceEvents.map(source => ({ ...source,
        ticketWindows: old.ticketWindows?.filter(w => w.platform === source.platform) ?? source.ticketWindows,
      })));
    } else if (old.id.startsWith('agg-')) {
      const matches = fresh.filter(e => covers(e, old));
      const membersCovered = old.memberIds?.length && old.memberIds.every(id => matches.some(e => favoriteAliases(e).includes(id)));
      const windowsCovered = old.ticketWindows?.length && old.ticketWindows.every(w => matches.some(e => e.platform === w.platform && urls(e).some(url => url === w.sourceUrl || url === w.applyUrl)));
      if (matches.length && (membersCovered || windowsCovered)) replacements.push({old,replacements:matches});
      // 无法从旧卡恢复所有场次时保留旧缓存，但不能再让它污染本次精确搜索结果。
      else unresolved.push(old);
    } else remainder.push(old);
  }
  const current = aggregateConcerts(dedupeEvents([...remainder, ...fresh]));
  const freshIds = new Set(fresh.flatMap(favoriteAliases));
  const searchIds = current.filter(event => favoriteAliases(event).some(id => freshIds.has(id))).map(event => event.id);
  return { events: [...current, ...unresolved], replacements, searchIds };
}

export function refreshFavorites(favorites: string[], replacements: CacheReplacement[]): string[] {
  const result = new Set(favorites);
  for (const {old, replacements: fresh} of replacements) {
    if (result.delete(old.id)) for (const event of fresh) for (const alias of favoriteAliases(event)) result.add(alias);
    for (const member of old.memberIds ?? []) {
      if (!result.has(member)) continue;
      const matchedWindows = (old.ticketWindows ?? []).filter(w => w.id.startsWith(`${member}-`));
      for (const event of fresh) {
        if (event.id === member || matchedWindows.some(w => urls(event).some(url => w.sourceUrl === url || w.applyUrl === url))) result.add(event.id);
      }
    }
  }
  return [...result];
}

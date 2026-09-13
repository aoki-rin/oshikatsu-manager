import type { ActivityEvent } from './types';
import { canonicalArtistId, canonicalVenueId } from './sources/shared';

type FavoritableEvent = Pick<ActivityEvent, 'id' | 'artistName' | 'date' | 'venueName'> &
  Partial<Pick<ActivityEvent, 'memberIds'>>;

// 公演身份由平台编号确定，避免同日同馆的昼夜场共用收藏。
// 跨平台聚合的稳定性由 memberIds 别名承接，不再写入宽泛的艺人/日期/会场键。
export function favoriteKey(event: FavoritableEvent): string {
  return event.id;
}

export function legacyFavoriteKey(event: FavoritableEvent): string {
  if (!event.date || !event.artistName) return event.id;
  return `fav:${canonicalArtistId(event.artistName) || event.artistName}|${event.date}|${canonicalVenueId(event.venueName)}`;
}

// 旧版本通常同时写宽泛键和精确 id。优先恢复精确 id；只有没有精确记录时才
// 按旧宽泛键恢复已有缓存里的收藏。迁移后不再让该键传播到以后搜到的另一场。
export function migrateFavorites(events: ActivityEvent[], stored: readonly string[]): string[] {
  stored = Array.isArray(stored) ? stored.filter(id => typeof id === 'string') : [];
  const result = new Set(stored.filter(id => !id.startsWith('fav:')));
  for (const event of events) {
    if (event.id.startsWith('agg-') && result.has(event.id)) {
      for (const id of event.memberIds ?? []) result.add(id);
    }
  }
  for (const key of stored.filter(id => id.startsWith('fav:'))) {
    const candidates = events.filter(e => legacyFavoriteKey(e) === key);
    const precise = candidates.filter(e => favoriteAliases(e).some(id => result.has(id)));
    for (const event of precise.length ? precise : candidates) {
      for (const alias of favoriteAliases(event)) result.add(alias);
    }
  }
  return [...result];
}

// 收藏别名全集：当前 id + 成员平台 id（查询无关）。
// 搜索词回显不能作为公演身份；成员的官网编号不随查询词变化。
// 收藏时把全部别名写入 favorites，匹配时任一命中即算已收藏。
export function favoriteAliases(event: FavoritableEvent): string[] {
  return [...new Set([favoriteKey(event), event.id, ...(event.memberIds ?? [])])];
}

// 是否已收藏。兼容旧数据（旧收藏存稳定键或 event.id）：任一别名命中都算。
export function isFavorited(event: FavoritableEvent, favorites: readonly string[]): boolean {
  return favoriteAliases(event).some((alias) => favorites.includes(alias));
}

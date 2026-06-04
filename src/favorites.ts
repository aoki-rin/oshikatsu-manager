import type { ActivityEvent } from './types';
import { canonicalArtistId, canonicalVenueId } from './sources/shared';

type FavoritableEvent = Pick<ActivityEvent, 'id' | 'sourceKind' | 'artistName' | 'date' | 'venueName'>;

// 收藏的「稳定身份键」：跨「单平台 ↔ 跨平台聚合」保持不变。
// 旧做法用 event.id 当键，但同一场演出从单平台 (lawson-1) 被聚合成多平台 (agg-…) 时 id 会变，
// 导致重载 / 再次搜索后收藏静默丢失。live 事件改用 艺人 + 日期 + 会场 归一键；
// manual / 缺日期事件不参与聚合，沿用 event.id。
export function favoriteKey(event: FavoritableEvent): string {
  if (event.sourceKind === 'manual' || !event.date || !event.artistName) return event.id;
  const artist = canonicalArtistId(event.artistName) || event.artistName;
  const venue = canonicalVenueId(event.venueName);
  return `fav:${artist}|${event.date}|${venue}`;
}

// 是否已收藏。兼容旧数据（旧收藏存的是 event.id）：稳定键命中或旧 id 命中都算。
export function isFavorited(event: FavoritableEvent, favorites: readonly string[]): boolean {
  return favorites.includes(favoriteKey(event)) || favorites.includes(event.id);
}

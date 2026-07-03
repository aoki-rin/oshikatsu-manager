import type { ActivityEvent } from './types';
import { canonicalArtistId, canonicalVenueId } from './sources/shared';

type FavoritableEvent = Pick<ActivityEvent, 'id' | 'artistName' | 'date' | 'venueName'> &
  Partial<Pick<ActivityEvent, 'memberIds'>>;

// 收藏的「稳定身份键」：跨「单平台 ↔ 跨平台聚合」保持不变。
// 旧做法用 event.id 当键，但同一场演出从单平台 (lawson-1) 被聚合成多平台 (agg-…) 时 id 会变，
// 导致重载 / 再次搜索后收藏静默丢失。live 事件改用 艺人 + 日期 + 会场 归一键；
// 缺日期 / 缺艺人的事件不参与聚合，沿用 event.id。
export function favoriteKey(event: FavoritableEvent): string {
  if (!event.date || !event.artistName) return event.id;
  const artist = canonicalArtistId(event.artistName) || event.artistName;
  const venue = canonicalVenueId(event.venueName);
  return `fav:${artist}|${event.date}|${venue}`;
}

// 收藏别名全集：稳定键 + 当前 id + 成员平台 id（查询无关）。
// 背景：artistName 可能是搜索词回显（artistSource:'query'），换个关键词再搜到同一场演出时
// 稳定键/聚合 id 都会漂移 → 只有平台事件 id（eplus-xxx / pia-yyy）是查询无关的锚。
// 收藏时把全部别名写入 favorites，匹配时任一命中即算已收藏。
export function favoriteAliases(event: FavoritableEvent): string[] {
  return [...new Set([favoriteKey(event), event.id, ...(event.memberIds ?? [])])];
}

// 是否已收藏。兼容旧数据（旧收藏存稳定键或 event.id）：任一别名命中都算。
export function isFavorited(event: FavoritableEvent, favorites: readonly string[]): boolean {
  return favoriteAliases(event).some((alias) => favorites.includes(alias));
}

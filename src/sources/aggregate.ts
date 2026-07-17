// 跨平台「同一场演出」聚合。
// 把不同票务平台上的同一场 live（同艺人 + 同日期 + 同会场）合并成一个事件，
// 汇总各平台的多轮受付窗口到一张卡。保守策略（宁可不合并也不错合）：
//   - 缺日期 / 缺艺人 不合并（原样保留，不参与聚合）；
//   - 会场名需「核心 token」可信匹配才合并（太短/只有都道府县则视为不可信，不合并）。
import type { ActivityEvent, TicketPlatform, TicketWindow } from '../types';
import { canonicalArtistId, canonicalVenueId, deriveTimelineFromWindows, primaryPurchaseUrl } from './shared';

// 选「主平台」的优先级（信息最全的在前）。
const PLATFORM_PRIORITY: readonly TicketPlatform[] = ['eplus', 'Ticket Pia', 'Lawson Ticket', 'LivePocket', 'TicketDive'];
const PLACEHOLDER_IMG_RE = /images\.unsplash\.com/;
const MIN_VENUE_CORE = 3;

function normalizeArtist(name: string): string {
  return (name || '').normalize('NFKC').toLowerCase().replace(/\s+/g, '');
}

// 会场名归一：去掉括号内容（都道府县/区域后缀）、空白与标点，留核心 token 做跨平台比较。
export function venueCore(name: string): string {
  return (name || '')
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[（(][^）)]*[）)]/g, '') // drop parenthetical area/prefecture suffix
    // strip spaces & separators, but KEEP the prolonged-sound mark ー (U+30FC),
    // which is part of words like ドーム/ホール/アリーナ/シアター.
    .replace(/[\s　・,，.。\-!！「」『』]/g, '')
    .trim();
}

function venuesCompatible(a: string, b: string): boolean {
  const ca = venueCore(a);
  const cb = venueCore(b);
  if (ca.length < MIN_VENUE_CORE || cb.length < MIN_VENUE_CORE) return false;
  return ca === cb || ca.includes(cb) || cb.includes(ca);
}

function platformRank(platform: string): number {
  const idx = PLATFORM_PRIORITY.indexOf(platform as TicketPlatform);
  return idx === -1 ? PLATFORM_PRIORITY.length : idx;
}

function fetchedMs(event: ActivityEvent): number {
  return event.lastFetchedAt ? Date.parse(event.lastFetchedAt) : 0;
}

// 一个事件涉及的全部平台（主平台 + 各窗口平台），按优先级稳定排序。给卡片/详情展示多平台徽标用。
export function eventPlatforms(event: Pick<ActivityEvent, 'platform' | 'ticketWindows'>): string[] {
  const set = new Set<string>([event.platform]);
  for (const w of event.ticketWindows ?? []) if (w.platform) set.add(w.platform);
  return [...set].sort((a, b) => platformRank(a) - platformRank(b));
}

function canAggregate(event: ActivityEvent): boolean {
  return Boolean(event.date) && Boolean(event.artistName);
}

// 提醒 ID 的稳定并发键。用「分组键」= normalizeArtist(artistName)|date:
// 聚合分组正是按此键(见 aggregateConcerts step 1),组内成员该键必然相同 →
// 单平台事件合并成 agg- 后此键不变。只要提醒挂在被保留的窗口上(window.id 跨聚合去重保留),
// notificationId 就不再随 event.id 漂移(#74)。
// - 不含会场:聚合会把 venueName 改写成最长串,含进来反而不稳。
// - 无艺人/日期(不参与聚合)回退 event.id——这类事件 id 本就稳定。
// 已知局限:若单平台事件本走 fallback 提醒(无窗口),聚合后从别的平台获得窗口 → 提醒结构
// 由 'event' 变为真实 window.id,此键无法覆盖(那已是「更精确的另一条提醒」,需 alert 迁移方案)。
export function stableConcertKey(event: Pick<ActivityEvent, 'id' | 'artistName' | 'date'>): string {
  if (!event.date || !event.artistName) return event.id;
  return `${normalizeArtist(event.artistName)}|${event.date}`;
}

function pickLongest(values: string[]): string {
  return values.filter(Boolean).sort((a, b) => b.length - a.length)[0] || '';
}

function firstNonEmpty(values: string[]): string {
  return values.find((value) => value && value.trim()) || '';
}

function mergeCluster(cluster: ActivityEvent[]): ActivityEvent {
  const sorted = [...cluster].sort(
    (a, b) => platformRank(a.platform) - platformRank(b.platform) || fetchedMs(b) - fetchedMs(a),
  );
  const primary = sorted[0];

  // 各平台窗口合并（按 window.id 去重，保留各自 platform）
  const windowMap = new Map<string, TicketWindow>();
  for (const event of sorted) {
    for (const window of event.ticketWindows ?? []) {
      if (!windowMap.has(window.id)) windowMap.set(window.id, window);
    }
  }
  const ticketWindows = [...windowMap.values()];

  const venueName = pickLongest(cluster.map((event) => event.venueName)) || primary.venueName;
  const realImage = cluster.map((event) => event.imageUrl).find((src) => src && !PLACEHOLDER_IMG_RE.test(src));
  const tags = [...new Set(cluster.flatMap((event) => event.tags || []))];
  const lastFetchedAt = cluster.map((event) => event.lastFetchedAt).filter(Boolean).sort().pop() || primary.lastFetchedAt;

  // 出演者名优先取平台真实名（如 Pia artistnm）；检索词回显只是兜底。
  const attributed = sorted.find((event) => event.artistSource === 'platform' && event.artistName);
  const artistName = attributed?.artistName || primary.artistName;

  // 成员平台事件 id（查询无关，如 eplus-xxx / pia-yyy）：收藏用它做稳定别名。
  // 排除 agg- 前缀（聚合 id 含检索词，换关键词会漂移）；幂等（成员本身可能已是聚合产物）。
  const memberIds = [...new Set(cluster.flatMap((event) => [event.id, ...(event.memberIds ?? [])]))]
    .filter((id) => !id.startsWith('agg-'));

  const merged: ActivityEvent = {
    ...primary,
    id: `agg-${normalizeArtist(artistName)}-${primary.date}-${venueCore(venueName) || 'x'}`,
    title: pickLongest(cluster.map((event) => event.title)) || primary.title,
    artistId: canonicalArtistId(artistName) || primary.artistId,
    artistName,
    artistSource: attributed ? 'platform' : primary.artistSource,
    memberIds,
    venueId: canonicalVenueId(venueName) || primary.venueId,
    venueName,
    region: firstNonEmpty(cluster.map((event) => event.region)),
    time: firstNonEmpty(cluster.map((event) => event.time)),
    imageUrl: realImage || primary.imageUrl,
    ticketWindows,
    timeline: deriveTimelineFromWindows(ticketWindows),
    tags,
    lastFetchedAt,
  };
  return { ...merged, purchaseUrl: primaryPurchaseUrl(merged) };
}

// 主入口：跨平台聚合 + 排序（最近抓取在前）。无日期 / 无艺人事件原样保留。幂等。
export function aggregateConcerts(events: ActivityEvent[]): ActivityEvent[] {
  const passthrough: ActivityEvent[] = [];
  const candidates: ActivityEvent[] = [];
  for (const event of events) (canAggregate(event) ? candidates : passthrough).push(event);

  // 1) 按 艺人 + 日期 分组
  const groups = new Map<string, ActivityEvent[]>();
  for (const event of candidates) {
    const key = `${normalizeArtist(event.artistName)}|${event.date}`;
    const bucket = groups.get(key);
    if (bucket) bucket.push(event);
    else groups.set(key, [event]);
  }

  // 2) 组内按会场兼容性聚类，逐簇合并（单平台事件保留原 id，不强加 agg- 前缀）
  const merged: ActivityEvent[] = [];
  for (const group of groups.values()) {
    const clusters: ActivityEvent[][] = [];
    for (const event of group) {
      const target = clusters.find((cluster) => cluster.some((member) => venuesCompatible(member.venueName, event.venueName)));
      if (target) target.push(event);
      else clusters.push([event]);
    }
    for (const cluster of clusters) merged.push(cluster.length === 1 ? cluster[0] : mergeCluster(cluster));
  }

  return [...merged, ...passthrough].sort((a, b) => fetchedMs(b) - fetchedMs(a));
}

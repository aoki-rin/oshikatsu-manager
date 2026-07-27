import { useEffect, useRef, useState } from 'react';
import {
  ActivityEvent, Artist, Venue, ExtensionSource,
  NotificationAlert, ReminderTarget, TicketSearchReport, TicketPlatform, SourceStat,
} from '../types';
import { INITIAL_EXTENSIONS, OSHI_COLORS } from '../data/mockData';
import { searchPlatformsStreaming, searchableTargets } from '../sources';
import { buildPlatformSearchUrl, dedupeEvents, deriveTimelineFromWindows } from '../sources/shared';
import { isProxyConfigured } from '../sources/proxy';
import { aggregateConcerts, stableConcertKey } from '../sources/aggregate';
import {
  cancelAllReminders, cancelReminderIds, cancelReminderTarget,
  reminderIdsForWindow, scheduleReminderTarget,
} from '../notifications';
import { favoriteAliases } from '../favorites';
import { supportsLawsonSource } from '../platform';
import { LOCALE_STORAGE_KEY, TFunction } from '../i18n/core';

const LIVE_ID_PREFIXES = ['agg-', 'eplus-', 'pia-', 'td-', 'lp-', 'lawson-'];

// lawson-html-v2（64abc9a）前的 Lawson 事件 id：整组一个 lawson-<mid>——单段纯数字，
// 且那个 mid 常来自页脚新闻链的误抓。新方案逐场，id 恒为
// `lawson-${base}-${prfDate || `p${prfIdx}`}`（lawsonParser.ts parseResultBoxGroup）：
// base 有 lcode → groupLcode → 标题 slug → `g${groupIdx}` 四级回退、日期段有 `p${prfIdx}` 回退，
// 两段都保证非空 → 新格式恒为「两段起步」，形状上不可能命中本规则。
const LEGACY_LAWSON_ID_RE = /^lawson-\d+$/;
// 一次性标记。**不能**每次启动都剪：parseLawsonSearch 的旧结构回退路径至今仍在产出同形状的
// lawson-<纯数字>（lawsonParser.ts 的 legacy 分支，parser-fixtures 有断言），无条件剪会把新版
// 刚搜到的合法结果在下次启动删掉 → 搜到又消失的死循环。而「首次运行新版本」这一刻，
// 存量里的该形状 id 必然出自旧版本（新版尚未搜过），此时剪枝才是精确的。
const LAWSON_ID_MIGRATION_KEY = 'oshikatsu_lawson_id_migrated';

// 旧方案的窗口 id：`lawson-<mid>-0`（三段、后两段纯数字）。新方案窗口恒为
// `lawson-<base>-<prfDate>-<schduleNo>`（四段起步），形状上不会命中本规则。
// 必须单独判：旧事件一旦被 aggregateConcerts 合进 agg- 卡，事件 id 变成 agg-…，
// 旧 id 退进 memberIds、旧窗口留在 ticketWindows —— 只看 event.id 的剪枝会整条漏掉它，
// 幽灵窗口继续把旧 windowId 续命成合法提醒源（#83 事后评审实测复现）。
const LEGACY_LAWSON_WINDOW_ID_RE = /^lawson-\d+-\d+$/;

interface LegacyMigration {
  events: ActivityEvent[];
  deadReminderIds: Set<number>;
  changed: boolean;
}

// 迁移而非改写：旧「整组一场」对应新的 N 场公演，没有可靠的 1:1 映射，替用户猜一场等于凭空造数据。
// 只丢死记录，正确的逐场事件由下一次搜索补回。
// 两种形态都要处理：①独立的旧事件整条丢弃；②被聚合进 agg- 卡的旧半边——剥离其窗口与
// memberIds 别名，保住同卡里别家平台的合法数据（不能因为混进一个旧半边就废掉整张卡）。
// 同时把这些必死的 notificationId 收集出来，作为清扫通知的 deny-list。
function migrateLegacyLawson(events: ActivityEvent[]): LegacyMigration {
  const deadReminderIds = new Set<number>();
  const surviving: ActivityEvent[] = [];
  let changed = false;

  for (const event of events) {
    // 喂进来的是持久化数据（localStorage 可以是任何东西：ticketWindows 可能是字符串、
    // memberIds 可能不是数组）。一条坏事件不能把整轮迁移连同其后的状态加载一起带崩
    // （d24ec3f 不变量）——原样留着它，它本就渲染不出详情，也管不了自己的提醒。
    try {
      const keyBase = stableConcertKey(event);
      const markDead = (windowId: string) => {
        for (const id of reminderIdsForWindow(keyBase, windowId)) deadReminderIds.add(id);
      };
      const windows = Array.isArray(event.ticketWindows) ? event.ticketWindows : [];
      const memberIds = Array.isArray(event.memberIds) ? event.memberIds : [];

      if (LEGACY_LAWSON_ID_RE.test(event.id)) {
        for (const window of windows) markDead(window.id);
        markDead('event'); // 无窗口时 buildReminderTargets 的 fallback 目标
        changed = true;
        continue;
      }

      const legacyWindows = windows.filter(window => LEGACY_LAWSON_WINDOW_ID_RE.test(window.id));
      const legacyMembers = memberIds.filter(id => LEGACY_LAWSON_ID_RE.test(id));
      if (legacyWindows.length === 0 && legacyMembers.length === 0) {
        surviving.push(event);
        continue;
      }

      for (const window of legacyWindows) markDead(window.id);
      const ticketWindows = windows.filter(window => !LEGACY_LAWSON_WINDOW_ID_RE.test(window.id));
      changed = true;
      surviving.push({
        ...event,
        memberIds: memberIds.filter(id => !LEGACY_LAWSON_ID_RE.test(id)),
        ticketWindows,
        timeline: deriveTimelineFromWindows(ticketWindows),
      });
    } catch (error: unknown) {
      console.warn('[store] 事件迁移失败,原样保留', event?.id, error);
      surviving.push(event);
    }
  }

  return { events: surviving, deadReminderIds, changed };
}

// 持久化写入的统一兜底。启动加载链里的自愈写入（迁移剪枝、alert 清理）**绝不能抛穿**：
// 配额写满 / WKWebView 隐私模式禁存储时抛出会中断整条 useEffect，其后的 artists/venues/
// extensions/favorites/… 全部不加载；顶层 ErrorBoundary 唯一的恢复手段是 reload，
// 而 reload 重跑同一 effect 又抛 → 永久启动循环，用户在应用内够不到重置按钮（#83 事后评审）。
function safeSetItem(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error: unknown) {
    console.warn(`[store] 持久化写入失败: ${key}`, error);
    return false;
  }
}

// 带自愈的持久化读取：单个 key 被写坏（存储满写半截/系统清理）时返回兜底值并清掉坏数据，
// 而不是让整条加载链在第一个坏 key 处抛异常 → 之后所有状态静默丢失（深度 review 发现：
// 此前 14 处裸 JSON.parse，任何一处坏数据都会打断 useEffect 加载）。
function loadJson<T>(key: string, fallback: T): T {
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    console.warn(`[store] 持久化数据损坏,已重置: ${key}`);
    localStorage.removeItem(key);
    return fallback;
  }
}

function loadPersistedEvents(raw: string | null): ActivityEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ActivityEvent[];
    return parsed
      .filter(event => event.sourceKind === 'live' || LIVE_ID_PREFIXES.some(prefix => event.id.startsWith(prefix)))
      .map(event => ({
        ...event,
        sourceKind: event.sourceKind || 'live',
        // 旧 schema/半截写入可能缺 timeline：渲染面与提醒构建有十余处 e.timeline.x 裸访问，
        // 一条缺字段的持久化事件就整页崩。加载边界统一补全（搜索链路由 normalizeLiveEvent 保证）。
        timeline: event.timeline || {},
      }));
  } catch {
    return [];
  }
}

interface ToastMessage {
  title: string;
  text: string;
}

// 应用领域状态 + 持久化 + 全部业务 handler 的单一来源。
// App 组件只负责导航(currentTab)/详情(selectedEvent) 这类纯视图状态与渲染。
export function useOshiStore(t: TFunction) {
  // Dynamic Oshi Fandom color state
  const [oshiColorId, setOshiColorId] = useState<string>('pink');

  // Multi platform active database states
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [extensions, setExtensions] = useState<ExtensionSource[]>([]);
  const [searchResultIds, setSearchResultIds] = useState<string[]>([]);
  const [searchReports, setSearchReports] = useState<TicketSearchReport[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  // 配置了代理但本次搜索连不上（走了手机直连兜底）→ UI 显示降级提示（QA #2）。
  const [searchDegraded, setSearchDegraded] = useState(false);
  // 结果的抓取时间 + 是否本次会话抓的（QA #6）：重开 app 装载的持久化结果不能再冒充「实时」，
  // 列表头会改示「上次搜索结果（N场 · MM/DD HH:mm）」。
  const [searchFetchedAt, setSearchFetchedAt] = useState<string | null>(null);
  const [searchIsLive, setSearchIsLive] = useState(false);
  // Cancels the previous in-flight search when a new one starts (stale results ignored).
  const searchAbortRef = useRef<AbortController | null>(null);

  // Followed categories states
  const [favorites, setFavorites] = useState<string[]>([]);
  const [followedArtists, setFollowedArtists] = useState<string[]>([]);
  const [followedVenues, setFollowedVenues] = useState<string[]>([]);
  // 关注对象的「上次查看」时间戳（entity id → ISO），给 MyOshi 的「新着」角标用。
  const [lastViewed, setLastViewed] = useState<Record<string, string>>({});
  // 每个源「上次抓取」状态（插件页本地源管理展示），按平台名 key。
  const [sourceStats, setSourceStats] = useState<Record<string, SourceStat>>({});

  // System customized ticket notifications list
  const [activeAlerts, setActiveAlerts] = useState<NotificationAlert[]>([]);

  // Instantaneous toast state
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);

  // Initialize and load Database from Local Storage to simulate true persistence
  useEffect(() => {
    // 1. Oshi Theme
    const storedColorId = localStorage.getItem('oshikatsu_color_id');
    setOshiColorId(storedColorId || 'pink'); // Beautiful Sakura Pink default

    // 2. Events & Plugins. User-visible event content starts empty and is filled by
    // real platform searches only.
    const storedEvents = localStorage.getItem('oshikatsu_events');
    const persistedEvents = loadPersistedEvents(storedEvents);
    // 旧 id 方案的存量事件一次性剪枝（见 pruneLegacyLawsonEvents）。不剪的话：①列表里多出一张
    // 「整组坍缩」的重复卡（新旧 id 不同，dedupeEvents 去重不了，搜索也顶不掉）；②旧事件把旧
    // windowId 一直续命成合法 id，启动提醒对账会认为对应的幽灵提醒仍有效。
    const alreadyMigrated = localStorage.getItem(LAWSON_ID_MIGRATION_KEY) !== null;
    const migration: LegacyMigration = alreadyMigrated
      ? { events: persistedEvents, deadReminderIds: new Set<number>(), changed: false }
      : migrateLegacyLawson(persistedEvents);
    // Aggregate on load so events persisted before cross-platform merge migrate cleanly.
    const loadedEvents = aggregateConcerts(migration.events);
    setEvents(loadedEvents);
    if (!alreadyMigrated) {
      // 顺序：先落数据、成功了才置标记。反过来的话，一次写失败就让标记永久生效，
      // 旧数据留在盘上却再也不会被剪 —— 迁移变成永久 no-op（#83 事后评审）。
      const persisted = migration.changed
        ? safeSetItem('oshikatsu_events', JSON.stringify(loadedEvents))
        : true; // 无事可剪：标记照落，否则日后合法的 lawson-<纯数字> 会被误剪
      if (persisted) safeSetItem(LAWSON_ID_MIGRATION_KEY, '1');
    }
    const validEventIds = new Set(loadedEvents.map(event => event.id));

    setArtists(loadJson<Artist[]>('oshikatsu_artists', []));
    setVenues(loadJson<Venue[]>('oshikatsu_venues', []));

    const storedExtensions = loadJson<ExtensionSource[] | null>('oshikatsu_extensions', null);
    if (storedExtensions) {
      // 保证 Lawson 已「安装」（P0 解锁的遗留迁移），但开关尊重用户的持久化选择——
      // 旧逻辑每次启动强制 isEnabled:true，用户手动关掉也会被弹回（分发复审时发现的存量 bug）。
      const merged = INITIAL_EXTENSIONS.map(defaultExt => ({
        ...defaultExt,
        ...storedExtensions.find(ext => ext.id === defaultExt.id),
      })).map(ext => ext.id === 'ext-lawson' ? { ...ext, isInstalled: true } : ext);
      setExtensions(merged);
    } else {
      // 首启默认：Lawson 只在配置了代理时才开——未配代理的设备（如分发给朋友的包）
      // 直连恒被反爬拒绝，开着只会让每次搜索多拖 8s + 一行「搜索失败」。插件页可手动开。
      // iOS 恒关（src/platform.ts）：搜索层已权威过滤，这里保持存储状态一致。
      setExtensions(INITIAL_EXTENSIONS.map(ext =>
        ext.id === 'ext-lawson' ? { ...ext, isEnabled: isProxyConfigured() && supportsLawsonSource() } : ext,
      ));
    }

    // 3. User relationships
    // 收藏项可能是稳定键(新)、event.id(旧)或成员平台 id(别名)：任一仍指向现存事件即有效。
    const validFavKeys = new Set(loadedEvents.flatMap(event => favoriteAliases(event)));
    setFavorites(loadJson<string[]>('oshikatsu_favorites', []).filter(id => validFavKeys.has(id)));
    setFollowedArtists(loadJson<string[]>('oshikatsu_followed_artists', []));
    setFollowedVenues(loadJson<string[]>('oshikatsu_followed_venues', []));
    setLastViewed(loadJson<Record<string, string>>('oshikatsu_last_viewed', {}));
    setSourceStats(loadJson<Record<string, SourceStat>>('oshikatsu_source_stats', {}));

    // 4. Alerts and configurations
    // 源站解析方案变更会改写 id（Lawson lawson-html-v2：事件 id 整组一个 → 逐场,窗口 id
    // 硬编码 -0 → -<schduleNo>）。notificationId 内嵌 windowId,于是持久化 alert 与已排定的
    // 系统通知一起变孤儿：详情页开关显示「未开启」,通知却照弹且用户无从关闭。
    //
    // 判据只认「可证明属于旧方案」（deny-list），不做「当前数据重建不出来的一律清掉」（allow-list）。
    // 后者会误杀活提醒：无窗口事件的 fallback 提醒(windowId='event')在跨平台聚合补入真实窗口后
    // 就重建不出来了，用户已排定的未来通知会被无声删除（#83 事后评审实测）。
    // 迁移而非改写：旧「整组一场」对应新的 N 场公演,没有可靠 1:1 映射,替用户猜一场再自动排程
    // 等于凭空造提醒；只清死记录,开关回到可点状态由用户重开。
    const rawAlerts = loadJson<unknown>('oshikatsu_alerts', []);
    // localStorage 可以是任何东西：`[null,42]` 这类畸形载荷能通过 JSON.parse,却会在下面
    // 读 .notificationId 时抛穿并中断整条加载链（d24ec3f 不变量,事件侧已守、alert 侧此前漏了）。
    const storedAlerts: NotificationAlert[] = Array.isArray(rawAlerts)
      ? rawAlerts.filter((alert): alert is NotificationAlert => !!alert && typeof alert === 'object')
      : [];
    const deadReminderIds = migration.deadReminderIds;
    // alert 自己的 eventId/windowId 也可能带旧方案形状（其事件早已不在存量里 → 上面收集不到）。
    const isLegacyAlert = (alert: NotificationAlert): boolean =>
      LEGACY_LAWSON_ID_RE.test(alert.eventId)
      || (alert.windowId !== undefined && LEGACY_LAWSON_WINDOW_ID_RE.test(alert.windowId));
    for (const alert of storedAlerts) {
      if (alert.notificationId !== undefined && isLegacyAlert(alert)) deadReminderIds.add(alert.notificationId);
    }
    // 缺 notificationId 的旧 schema 记录也是死记录（开关按 notificationId 匹配,永远点不亮）。
    const liveAlerts = storedAlerts.filter(alert =>
      alert.notificationId !== undefined && !deadReminderIds.has(alert.notificationId));
    setActiveAlerts(liveAlerts);
    if (liveAlerts.length !== storedAlerts.length) saveToStorage('oshikatsu_alerts', liveAlerts);
    if (deadReminderIds.size > 0) void cancelReminderIds(deadReminderIds);
    setSearchResultIds(loadJson<string[]>('oshikatsu_search_result_ids', []).filter(id => validEventIds.has(id)));
    setSearchReports(loadJson<TicketSearchReport[]>('oshikatsu_search_reports', []));
    setRecentSearches(loadJson<string[]>('oshikatsu_recent_searches', []));
    setSearchFetchedAt(loadJson<string | null>('oshikatsu_search_fetched_at', null));
  }, []);

  // Save states helper whenever changes trigger
  const saveToStorage = <T,>(key: string, data: T): void => {
    safeSetItem(key, JSON.stringify(data));
  };

  // Helper trigger to showcase beautifully dynamic top status notification popups
  const triggerToast = (title: string, text: string) => {
    setToastMessage({ title, text });
    setTimeout(() => setToastMessage(null), 4500);
  };

  // Dynamic Oshi theme color details
  const activeColorObj = OSHI_COLORS.find(c => c.id === oshiColorId) || OSHI_COLORS[0];

  const handleSelectOshiColor = (id: string) => {
    setOshiColorId(id);
    localStorage.setItem('oshikatsu_color_id', id);
    triggerToast(
      t('toast.themeTitle'),
      t('toast.themeBody', { color: OSHI_COLORS.find(c => c.id === id)?.jpName || id }),
    );
  };

  // Reset database values
  const handleResetDatabase = async () => {
    // 先撤销系统已排程的全部通知,再清库(#71)。否则通知照弹、且记录已清 → 用户无从关闭。
    // best-effort:取消失败(如权限/平台)不该挡住重置本身。
    try {
      await cancelAllReminders();
    } catch (error: unknown) {
      console.warn('[store] 重置时取消通知失败', error);
    }
    const storedLocaleMode = localStorage.getItem(LOCALE_STORAGE_KEY);
    localStorage.clear();
    if (storedLocaleMode) localStorage.setItem(LOCALE_STORAGE_KEY, storedLocaleMode);
    // 迁移标记必须挺过 clear：库已清空，旧格式存量不可能再有，剪枝已无事可做；而标记若丢了，
    // 重置后新搜到的、走旧结构回退路径的 lawson-<纯数字> 会在下次启动被误删。
    localStorage.setItem(LAWSON_ID_MIGRATION_KEY, '1');
    setOshiColorId('pink');
    setEvents([]);
    setArtists([]);
    setVenues([]);
    setExtensions(INITIAL_EXTENSIONS);
    setFavorites([]);
    setFollowedArtists([]);
    setFollowedVenues([]);
    setLastViewed({});
    setSourceStats({});
    setActiveAlerts([]);
    setSearchResultIds([]);
    setSearchReports([]);
    setRecentSearches([]);
    setSearchFetchedAt(null);
    setSearchIsLive(false);
  };

  // Follow/Favorite toggles
  const handleToggleFavorite = (event: ActivityEvent) => {
    // 收藏写入「别名全集」（见 favorites.ts）：稳定键 + id + 成员平台 id。
    // 平台 id 查询无关 → 换个关键词重搜同一场（artistName/聚合 id 漂移）收藏仍命中；
    // 取消时把全部别名清掉（含旧数据的 event.id）。
    const aliases = favoriteAliases(event);
    const isFav = aliases.some(alias => favorites.includes(alias));
    let updated;
    if (isFav) {
      updated = favorites.filter(id => !aliases.includes(id));
      triggerToast(t('toast.favoriteRemovedTitle'), t('toast.favoriteRemovedBody'));
    } else {
      updated = [...favorites, ...aliases.filter(alias => !favorites.includes(alias))];
      triggerToast(t('toast.favoriteAddedTitle'), t('toast.favoriteAddedBody', { title: event.title.slice(0, 15) || '' }));
    }
    setFavorites(updated);
    saveToStorage('oshikatsu_favorites', updated);
  };

  // 关注页「查看 / 检索」某对象时记录时间戳 → 清掉它的「新着」角标。
  const markViewed = (entityId: string) => {
    setLastViewed(prev => {
      const next = { ...prev, [entityId]: new Date().toISOString() };
      saveToStorage('oshikatsu_last_viewed', next);
      return next;
    });
  };

  const handleToggleFollowArtist = (artistId: string) => {
    if (followedArtists.includes(artistId)) {
      const updated = followedArtists.filter(id => id !== artistId);
      setFollowedArtists(updated);
      saveToStorage('oshikatsu_followed_artists', updated);
      // 取关时连带移除持久化记录，避免堆积/出现在「其他」列表。
      const pruned = artists.filter(a => a.id !== artistId);
      if (pruned.length !== artists.length) {
        setArtists(pruned);
        saveToStorage('oshikatsu_artists', pruned);
      }
      triggerToast(t('toast.artistRemovedTitle'), t('toast.artistRemovedBody'));
      return;
    }
    const updated = [...followedArtists, artistId];
    setFollowedArtists(updated);
    saveToStorage('oshikatsu_followed_artists', updated);
    // 没有独立艺人库：关注时从当前 events 取该艺人最小记录并持久化，
    // 这样即使之后换了搜索词（events 变了），关注列表仍稳定显示，不会忽隐忽现。
    let name = artists.find(a => a.id === artistId)?.name || artistId;
    if (!artists.some(a => a.id === artistId)) {
      const src = events.find(e => e.artistId === artistId);
      if (src) {
        name = src.artistName;
        const rec: Artist = {
          id: artistId, name: src.artistName, avatarUrl: src.imageUrl,
          category: src.category, description: '', followerCount: 0, tags: [],
        };
        const updatedArtists = [rec, ...artists];
        setArtists(updatedArtists);
        saveToStorage('oshikatsu_artists', updatedArtists);
      }
    }
    triggerToast(t('toast.artistAddedTitle'), t('toast.artistAddedBody', { name }));
  };

  const handleToggleFollowVenue = (venueId: string) => {
    if (followedVenues.includes(venueId)) {
      const updated = followedVenues.filter(id => id !== venueId);
      setFollowedVenues(updated);
      saveToStorage('oshikatsu_followed_venues', updated);
      const pruned = venues.filter(v => v.id !== venueId);
      if (pruned.length !== venues.length) {
        setVenues(pruned);
        saveToStorage('oshikatsu_venues', pruned);
      }
      triggerToast(t('toast.venueRemovedTitle'), t('toast.venueRemovedBody'));
      return;
    }
    const updated = [...followedVenues, venueId];
    setFollowedVenues(updated);
    saveToStorage('oshikatsu_followed_venues', updated);
    let name = venues.find(v => v.id === venueId)?.name || venueId;
    if (!venues.some(v => v.id === venueId)) {
      const src = events.find(e => e.venueId === venueId);
      if (src) {
        name = src.venueName;
        const rec: Venue = {
          id: venueId, name: src.venueName, capacity: 0,
          region: src.region, address: '', accessInfo: '', imageUrl: src.imageUrl,
        };
        const updatedVenues = [rec, ...venues];
        setVenues(updatedVenues);
        saveToStorage('oshikatsu_venues', updatedVenues);
      }
    }
    triggerToast(t('toast.venueAddedTitle'), t('toast.venueAddedBody', { name: name.slice(0, 15) }));
  };

  // 流式搜索：每个平台 settle 就立刻把它的结果合并进来并刷新 UI（不等最慢的源）。
  const handleRunPlatformSearch = async (query: string, activePlatforms: string[]) => {
    const q = query.trim();
    if (!q) return { events: [], reports: [] };

    // 取消上一个还在跑的搜索（旧结果忽略）
    searchAbortRef.current?.abort();
    const controller = new AbortController();
    searchAbortRef.current = controller;

    setIsSearching(true);
    setSearchDegraded(false);
    // 函数式更新：连续快速搜索时不吃闭包里的旧列表
    setRecentSearches(prev => {
      const recent = [q, ...prev.filter(item => item !== q)].slice(0, 8);
      saveToStorage('oshikatsu_recent_searches', recent);
      return recent;
    });

    // 先给每个启用平台一个「搜索中」占位报告，让用户立刻看到进度
    const reportsByPlatform = new Map<TicketPlatform, TicketSearchReport>();
    for (const platform of searchableTargets(activePlatforms)) {
      reportsByPlatform.set(platform, { platform, status: 'pending', count: 0, handoffUrl: buildPlatformSearchUrl(platform, q) });
    }
    const rawEventsById = new Map<string, ActivityEvent>();
    setSearchReports([...reportsByPlatform.values()]);
    setSearchResultIds([]);

    const apply = () => {
      const searchEvents = aggregateConcerts([...rawEventsById.values()]);
      setSearchReports([...reportsByPlatform.values()]);
      setSearchResultIds(searchEvents.map(event => event.id));
      // 增量合并进全局事件（含已持久化的），按 id 去重 + 跨平台聚合，幂等
      setEvents(prev => aggregateConcerts(dedupeEvents([...searchEvents, ...prev])));
    };

    try {
      await searchPlatformsStreaming(q, activePlatforms, (report, evs) => {
        if (controller.signal.aborted) return;
        reportsByPlatform.set(report.platform, report);
        for (const event of evs) rawEventsById.set(event.id, event);
        apply();
      }, {
        signal: controller.signal,
        onMeta: (meta) => {
          if (!controller.signal.aborted) setSearchDegraded(meta.proxyDegraded);
        },
      });

      if (controller.signal.aborted) return { events: [], reports: [] };

      // 全部完成：持久化最终结果
      const searchEvents = aggregateConcerts([...rawEventsById.values()]);
      const reports = [...reportsByPlatform.values()];
      const ids = searchEvents.map(event => event.id);
      setSearchReports(reports);
      setSearchResultIds(ids);
      saveToStorage('oshikatsu_search_result_ids', ids);
      saveToStorage('oshikatsu_search_reports', reports);
      // 记录每个源这次抓取的时间/命中数/状态（插件页本地源管理展示）。
      const statsAt = new Date().toISOString();
      setSearchFetchedAt(statsAt);
      setSearchIsLive(true);
      saveToStorage('oshikatsu_search_fetched_at', statsAt);
      setSourceStats(prev => {
        const next = { ...prev };
        for (const report of reports) {
          if (report.status === 'pending') continue;
          next[report.platform] = { lastFetchedAt: statsAt, count: report.count, status: report.status };
        }
        saveToStorage('oshikatsu_source_stats', next);
        return next;
      });
      setEvents(prev => {
        const merged = aggregateConcerts(dedupeEvents([...searchEvents, ...prev]));
        saveToStorage('oshikatsu_events', merged);
        return merged;
      });
      return { events: searchEvents, reports };
    } finally {
      if (searchAbortRef.current === controller) {
        setIsSearching(false);
        searchAbortRef.current = null;
      }
    }
  };

  const clearSearchResults = () => {
    searchAbortRef.current?.abort();
    setSearchResultIds([]);
    setSearchReports([]);
    setSearchFetchedAt(null);
    setSearchIsLive(false);
    saveToStorage('oshikatsu_search_result_ids', []);
    saveToStorage('oshikatsu_search_reports', []);
    localStorage.removeItem('oshikatsu_search_fetched_at');
  };

  // 详情页懒加载（如 Pia 精确受付日期）补全后回写：替换同 id 事件并持久化，
  // 让时间线/提醒也用上补全后的日期。
  const handleEnrichEvent = (updatedEvent: ActivityEvent) => {
    setEvents(prev => {
      const next = prev.map(event => (event.id === updatedEvent.id ? updatedEvent : event));
      saveToStorage('oshikatsu_events', next);
      return next;
    });
  };

  // Alert Management Add/Remove alarm indicators
  // 副作用(排程/取消)先 await 完成,状态写入一律走函数式更新 setActiveAlerts(prev=>...):
  // 快速连开多个提醒时,闭包捕获的旧 activeAlerts 会让后写覆盖先写 → 丢失的那条成为
  // UI 管不到的孤儿系统通知(#73)。函数式更新 + 按 notificationId 幂等去重根除该竞态。
  const handleToggleAlert = async (target: ReminderTarget) => {
    const isRemoving = activeAlerts.some(a => a.notificationId === target.notificationId);
    if (isRemoving) {
      await cancelReminderTarget(target.notificationId);
      setActiveAlerts(prev => {
        const next = prev.filter(a => a.notificationId !== target.notificationId);
        saveToStorage('oshikatsu_alerts', next);
        return next;
      });
      triggerToast(t('toast.reminderRemovedTitle'), t('toast.reminderRemovedBody'));
      return;
    }

    try {
      await scheduleReminderTarget(target, t);
    } catch (error: unknown) {
      triggerToast(t('toast.reminderDisabledTitle'), error instanceof Error ? error.message : t('toast.reminderDisabledBody'));
      return;
    }

    const newAlert: NotificationAlert = {
      id: `alert-${target.notificationId}`,
      eventId: target.eventId,
      eventTitle: target.eventTitle,
      platform: target.platform,
      type: target.type,
      alertDate: target.scheduleAt.slice(0, 10),
      isTriggered: false,
      windowId: target.windowId,
      scheduleAt: target.scheduleAt,
      notificationId: target.notificationId,
    };

    setActiveAlerts(prev => {
      // 幂等:并发/重复触发已插入同 id 时不再追加(系统侧 schedule 同 id 覆盖,不产孤儿)
      if (prev.some(a => a.notificationId === newAlert.notificationId)) return prev;
      const next = [...prev, newAlert];
      saveToStorage('oshikatsu_alerts', next);
      return next;
    });
    triggerToast(t('toast.reminderAddedTitle'), t('toast.reminderAddedBody', { label: target.label }));
  };

  // Source plugin enable/disable switches (controls which platforms search)
  const handleToggleExtension = (id: string) => {
    const updated = extensions.map(ext => {
      if (ext.id === id) {
        const nextState = !ext.isEnabled;
        if (nextState) {
          triggerToast(t('toast.sourceEnabledTitle'), t('toast.sourceEnabledBody', { name: ext.name }));
        } else {
          triggerToast(t('toast.sourceDisabledTitle'), t('toast.sourceDisabledBody', { name: ext.name }));
        }
        return { ...ext, isEnabled: nextState };
      }
      return ext;
    });

    setExtensions(updated);
    saveToStorage('oshikatsu_extensions', updated);
  };

  return {
    // theme
    oshiColorId,
    activeColorObj,
    handleSelectOshiColor,
    // data
    events,
    artists,
    venues,
    extensions,
    sourceStats,
    searchResultIds,
    searchReports,
    recentSearches,
    isSearching,
    searchDegraded,
    searchFetchedAt,
    searchIsLive,
    favorites,
    followedArtists,
    followedVenues,
    lastViewed,
    activeAlerts,
    // toast
    toastMessage,
    setToastMessage,
    // handlers
    handleResetDatabase,
    handleToggleFavorite,
    handleToggleFollowArtist,
    handleToggleFollowVenue,
    markViewed,
    handleRunPlatformSearch,
    clearSearchResults,
    handleEnrichEvent,
    handleToggleAlert,
    handleToggleExtension,
  };
}

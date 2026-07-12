import { useEffect, useRef, useState } from 'react';
import {
  ActivityEvent, Artist, Venue, ExtensionSource,
  NotificationAlert, ReminderTarget, TicketSearchReport, TicketPlatform, SourceStat,
} from '../types';
import { INITIAL_EXTENSIONS, OSHI_COLORS } from '../data/mockData';
import { searchPlatformsStreaming, searchableTargets } from '../sources';
import { buildPlatformSearchUrl, dedupeEvents } from '../sources/shared';
import { isProxyConfigured } from '../sources/proxy';
import { aggregateConcerts } from '../sources/aggregate';
import { cancelAllReminders, cancelReminderTarget, scheduleReminderTarget } from '../notifications';
import { favoriteAliases } from '../favorites';
import { supportsLawsonSource } from '../platform';
import { LOCALE_STORAGE_KEY, TFunction } from '../i18n/core';

const LIVE_ID_PREFIXES = ['agg-', 'eplus-', 'pia-', 'td-', 'lp-', 'lawson-'];

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
    // Aggregate on load so events persisted before cross-platform merge migrate cleanly.
    const loadedEvents = aggregateConcerts(loadPersistedEvents(storedEvents));
    setEvents(loadedEvents);
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
    setActiveAlerts(loadJson<NotificationAlert[]>('oshikatsu_alerts', []));
    setSearchResultIds(loadJson<string[]>('oshikatsu_search_result_ids', []).filter(id => validEventIds.has(id)));
    setSearchReports(loadJson<TicketSearchReport[]>('oshikatsu_search_reports', []));
    setRecentSearches(loadJson<string[]>('oshikatsu_recent_searches', []));
    setSearchFetchedAt(loadJson<string | null>('oshikatsu_search_fetched_at', null));
  }, []);

  // Save states helper whenever changes trigger
  const saveToStorage = <T,>(key: string, data: T): void => {
    localStorage.setItem(key, JSON.stringify(data));
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

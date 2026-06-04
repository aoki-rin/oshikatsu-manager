import { useEffect, useRef, useState } from 'react';
import {
  ActivityEvent, Artist, Venue, ExtensionSource,
  NotificationAlert, ReminderTarget, TicketSearchReport, TicketPlatform,
} from '../types';
import { INITIAL_EXTENSIONS, OSHI_COLORS } from '../data/mockData';
import { searchPlatformsStreaming, searchableTargets } from '../sources';
import { buildPlatformSearchUrl, dedupeEvents } from '../sources/shared';
import { aggregateConcerts } from '../sources/aggregate';
import { cancelReminderTarget, scheduleReminderTarget } from '../notifications';
import { favoriteKey } from '../favorites';
import { LOCALE_STORAGE_KEY, TFunction } from '../i18n/core';

const LIVE_ID_PREFIXES = ['agg-', 'eplus-', 'pia-', 'td-', 'lp-', 'lawson-'];

function loadPersistedEvents(raw: string | null): ActivityEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as ActivityEvent[];
    return parsed
      .filter(event => event.sourceKind === 'live' || event.sourceKind === 'manual' || event.id.startsWith('ev-custom-') || LIVE_ID_PREFIXES.some(prefix => event.id.startsWith(prefix)))
      .map(event => ({
        ...event,
        sourceKind: event.sourceKind || (event.id.startsWith('ev-custom-') ? 'manual' : 'live'),
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
  // Cancels the previous in-flight search when a new one starts (stale results ignored).
  const searchAbortRef = useRef<AbortController | null>(null);

  // Followed categories states
  const [favorites, setFavorites] = useState<string[]>([]);
  const [followedArtists, setFollowedArtists] = useState<string[]>([]);
  const [followedVenues, setFollowedVenues] = useState<string[]>([]);
  // 关注对象的「上次查看」时间戳（entity id → ISO），给 MyOshi 的「新着」角标用。
  const [lastViewed, setLastViewed] = useState<Record<string, string>>({});

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
    // real platform searches or explicit manual entries only.
    const storedEvents = localStorage.getItem('oshikatsu_events');
    // Aggregate on load so events persisted before cross-platform merge migrate cleanly.
    const loadedEvents = aggregateConcerts(loadPersistedEvents(storedEvents));
    setEvents(loadedEvents);
    const validEventIds = new Set(loadedEvents.map(event => event.id));

    const storedArtists = localStorage.getItem('oshikatsu_artists');
    setArtists(storedArtists ? JSON.parse(storedArtists) : []);

    const storedVenues = localStorage.getItem('oshikatsu_venues');
    setVenues(storedVenues ? JSON.parse(storedVenues) : []);

    const storedExtensions = localStorage.getItem('oshikatsu_extensions');
    if (storedExtensions) {
      const stored = JSON.parse(storedExtensions) as ExtensionSource[];
      const merged = INITIAL_EXTENSIONS.map(defaultExt => ({
        ...defaultExt,
        ...stored.find(ext => ext.id === defaultExt.id),
      })).map(ext => ext.id === 'ext-lawson' ? { ...ext, isInstalled: true, isEnabled: true } : ext);
      setExtensions(merged);
    } else {
      setExtensions(INITIAL_EXTENSIONS);
    }

    // 3. User relationships
    const storedFavs = localStorage.getItem('oshikatsu_favorites');
    if (storedFavs) {
      // 收藏键可能是稳定键(新)或 event.id(旧)：两者都算有效，避免聚合后丢收藏。
      const validFavKeys = new Set(loadedEvents.flatMap(event => [event.id, favoriteKey(event)]));
      setFavorites((JSON.parse(storedFavs) as string[]).filter(id => validFavKeys.has(id)));
    }

    const storedFollowedArt = localStorage.getItem('oshikatsu_followed_artists');
    if (storedFollowedArt) setFollowedArtists(JSON.parse(storedFollowedArt));

    const storedFollowedVen = localStorage.getItem('oshikatsu_followed_venues');
    if (storedFollowedVen) setFollowedVenues(JSON.parse(storedFollowedVen));

    const storedLastViewed = localStorage.getItem('oshikatsu_last_viewed');
    if (storedLastViewed) setLastViewed(JSON.parse(storedLastViewed));

    // 4. Alerts and configurations
    const storedAlerts = localStorage.getItem('oshikatsu_alerts');
    if (storedAlerts) setActiveAlerts(JSON.parse(storedAlerts));

    const storedResultIds = localStorage.getItem('oshikatsu_search_result_ids');
    if (storedResultIds) setSearchResultIds((JSON.parse(storedResultIds) as string[]).filter(id => validEventIds.has(id)));

    const storedReports = localStorage.getItem('oshikatsu_search_reports');
    if (storedReports) setSearchReports(JSON.parse(storedReports));

    const storedRecentSearches = localStorage.getItem('oshikatsu_recent_searches');
    if (storedRecentSearches) setRecentSearches(JSON.parse(storedRecentSearches));
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
  const handleResetDatabase = () => {
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
    setActiveAlerts([]);
    setSearchResultIds([]);
    setSearchReports([]);
    setRecentSearches([]);
  };

  // Follow/Favorite toggles
  const handleToggleFavorite = (event: ActivityEvent) => {
    // 用稳定身份键收藏（见 favorites.ts）：单平台演出被跨平台聚合后 id 会变，
    // 用 id 当键会丢收藏。兼容旧数据：移除时连旧 event.id 一并清掉。
    const key = favoriteKey(event);
    const isFav = favorites.includes(key) || favorites.includes(event.id);
    let updated;
    if (isFav) {
      updated = favorites.filter(id => id !== key && id !== event.id);
      triggerToast(t('toast.favoriteRemovedTitle'), t('toast.favoriteRemovedBody'));
    } else {
      updated = [...favorites, key];
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
    const recent = [q, ...recentSearches.filter(item => item !== q)].slice(0, 8);
    setRecentSearches(recent);
    saveToStorage('oshikatsu_recent_searches', recent);

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
      }, { signal: controller.signal });

      if (controller.signal.aborted) return { events: [], reports: [] };

      // 全部完成：持久化最终结果
      const searchEvents = aggregateConcerts([...rawEventsById.values()]);
      const reports = [...reportsByPlatform.values()];
      const ids = searchEvents.map(event => event.id);
      setSearchReports(reports);
      setSearchResultIds(ids);
      saveToStorage('oshikatsu_search_result_ids', ids);
      saveToStorage('oshikatsu_search_reports', reports);
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
    saveToStorage('oshikatsu_search_result_ids', []);
    saveToStorage('oshikatsu_search_reports', []);
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
  const handleToggleAlert = async (target: ReminderTarget) => {
    const existingIndex = activeAlerts.findIndex(a => a.notificationId === target.notificationId);
    let updated;
    if (existingIndex > -1) {
      await cancelReminderTarget(target.notificationId);
      updated = activeAlerts.filter((_, idx) => idx !== existingIndex);
      triggerToast(t('toast.reminderRemovedTitle'), t('toast.reminderRemovedBody'));
    } else {
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

      updated = [...activeAlerts, newAlert];
      triggerToast(t('toast.reminderAddedTitle'), t('toast.reminderAddedBody', { label: target.label }));
    }

    setActiveAlerts(updated);
    saveToStorage('oshikatsu_alerts', updated);
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
    searchResultIds,
    searchReports,
    recentSearches,
    isSearching,
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

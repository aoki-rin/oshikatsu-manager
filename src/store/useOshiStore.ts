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
export function useOshiStore() {
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
      setFavorites((JSON.parse(storedFavs) as string[]).filter(id => validEventIds.has(id)));
    }

    const storedFollowedArt = localStorage.getItem('oshikatsu_followed_artists');
    if (storedFollowedArt) setFollowedArtists(JSON.parse(storedFollowedArt));

    const storedFollowedVen = localStorage.getItem('oshikatsu_followed_venues');
    if (storedFollowedVen) setFollowedVenues(JSON.parse(storedFollowedVen));

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
    triggerToast('我推主题切换成功', `已成功挂载「${OSHI_COLORS.find(c => c.id === id)?.name}」！全场焦点已就绪。`);
  };

  // Reset database values
  const handleResetDatabase = () => {
    localStorage.clear();
    setOshiColorId('pink');
    setEvents([]);
    setArtists([]);
    setVenues([]);
    setExtensions(INITIAL_EXTENSIONS);
    setFavorites([]);
    setFollowedArtists([]);
    setFollowedVenues([]);
    setActiveAlerts([]);
    setSearchResultIds([]);
    setSearchReports([]);
    setRecentSearches([]);
  };

  // Follow/Favorite toggles
  const handleToggleFavorite = (eventId: string) => {
    const isFav = favorites.includes(eventId);
    let updated;
    if (isFav) {
      updated = favorites.filter(id => id !== eventId);
      triggerToast('取消收藏', '演出已移出您的近期临期备忘录。');
    } else {
      updated = [...favorites, eventId];
      const ev = events.find(e => e.id === eventId);
      triggerToast('★ 收藏入库成功', `《${ev?.title.slice(0, 15)}...》已加入票程督防列表！`);
    }
    setFavorites(updated);
    saveToStorage('oshikatsu_favorites', updated);
  };

  const handleToggleFollowArtist = (artistId: string) => {
    const isFollowed = followedArtists.includes(artistId);
    let updated;
    if (isFollowed) {
      updated = followedArtists.filter(id => id !== artistId);
      triggerToast('取消关注艺人', '已将艺人移出常推阵容。');
    } else {
      updated = [...followedArtists, artistId];
      const art = artists.find(a => a.id === artistId);
      triggerToast('♥ 加入推し主力阵营', `已确立对 [${art?.name}] 的重点特异关注！`);
    }
    setFollowedArtists(updated);
    saveToStorage('oshikatsu_followed_artists', updated);
  };

  const handleToggleFollowVenue = (venueId: string) => {
    const isFollowed = followedVenues.includes(venueId);
    let updated;
    if (isFollowed) {
      updated = followedVenues.filter(id => id !== venueId);
      triggerToast('取消关注场馆', '已停止对该演厅的快捷日程合并。');
    } else {
      updated = [...followedVenues, venueId];
      const ven = venues.find(v => v.id === venueId);
      triggerToast('🏢 圣地常驻标记', `已将 [${ven?.name.slice(0, 15)}] 加入经常往返地。`);
    }
    setFollowedVenues(updated);
    saveToStorage('oshikatsu_followed_venues', updated);
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
      triggerToast('⏰ 提醒时钟卸载', '已关闭该节点倒计时。');
    } else {
      try {
        await scheduleReminderTarget(target);
      } catch (error: unknown) {
        triggerToast('提醒未启用', error instanceof Error ? error.message : '系统通知权限未开启。');
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
      triggerToast('⏰ 本地闹钟设定', `已为您设置【${target.label}】。系统会在指定时间推送。`);
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
          triggerToast('已启用该源', `【${ext.name}】已启用，下次搜索会包含该平台。`);
        } else {
          triggerToast('已停用该源', `【${ext.name}】已停用，搜索时会跳过该平台。`);
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
    activeAlerts,
    // toast
    toastMessage,
    setToastMessage,
    // handlers
    handleResetDatabase,
    handleToggleFavorite,
    handleToggleFollowArtist,
    handleToggleFollowVenue,
    handleRunPlatformSearch,
    clearSearchResults,
    handleEnrichEvent,
    handleToggleAlert,
    handleToggleExtension,
  };
}

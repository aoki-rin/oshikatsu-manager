import { useEffect, useState } from 'react';
import {
  ActivityEvent, Artist, Venue, ExtensionSource,
  NotificationAlert, ReminderTarget, TicketSearchReport,
} from '../types';
import { INITIAL_EXTENSIONS, OSHI_COLORS } from '../data/mockData';
import { searchAllPlatforms } from '../sources';
import { dedupeEvents } from '../sources/shared';
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

  // Custom Local Events adder
  const handleAddCustomEvent = (newEvent: ActivityEvent) => {
    const event = { ...newEvent, sourceKind: 'manual' as const };
    const updated = dedupeEvents([event, ...events]);
    setEvents(updated);
    saveToStorage('oshikatsu_events', updated);
    triggerToast('➕ 本地Live同步就绪', `已自主注册《${newEvent.title.slice(0, 18)}...》，并确立多节点时钟守护！`);
  };

  const handleRunPlatformSearch = async (query: string, activePlatforms: string[]) => {
    const q = query.trim();
    if (!q) return { events: [], reports: [] };
    setIsSearching(true);
    try {
      const result = await searchAllPlatforms(q, activePlatforms);
      const ids = result.events.map(event => event.id);
      const recent = [q, ...recentSearches.filter(item => item !== q)].slice(0, 8);
      // Re-aggregate the combined set so freshly-fetched results merge with persisted
      // events of the same concert (stable agg- ids keep searchResultIds valid).
      const merged = aggregateConcerts(dedupeEvents([...result.events, ...events]));
      setEvents(merged);
      setSearchResultIds(ids);
      setSearchReports(result.reports);
      setRecentSearches(recent);
      saveToStorage('oshikatsu_events', merged);
      saveToStorage('oshikatsu_search_result_ids', ids);
      saveToStorage('oshikatsu_search_reports', result.reports);
      saveToStorage('oshikatsu_recent_searches', recent);
      return result;
    } finally {
      setIsSearching(false);
    }
  };

  const clearSearchResults = () => {
    setSearchResultIds([]);
    setSearchReports([]);
    saveToStorage('oshikatsu_search_result_ids', []);
    saveToStorage('oshikatsu_search_reports', []);
  };

  // Custom Local Artist adder
  const handleAddCustomArtist = (newArtist: Artist) => {
    const updated = [newArtist, ...artists];
    setArtists(updated);
    saveToStorage('oshikatsu_artists', updated);

    // Auto follow this newly added artist
    const followedUpdated = [...followedArtists, newArtist.id];
    setFollowedArtists(followedUpdated);
    saveToStorage('oshikatsu_followed_artists', followedUpdated);

    triggerToast('♥ 新推本命入库', `自主关注艺人「${newArtist.name}」已立绘，祝现场大获中签！`);
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
    handleAddCustomEvent,
    handleRunPlatformSearch,
    clearSearchResults,
    handleAddCustomArtist,
    handleToggleAlert,
    handleToggleExtension,
  };
}

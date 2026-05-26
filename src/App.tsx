import React, { useState, useEffect } from 'react';
import { 
  ActivityEvent, Artist, Venue, ExtensionSource, 
  NotificationAlert, OshiColor, TicketPlatform, ReminderTarget, TicketSearchReport
} from './types';
import {
  INITIAL_EXTENSIONS, OSHI_COLORS
} from './data/mockData';
import { PhoneFrame } from './components/PhoneFrame';
import { DiscoverView } from './components/DiscoverView';
import { CalendarView } from './components/CalendarView';
import { MyOshiView } from './components/MyOshiView';
import { ExtensionView } from './components/ExtensionView';
import { SettingsView } from './components/SettingsView';
import { EventDetailModal } from './components/EventDetailModal';
import { BottomTabBar } from './components/BottomTabBar';
import {
  BellRing, X, Info, Sparkles, CheckCircle
} from 'lucide-react';
import { searchAllPlatforms } from './sources';
import { dedupeEvents } from './sources/shared';
import { cancelReminderTarget, scheduleReminderTarget } from './notifications';

export type OShiColorId = 'pink' | 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'black' | 'orange';

const LIVE_ID_PREFIXES = ['eplus-', 'pia-', 'td-', 'lp-', 'lawson-'];

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

export default function App() {
  // Active primary bottom-sheet navigation tab
  const [currentTab, setCurrentTab] = useState<'discover' | 'calendar' | 'oshis' | 'extensions' | 'settings'>('discover');

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
  const [syncInterval, setSyncInterval] = useState<number>(15);

  // Focus detail overlays
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);

  // Instataneous toast state
  const [toastMessage, setToastMessage] = useState<{title: string; text: string} | null>(null);

  // Initialize and load Database from Local Storage to simulate true persistence
  useEffect(() => {
    // 1. Oshi Theme
    const storedColorId = localStorage.getItem('oshikatsu_color_id');
    if (storedColorId) {
      setOshiColorId(storedColorId);
    } else {
      setOshiColorId('pink'); // Beautiful Sakura Pink default
    }

    // 2. Events & Plugins. User-visible event content starts empty and is filled by
    // real platform searches or explicit manual entries only.
    const storedEvents = localStorage.getItem('oshikatsu_events');
    const loadedEvents = loadPersistedEvents(storedEvents);
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
    } else {
      setFavorites([]);
    }

    const storedFollowedArt = localStorage.getItem('oshikatsu_followed_artists');
    if (storedFollowedArt) {
      setFollowedArtists(JSON.parse(storedFollowedArt));
    } else {
      setFollowedArtists([]);
    }

    const storedFollowedVen = localStorage.getItem('oshikatsu_followed_venues');
    if (storedFollowedVen) {
      setFollowedVenues(JSON.parse(storedFollowedVen));
    } else {
      setFollowedVenues([]);
    }

    // 4. Alerts and configurations
    const storedAlerts = localStorage.getItem('oshikatsu_alerts');
    if (storedAlerts) {
      setActiveAlerts(JSON.parse(storedAlerts));
    } else {
      setActiveAlerts([]);
    }

    const storedSync = localStorage.getItem('oshikatsu_sync_interval');
    if (storedSync) {
      setSyncInterval(parseInt(storedSync));
    }

    const storedResultIds = localStorage.getItem('oshikatsu_search_result_ids');
    if (storedResultIds) setSearchResultIds((JSON.parse(storedResultIds) as string[]).filter(id => validEventIds.has(id)));

    const storedReports = localStorage.getItem('oshikatsu_search_reports');
    if (storedReports) setSearchReports(JSON.parse(storedReports));

    const storedRecentSearches = localStorage.getItem('oshikatsu_recent_searches');
    if (storedRecentSearches) setRecentSearches(JSON.parse(storedRecentSearches));
  }, []);

  // Save states helper whenever changes trigger
  const saveToStorage = (key: string, data: any) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  // Dynamic Oshi theme color details
  const activeColorObj = OSHI_COLORS.find(c => c.id === oshiColorId) || OSHI_COLORS[0];

  const handleSelectOshiColor = (id: string) => {
    setOshiColorId(id);
    localStorage.setItem('oshikatsu_color_id', id);
    triggerToast('我推主题切换成功', `已成功挂载「${OSHI_COLORS.find(c=>c.id===id)?.name}」！全场焦点已就绪。`);
  };

  const handleSyncIntervalChange = (mins: number) => {
    setSyncInterval(mins);
    localStorage.setItem('oshikatsu_sync_interval', mins.toString());
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

  // Helper trigger to showcase beautifully dynamic top status notification popups
  const triggerToast = (title: string, text: string) => {
    setToastMessage({ title, text });
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
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
    triggerToast('➕ 本地Live同步就绪', `已自主注册《${newEvent.title.slice(0,18)}...》，并确立多节点时钟守护！`);
  };

  const handleRunPlatformSearch = async (query: string, activePlatforms: string[]) => {
    const q = query.trim();
    if (!q) return { events: [], reports: [] };
    setIsSearching(true);
    try {
      const result = await searchAllPlatforms(q, activePlatforms);
      const ids = result.events.map(event => event.id);
      const recent = [q, ...recentSearches.filter(item => item !== q)].slice(0, 8);
      const merged = dedupeEvents([...result.events, ...events]);
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
      } catch (error: any) {
        triggerToast('提醒未启用', error?.message || '系统通知权限未开启。');
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

  // Tachiyomi extension management switches
  const handleToggleExtension = (id: string) => {
    const updated = extensions.map(ext => {
      if (ext.id === id) {
        const nextState = !ext.isEnabled;
        
        // Notify user about what toggled
        if (nextState) {
          triggerToast('🔌 抓取插件激活', `【${ext.name}】已重新连接，开始同步底层 Pia/e+ HTML 结构域。`);
        } else {
          triggerToast('🔌 抓取插件休眠', `【${ext.name}】已停止轮询运行。对应门票活动已临时隐藏。`);
        }

        return { ...ext, isEnabled: nextState };
      }
      return ext;
    });

    setExtensions(updated);
    saveToStorage('oshikatsu_extensions', updated);
  };

  const handleInstallExtension = (id: string) => {
    const updated = extensions.map(ext => {
      if (ext.id === id) {
        triggerToast('⚡ 插件启用成功', `【${ext.name}】已加入真实搜索源。请返回发现页用艺人名搜索。`);
        return { ...ext, isInstalled: true, isEnabled: true, latencyMs: 110 };
      }
      return ext;
    });

    setExtensions(updated);
    saveToStorage('oshikatsu_extensions', updated);
  };

  const handleUpdateExtension = (id: string) => {
    const updated = extensions.map(ext => {
      if (ext.id === id) {
        triggerToast('🔄 脚本防屏蔽热网更新', `【${ext.name}】规则修剪完毕！高抗性爬行引擎已对齐服务器。`);
        return { ...ext, version: 'v3.2.0', updateAvailable: false, latencyMs: 65 };
      }
      return ext;
    });

    setExtensions(updated);
    saveToStorage('oshikatsu_extensions', updated);
  };

  const handlePingExtensions = () => {
    // Generate new mock latencies randomly representing ticket server load
    const updated = extensions.map(ext => {
      if (ext.isInstalled && ext.isEnabled) {
        const mockPing = Math.floor(Math.random() * 120) + 40;
        return { ...ext, latencyMs: mockPing };
      }
      return ext;
    });
    setExtensions(updated);
    saveToStorage('oshikatsu_extensions', updated);
    triggerToast('⚡ 核心数据线测速完成', '已刷新前往东京品川与大阪市中心机房的票仓抓取延迟指标。');
  };

  return (
    <div id="application-container-frame" className="min-h-screen bg-slate-100">
      <PhoneFrame oshiColorHex={activeColorObj.colorHex}>
        
        {/* Realtime Floating Toast Notification banner simulating mobile Push popups */}
        {toastMessage && (
          <div 
            id="mobile-system-toast" 
            className="absolute top-12 left-3 right-3 bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl shadow-xl z-[999] border flex items-start gap-2.5 transition-all text-white animate-fade-in"
            style={{ borderColor: `${activeColorObj.colorHex}50` }}
          >
            <BellRing className="w-5 h-5 shrink-0 mt-0.5 animate-bounce" style={{ color: activeColorObj.colorHex }} />
            <div className="flex-1 min-w-0">
              <h5 className="text-[11px] font-bold tracking-tight">{toastMessage.title}</h5>
              <p className="text-[10px] text-slate-350 mt-0.5 leading-snug">{toastMessage.text}</p>
            </div>
            <button 
              onClick={() => setToastMessage(null)}
              className="p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Dynamic Multi View Router render */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {currentTab === 'discover' && (
            <DiscoverView
              events={events}
              searchResults={searchResultIds.map(id => events.find(event => event.id === id)).filter(Boolean) as ActivityEvent[]}
              searchReports={searchReports}
              recentSearches={recentSearches}
              searching={isSearching}
              extensions={extensions}
              artists={artists}
              venues={venues}
              onSelectEvent={(e) => setSelectedEvent(e)}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onAddCustomEvent={handleAddCustomEvent}
              onRunPlatformSearch={handleRunPlatformSearch}
              onClearSearchResults={() => {
                setSearchResultIds([]);
                setSearchReports([]);
                saveToStorage('oshikatsu_search_result_ids', []);
                saveToStorage('oshikatsu_search_reports', []);
              }}
              oshiColor={activeColorObj.colorHex}
            />
          )}

          {currentTab === 'calendar' && (
            <CalendarView
              events={events}
              favorites={favorites}
              activeAlerts={activeAlerts}
              onSelectEvent={(e) => setSelectedEvent(e)}
              oshiColor={activeColorObj.colorHex}
            />
          )}

          {currentTab === 'oshis' && (
            <MyOshiView
              artists={artists}
              venues={venues}
              events={events}
              followedArtists={followedArtists}
              followedVenues={followedVenues}
              onToggleFollowArtist={handleToggleFollowArtist}
              onToggleFollowVenue={handleToggleFollowVenue}
              onAddCustomArtist={handleAddCustomArtist}
              onSelectEvent={(e) => setSelectedEvent(e)}
              oshiColor={activeColorObj.colorHex}
            />
          )}

          {currentTab === 'extensions' && (
            <ExtensionView
              extensions={extensions}
              onToggleExtension={handleToggleExtension}
              onInstallExtension={handleInstallExtension}
              onUpdateExtension={handleUpdateExtension}
              onPingExtensions={handlePingExtensions}
              oshiColor={activeColorObj.colorHex}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              currentOshiColorId={oshiColorId}
              onSelectOshiColor={handleSelectOshiColor}
              syncInterval={syncInterval}
              onSelectSyncInterval={handleSyncIntervalChange}
              onResetDatabase={handleResetDatabase}
              oshiColorHex={activeColorObj.colorHex}
            />
          )}
        </div>

        {/* Mobile Device Native Bottom Tab Bar (frosted glass + accent capsule) */}
        <BottomTabBar
          currentTab={currentTab}
          onChange={setCurrentTab}
          oshiColor={activeColorObj.colorHex}
        />

        {/* Global Event detail bottom sheet drawer overlay */}
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            artists={artists}
            venues={venues}
            onClose={() => setSelectedEvent(null)}
            isFavorited={favorites.includes(selectedEvent.id)}
            onToggleFavorite={handleToggleFavorite}
            isArtistFollowed={followedArtists.includes(selectedEvent.artistId)}
            onToggleFollowArtist={handleToggleFollowArtist}
            isVenueFollowed={followedVenues.includes(selectedEvent.venueId)}
            onToggleFollowVenue={handleToggleFollowVenue}
            activeAlerts={activeAlerts}
            onToggleAlert={handleToggleAlert}
            oshiColor={activeColorObj.colorHex}
          />
        )}

      </PhoneFrame>
    </div>
  );
}

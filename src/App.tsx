import React, { useState, useEffect } from 'react';
import { 
  ActivityEvent, Artist, Venue, ExtensionSource, 
  NotificationAlert, OshiColor, TicketPlatform 
} from './types';
import { 
  INITIAL_EVENTS, INITIAL_ARTISTS, INITIAL_VENUES, 
  INITIAL_EXTENSIONS, OSHI_COLORS 
} from './data/mockData';
import { PhoneFrame } from './components/PhoneFrame';
import { DiscoverView } from './components/DiscoverView';
import { CalendarView } from './components/CalendarView';
import { MyOshiView } from './components/MyOshiView';
import { ExtensionView } from './components/ExtensionView';
import { SettingsView } from './components/SettingsView';
import { EventDetailModal } from './components/EventDetailModal';
import { 
  Compass, Calendar, Heart, Puzzle, Settings, 
  BellRing, X, Info, Sparkles, CheckCircle 
} from 'lucide-react';

export type OShiColorId = 'pink' | 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'black' | 'orange';

// Extra events that appear when custom Tachiyomi extensions (e.g. TIGET, Rakuten) are enabled
const EXTRA_EXTENSION_EVENTS: ActivityEvent[] = [
  {
    id: 'ev-ext-tiget-fes',
    title: 'TIGET Exclusive: 「戦国アイドル大戦 2026」 Sengoku Chika-Idol Festival',
    artistId: 'art-chika-stars',
    artistName: 'キラメキ☆Starlet',
    venueId: 'ven-shinjuku-blaze',
    venueName: '新宿BLAZE',
    date: '2026-05-28', // Next week
    time: '14:00',
    region: '关东 (东京)',
    platform: 'LivePocket', // Standardized fallbacks
    price: '¥4,500',
    imageUrl: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-10',
      lotteryEndDate: '2026-05-20',
      generalStartDate: '2026-05-23', // Active selling now
      paymentDeadlineDate: '2026-05-26'
    },
    originalUrl: 'https://tiget.net/events/sengoku-festival',
    description: '由社区TIGET爬虫源拉取的一场高密度地下偶像战国会演！全天18个小偶像组合轮番上阵开演，现场提供限时指名Cheki、独占贴纸等。福利拉满！',
    category: 'Idol',
    tags: ['TIGET源', '地下汇演', '狂欢现场']
  },
  {
    id: 'ev-ext-rakuten-kpop',
    title: 'Rakuten Ticket: 「ZEROBASEONE 2026 World Tour」 in Tokyo Dome',
    artistId: 'art-yoasobi', // Fallback association
    artistName: 'ZEROBASEONE (ZB1)',
    venueId: 'ven-tokyo-dome',
    venueName: '東京ドーム (Tokyo Dome)',
    date: '2026-06-18',
    time: '17:30',
    region: '关东 (东京)',
    platform: 'Ticket Pia',
    price: '¥13,000 - ¥18,000',
    imageUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=400&q=80',
    timeline: {
      lotteryStartDate: '2026-05-22',
      lotteryEndDate: '2026-05-31', // Selling lottery
      generalStartDate: '2026-06-10',
      paymentDeadlineDate: '2026-06-03'
    },
    originalUrl: 'https://ticket.rakuten.co.jp/music/kpop/zb1-tokyodome',
    description: '超人气韩流组合ZEROBASEONE首次日本东京巨蛋单独公演由乐天购票爬虫直接同步。感受震撼世界的K-Pop节奏与豪华环景巨蛋多维度视觉应援！',
    category: 'J-Pop',
    tags: ['韩流大势', '乐天票务', '巨蛋特开']
  }
];

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

    // 2. Events & Plugins loading fallback
    const storedEvents = localStorage.getItem('oshikatsu_events');
    if (storedEvents) {
      setEvents(JSON.parse(storedEvents));
    } else {
      setEvents(INITIAL_EVENTS);
    }

    const storedArtists = localStorage.getItem('oshikatsu_artists');
    if (storedArtists) {
      setArtists(JSON.parse(storedArtists));
    } else {
      setArtists(INITIAL_ARTISTS);
    }

    const storedVenues = localStorage.getItem('oshikatsu_venues');
    if (storedVenues) {
      setVenues(JSON.parse(storedVenues));
    } else {
      setVenues(INITIAL_VENUES);
    }

    const storedExtensions = localStorage.getItem('oshikatsu_extensions');
    if (storedExtensions) {
      setExtensions(JSON.parse(storedExtensions));
    } else {
      setExtensions(INITIAL_EXTENSIONS);
    }

    // 3. User relationships
    const storedFavs = localStorage.getItem('oshikatsu_favorites');
    if (storedFavs) {
      setFavorites(JSON.parse(storedFavs));
    } else {
      setFavorites(['ev-yoasobi-dome', 'ev-chika-starlet-3rd']); // preset some favorites so calendar list is beautiful instantly
    }

    const storedFollowedArt = localStorage.getItem('oshikatsu_followed_artists');
    if (storedFollowedArt) {
      setFollowedArtists(JSON.parse(storedFollowedArt));
    } else {
      setFollowedArtists(['art-yoasobi', 'art-chika-stars', 'art-hatsune']);
    }

    const storedFollowedVen = localStorage.getItem('oshikatsu_followed_venues');
    if (storedFollowedVen) {
      setFollowedVenues(JSON.parse(storedFollowedVen));
    } else {
      setFollowedVenues(['ven-tokyo-dome', 'ven-shinjuku-blaze']);
    }

    // 4. Alerts and configurations
    const storedAlerts = localStorage.getItem('oshikatsu_alerts');
    if (storedAlerts) {
      setActiveAlerts(JSON.parse(storedAlerts));
    } else {
      // Create preset alarms matching May 24, 2026 today
      setActiveAlerts([
        {
          id: 'alert-preset-1',
          eventId: 'ev-yoasobi-dome',
          eventTitle: 'YOASOBI 5th Anniversary Dome Tour 2026 「超現実」',
          platform: 'Ticket Pia',
          type: 'lottery_end',
          alertDate: '2026-05-25',
          isTriggered: false
        },
        {
          id: 'alert-preset-2',
          eventId: 'ev-chika-starlet-3rd',
          eventTitle: 'キラメキ☆Starlet 3rd One-man Live 「無限銀河」',
          platform: 'LivePocket',
          type: 'payment_deadline',
          alertDate: '2026-05-31',
          isTriggered: false
        }
      ]);
    }

    const storedSync = localStorage.getItem('oshikatsu_sync_interval');
    if (storedSync) {
      setSyncInterval(parseInt(storedSync));
    }
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
    setEvents(INITIAL_EVENTS);
    setArtists(INITIAL_ARTISTS);
    setVenues(INITIAL_VENUES);
    setExtensions(INITIAL_EXTENSIONS);
    setFavorites(['ev-yoasobi-dome', 'ev-chika-starlet-3rd']);
    setFollowedArtists(['art-yoasobi', 'art-chika-stars', 'art-hatsune']);
    setFollowedVenues(['ven-tokyo-dome', 'ven-shinjuku-blaze']);
    setActiveAlerts([
      {
        id: 'alert-preset-1',
        eventId: 'ev-yoasobi-dome',
        eventTitle: 'YOASOBI 5th Anniversary Dome Tour 2026 「超現実」',
        platform: 'Ticket Pia',
        type: 'lottery_end',
        alertDate: '2026-05-25',
        isTriggered: false
      }
    ]);
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
    const updated = [newEvent, ...events];
    setEvents(updated);
    saveToStorage('oshikatsu_events', updated);
    triggerToast('➕ 本地Live同步就绪', `已自主注册《${newEvent.title.slice(0,18)}...》，并确立多节点时钟守护！`);
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
  const handleToggleAlert = (eventId: string, alertType: any, alertDate: string) => {
    const existingIndex = activeAlerts.findIndex(a => a.eventId === eventId && a.type === alertType);
    const event = events.find(e => e.id === eventId);
    
    let updated;
    if (existingIndex > -1) {
      updated = activeAlerts.filter((_, idx) => idx !== existingIndex);
      triggerToast('⏰ 提醒时钟卸载', '已关闭该节点倒计时。');
    } else {
      const typeLabels: Record<string, string> = {
        'lottery_start': '🌟 先行抽选首日爆发闹钟',
        'lottery_end': '⏳ 倒数24小时截止夺秒警钟',
        'general_start': '⚡ 一般发售先到先得戒备',
        'payment_deadline': '💰 便利店中选结算濒死防线'
      };

      const newAlert: NotificationAlert = {
        id: `alert-user-${Date.now()}`,
        eventId,
        eventTitle: event?.title || 'Live Show',
        platform: event?.platform || 'Ticket Pia',
        type: alertType,
        alertDate,
        isTriggered: false
      };
      
      updated = [...activeAlerts, newAlert];
      triggerToast('⏰ 本地闹钟设定', `已为您设置了【${typeLabels[alertType]}】。届时系统将推送到通知中心。`);
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
        triggerToast('⚡ 插件自动安装成功', `【${ext.name}】已完成脚本注入，正在激活缓存API数据。`);
        return { ...ext, isInstalled: true, isEnabled: true, latencyMs: 110 };
      }
      return ext;
    });

    // Check if installing TIGET or Rakuten, then dynamically append the EXTRA EVENTS into the active pool to show responsiveness!
    let updatedEvents = [...events];
    if (id === 'ext-tiget') {
      // Append Tiget Sengoku Fes
      const fes = EXTRA_EXTENSION_EVENTS.find(e => e.id === 'ev-ext-tiget-fes');
      if (fes && !events.some(e => e.id === fes.id)) {
        updatedEvents = [fes, ...updatedEvents];
      }
    } else if (id === 'ext-rakuten') {
      // Append Rakuten ZB1
      const zb = EXTRA_EXTENSION_EVENTS.find(e => e.id === 'ev-ext-rakuten-kpop');
      if (zb && !events.some(e => e.id === zb.id)) {
        updatedEvents = [zb, ...updatedEvents];
      }
    }

    setEvents(updatedEvents);
    saveToStorage('oshikatsu_events', updatedEvents);

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
    <div id="application-container-frame" className="min-h-screen bg-slate-950">
      
      {/* Root Phone Frame Container Mock */}
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
              extensions={extensions}
              artists={artists}
              venues={venues}
              onSelectEvent={(e) => setSelectedEvent(e)}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              onAddCustomEvent={handleAddCustomEvent}
              oshiColor={activeColorObj.colorHex}
            />
          )}

          {currentTab === 'calendar' && (
            <CalendarView
              events={events}
              favorites={favorites}
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

        {/* Mobile Device Native Bottom Tab Bar Layout with proper safe spacing */}
        <div id="mobile-native-tabbar" className="h-20 bg-white border-t border-slate-100 flex items-center justify-around px-2 z-30 shadow-[0_-5px_15px_rgba(0,0,0,0.03)] pb-4 pt-2">
          {/* Tab 1: Discover */}
          <button
            id="tabnav-discover"
            onClick={() => setCurrentTab('discover')}
            className={`flex flex-col items-center justify-center w-14 h-12 transition-all ${
              currentTab === 'discover' ? 'scale-105 font-black text-slate-900' : 'text-slate-400 opacity-80 font-medium'
            }`}
            style={{ color: currentTab === 'discover' ? activeColorObj.colorHex : undefined }}
          >
            <Compass className="w-5.3 h-5.3" strokeWidth={currentTab === 'discover' ? 2.8 : 2} />
            <span className="text-[10px] uppercase tracking-tighter mt-1 font-bold">发现聚合</span>
          </button>

          {/* Tab 2: Calendar */}
          <button
            id="tabnav-calendar"
            onClick={() => setCurrentTab('calendar')}
            className={`flex flex-col items-center justify-center w-14 h-12 transition-all ${
              currentTab === 'calendar' ? 'scale-105 font-black text-slate-900' : 'text-slate-400 opacity-80 font-medium'
            }`}
            style={{ color: currentTab === 'calendar' ? activeColorObj.colorHex : undefined }}
          >
            <Calendar className="w-5.3 h-5.3" strokeWidth={currentTab === 'calendar' ? 2.8 : 2} />
            <span className="text-[10px] uppercase tracking-tighter mt-1 font-bold">票务日前</span>
          </button>

          {/* Tab 3: My Oshis */}
          <button
            id="tabnav-oshis"
            onClick={() => setCurrentTab('oshis')}
            className={`flex flex-col items-center justify-center w-14 h-12 transition-all ${
              currentTab === 'oshis' ? 'scale-105 font-black text-slate-900' : 'text-slate-400 opacity-80 font-medium'
            }`}
            style={{ color: currentTab === 'oshis' ? activeColorObj.colorHex : undefined }}
          >
            <Heart className={`w-5.3 h-5.3 ${currentTab === 'oshis' ? 'fill-current' : ''}`} strokeWidth={currentTab === 'oshis' ? 2.8 : 2} />
            <span className="text-[10px] uppercase tracking-tighter mt-1 font-bold">追の阵容</span>
          </button>

          {/* Tab 4: Plugin/Extensions */}
          <button
            id="tabnav-extensions"
            onClick={() => setCurrentTab('extensions')}
            className={`flex flex-col items-center justify-center w-14 h-12 transition-all ${
              currentTab === 'extensions' ? 'scale-105 font-black text-slate-900' : 'text-slate-400 opacity-80 font-medium'
            }`}
            style={{ color: currentTab === 'extensions' ? activeColorObj.colorHex : undefined }}
          >
            <Puzzle className="w-5.3 h-5.3" strokeWidth={currentTab === 'extensions' ? 2.8 : 2} />
            <span className="text-[10px] uppercase tracking-tighter mt-1 font-bold">扩展插件</span>
          </button>

          {/* Tab 5: Settings */}
          <button
            id="tabnav-settings"
            onClick={() => setCurrentTab('settings')}
            className={`flex flex-col items-center justify-center w-14 h-12 transition-all ${
              currentTab === 'settings' ? 'scale-105 font-black text-slate-900' : 'text-slate-400 opacity-80 font-medium'
            }`}
            style={{ color: currentTab === 'settings' ? activeColorObj.colorHex : undefined }}
          >
            <Settings className="w-5.3 h-5.3" strokeWidth={currentTab === 'settings' ? 2.8 : 2} />
            <span className="text-[10px] uppercase tracking-tighter mt-1 font-bold">应援设置</span>
          </button>
        </div>

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

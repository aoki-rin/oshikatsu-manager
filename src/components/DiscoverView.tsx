import React, { useState } from 'react';
import { ActivityEvent, TicketPlatform, ExtensionSource, Artist, Venue, TicketSearchReport } from '../types';
import { Search, Sparkles, PlusCircle, AlertCircle, Star } from 'lucide-react';
import { formatDisplayDate, getDaysRemaining } from '../utils';
import { openPurchaseUrl } from '../native';
import { AppSelect } from './AppSelect';

// Geometric Balance date parsing helpers
const getMonthAbbr = (dateStr: string) => {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  try {
    const parts = dateStr.split('-');
    const monthIdx = parseInt(parts[1], 10) - 1;
    return months[monthIdx] || 'MAY';
  } catch {
    return 'MAY';
  }
};

const getDayNumStr = (dateStr: string) => {
  try {
    const parts = dateStr.split('-');
    return parts[2] || '24';
  } catch {
    return '24';
  }
};

const reportStatusLabel = (report: TicketSearchReport) => {
  if (report.status === 'ok') return `${report.count} 件`;
  if (report.status === 'empty') return '无结果';
  if (report.status === 'blocked') return '受限';
  if (report.status === 'skipped') return '已跳过';
  return '搜索失败';
};

const reportDotClass = (status: TicketSearchReport['status']) => {
  if (status === 'ok') return 'bg-emerald-500';
  if (status === 'blocked') return 'bg-amber-500';
  if (status === 'error') return 'bg-rose-500';
  return 'bg-slate-300';
};

// 真实抓取的 region 是日文（如「東京都」「（東京都）」），跟旧的简体「东京」码点不同永不匹配。
// 用日文都道府县关键词做归一(NFKC)子串匹配，且只展示当前结果里实际出现的地区。
const JP_REGION_PRESETS = ['東京', '大阪', '愛知', '神奈川', '埼玉', '千葉', '北海道', '福岡', '兵庫', '京都', '宮城', '広島', '沖縄'];
const normalizeRegion = (value: string) => (value || '').normalize('NFKC');

interface DiscoverViewProps {
  events: ActivityEvent[];
  searchResults: ActivityEvent[];
  searchReports: TicketSearchReport[];
  recentSearches: string[];
  searching: boolean;
  extensions: ExtensionSource[];
  artists: Artist[];
  venues: Venue[];
  onSelectEvent: (event: ActivityEvent) => void;
  favorites: string[];
  onToggleFavorite: (eventId: string) => void;
  onAddCustomEvent: (newEvent: ActivityEvent) => void;
  onRunPlatformSearch: (query: string, activePlatforms: string[]) => Promise<{ events: ActivityEvent[]; reports: TicketSearchReport[] }>;
  onClearSearchResults: () => void;
  oshiColor: string; // hex
}

export function DiscoverView({
  events,
  searchResults,
  searchReports,
  recentSearches,
  searching,
  extensions,
  artists,
  venues,
  onSelectEvent,
  favorites,
  onToggleFavorite,
  onAddCustomEvent,
  onRunPlatformSearch,
  onClearSearchResults,
  oshiColor
}: DiscoverViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatform, setSelectedPlatform] = useState<TicketPlatform | 'All'>('All');
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [activeDeadlineFilter, setActiveDeadlineFilter] = useState<'all' | 'lottery' | 'general' | 'payment'>('all');
  const [showAddModal, setShowAddModal] = useState(false);

  const [searchNote, setSearchNote] = useState('');

  // Custom Event Form States
  const [newTitle, setNewTitle] = useState('');
  const [newArtist, setNewArtist] = useState('');
  const [newVenue, setNewVenue] = useState('');
  const [newDate, setNewDate] = useState(() => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Tokyo' }));
  const [newTime, setNewTime] = useState('18:00');
  const [newRegion, setNewRegion] = useState('关东 (东京)');
  const [newPlatform, setNewPlatform] = useState<TicketPlatform>('Ticket Pia');
  const [newPrice, setNewPrice] = useState('¥6,800');
  const [newCategory, setNewCategory] = useState<'J-Pop' | 'Idol' | 'VTuber'>('J-Pop');

  // Verify which platforms are active via the Ext Extension Source system
  const activePlatforms = extensions
    .filter(ext => ext.isEnabled && ext.isInstalled)
    .map(ext => ext.platform);

  // 调用启用平台插件实时搜索（真机经 CapacitorHttp 绕 CORS）
  const runPlatformSearch = async () => {
    const q = searchQuery.trim();
    if (!q) { onClearSearchResults(); setSearchNote(''); return; }
    setSearchNote('搜索中…');
    try {
      const { events: res, reports } = await onRunPlatformSearch(q, activePlatforms as string[]);
      const summary = reports.map(p => `${p.platform}:${reportStatusLabel(p)}`).join(' · ');
      setSearchNote(res.length ? `平台实时 ${res.length} 条（${summary}）` : `没有可直接聚合的结果（${summary || '无启用插件'}）`);
    } catch (e: any) {
      setSearchNote('搜索失败：' + (e?.message || String(e)));
    }
  };

  // Filter events
  const filterEvent = (event: ActivityEvent) => {
    // 1. Text Search matching title, artistName, or venueName
    const matchesSearch = 
      event.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.artistName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.venueName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      event.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));

    // 2. Extension Check: Only allow events from platforms whose Tachiyomi extensions are currently ACTIVE
    const isExtensionActive = activePlatforms.includes(event.platform) || activePlatforms.includes('All');
    if (!isExtensionActive) return false;

    // 3. Platform filter
    const matchesPlatform = selectedPlatform === 'All' || event.platform === selectedPlatform;

    // 4. Region filter (NFKC-normalized substring; real region is Japanese kanji)
    const matchesRegion = selectedRegion === 'All' || normalizeRegion(event.region).includes(selectedRegion);

    // 6. Deadline specific filter
    let matchesDeadline = true;
    if (activeDeadlineFilter === 'lottery') {
      const daysLeft = event.timeline.lotteryEndDate ? getDaysRemaining(event.timeline.lotteryEndDate) : -1;
      matchesDeadline = daysLeft >= 0;
    } else if (activeDeadlineFilter === 'general') {
      matchesDeadline = !!event.timeline.generalStartDate;
    } else if (activeDeadlineFilter === 'payment') {
      const daysLeft = event.timeline.paymentDeadlineDate ? getDaysRemaining(event.timeline.paymentDeadlineDate) : -1;
      matchesDeadline = daysLeft >= 0 && daysLeft <= 2; // closing critical
    }

    return matchesSearch && matchesPlatform && matchesRegion && matchesDeadline;
  };

  // 地区下拉：只列当前结果里实际出现的日文都道府县（无则仅「全部」）。
  const presentRegions = JP_REGION_PRESETS.filter(pref =>
    events.some(event => normalizeRegion(event.region).includes(pref)),
  );
  const regionOptions = [
    { value: 'All', label: '📍 日本全地区' },
    ...presentRegions.map(pref => ({ value: pref, label: pref })),
  ];
  const filteredSavedEvents = events
    .filter(event => event.sourceKind === 'manual' || favorites.includes(event.id))
    .filter(filterEvent);
  const filteredSearchResults = searchResults.filter(filterEvent);

  const handleCreateCustomEvent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle || !newArtist || !newVenue) return;

    // Auto append IDs or use existing ones
    const randomId = `ev-custom-${Date.now()}`;
    const artistId = `art-custom-${newArtist.toLowerCase().replace(/\s+/g, '-')}`;
    const venueId = `ven-custom-${newVenue.toLowerCase().replace(/\s+/g, '-')}`;

    const customEvent: ActivityEvent = {
      id: randomId,
      title: newTitle,
      artistId: artistId,
      artistName: newArtist,
      venueId: venueId,
      venueName: newVenue,
      date: newDate,
      time: newTime,
      region: newRegion,
      platform: newPlatform,
      price: newPrice,
      imageUrl: 'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=400&q=80',
      timeline: {
        lotteryStartDate: '2026-05-20',
        lotteryEndDate: '2026-06-03',
        generalStartDate: '2026-06-08',
        paymentDeadlineDate: '2026-06-05'
      },
      originalUrl: 'https://oshikatsu.manager/custom-ticket-proxy',
      description: '用户自主同步生成的本地推し巡演！数据保存在您本地，已建立全套开票警告时钟。',
      category: newCategory,
      tags: ['本地定制', '我推的主场', 'LiveHouse']
      ,
      sourceKind: 'manual'
    };

    onAddCustomEvent(customEvent);
    setShowAddModal(false);

    // Reset Form
    setNewTitle('');
    setNewArtist('');
    setNewVenue('');
  };

  // 实时结果优先；为空时回退显示已保存/收藏（含刚自填的本地 Live），避免「搜索框有字就把已存事件藏起来」。
  const displayEvents = filteredSearchResults.length > 0
    ? filteredSearchResults
    : filteredSavedEvents;

  return (
    <div id="discover-view-root" className="flex-1 flex flex-col overflow-hidden">
      
      {/* Dynamic Header */}
      <div className="bg-white px-4 pt-3 pb-2 border-b border-slate-100 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="p-1 rounded-xl text-white transition-colors pulse-primary"
              style={{ backgroundColor: oshiColor }}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold font-display tracking-tight text-slate-900">发现演出</h1>
              <p className="text-[10px] text-slate-400 font-medium">聚合门票先行与一般售票情报</p>
            </div>
          </div>

          {/* Manual insert custom live item shortcut */}
          <button
            id="btn-trigger-add-event-modal"
            onClick={() => setShowAddModal(true)}
            className="p-1.5 rounded-lg bg-slate-150 text-slate-600 hover:bg-slate-200 transition flex items-center gap-1.5 text-xs font-semibold"
          >
            <PlusCircle className="w-4 h-4 text-slate-500" />
            <span>自填Live</span>
          </button>
        </div>

        {/* Input Search Container */}
        <div className="relative mt-3">
          <Search className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="search-input-field"
            type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') runPlatformSearch(); }}
            placeholder="搜艺人名 → 实时搜各平台..."
            className="w-full text-xs pl-9 pr-8 py-2.5 bg-slate-100 rounded-xl border border-slate-200/50 focus:outline-none focus:border-slate-300 focus:bg-white transition"
          />
          {searchQuery && (
            <button
              onClick={() => { setSearchQuery(''); onClearSearchResults(); setSearchNote(''); }}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          )}
        </div>
        {/* 平台实时搜索触发 + 状态 */}
        <div className="flex items-center gap-2 mt-2">
          <button
            id="btn-platform-search"
            onClick={runPlatformSearch}
            disabled={searching || !searchQuery.trim()}
            className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white disabled:opacity-40 flex items-center gap-1.5 shrink-0"
            style={{ backgroundColor: oshiColor }}
          >
            <Search className="w-3 h-3" />
            {searching ? '搜索中…' : '搜平台'}
          </button>
          {searchNote && <span className="text-[10px] text-slate-500 truncate flex-1">{searchNote}</span>}
        </div>
      </div>

      {/* Screen Interactive scrollable core body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        
        {/* Tachiyomi-Extensions status quick-bar widgets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">
              可搜索平台 (SOURCES)
            </span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {['Ticket Pia', 'eplus', 'TicketDive', 'LivePocket', 'Lawson Ticket'].map((platName) => {
              const config = extensions.find(ext => ext.platform === platName);
              const isActive = config?.isEnabled && config?.isInstalled;
              return (
                <button
                  key={platName}
                  onClick={() => setSelectedPlatform(selectedPlatform === platName ? 'All' : (platName as TicketPlatform))}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 border transition-all shrink-0 ${
                    selectedPlatform === platName
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : isActive
                      ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      : 'bg-slate-50 border-slate-100 text-slate-300 pointer-events-none'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`}></span>
                  {platName}
                  {!isActive && <span className="text-[8px] bg-slate-200 text-slate-400 px-1 rounded">Offline</span>}
                </button>
              );
            })}
          </div>
        </div>

        {searchReports.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">
                平台搜索报告
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {searchReports.map((report) => (
                <div key={report.platform} className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${reportDotClass(report.status)}`}></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-800">
                      {report.platform} · {reportStatusLabel(report)}
                      {report.runtime && <span className="text-[9px] text-slate-400 font-mono"> · {report.runtime}</span>}
                    </p>
                    {(report.parserVersion || typeof report.elapsedMs === 'number') && (
                      <p className="text-[9px] text-slate-400 font-mono truncate">
                        {report.parserVersion || 'parser'}{typeof report.elapsedMs === 'number' ? ` · ${report.elapsedMs}ms` : ''}
                      </p>
                    )}
                    {report.error && <p className="text-[10px] text-rose-500 truncate">{report.error}</p>}
                  </div>
                  {report.handoffUrl && (
                    <button
                      onClick={() => openPurchaseUrl(report.handoffUrl!)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-slate-100 text-slate-600 shrink-0"
                    >
                      {report.platform === 'Lawson Ticket' ? '打开ローチケ' : '打开平台'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Advanced quick toggle filters: Region & Status */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200/30">
          <div>
            <AppSelect
              value={selectedRegion}
              onChange={setSelectedRegion}
              oshiColor={oshiColor}
              title="选择地区"
              ariaLabel="地区筛选"
              options={regionOptions}
            />
          </div>
          <div>
            <AppSelect
              value={activeDeadlineFilter}
              onChange={setActiveDeadlineFilter}
              oshiColor={oshiColor}
              title="开票阶段"
              ariaLabel="开票阶段筛选"
              options={[
                { value: 'all', label: '⏰ 所有开票阶段' },
                { value: 'lottery', label: '正在抽选之中' },
                { value: 'general', label: '一般发售预告' },
                { value: 'payment', label: '付款倒计时告急' },
              ]}
            />
          </div>
        </div>

        {/* Unified Search Outputs */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700">
              {filteredSearchResults.length > 0 ? '实时搜索结果' : '已保存票务'} ({displayEvents.length} 场)
            </span>
          </div>

          {displayEvents.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-5 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">未找到对应要求的购票信息</p>
              <p className="text-[10px] text-slate-400">
                输入艺人名后点击“搜平台”。若某个平台失败，可在平台搜索报告里打开对应搜索页继续购票。
              </p>
              {recentSearches.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5 pt-2">
                  {recentSearches.map((term) => (
                    <button
                      key={term}
                      onClick={() => setSearchQuery(term)}
                      className="text-[10px] px-2 py-1 rounded-full bg-slate-100 text-slate-500 font-bold"
                    >
                      {term}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            displayEvents.map(event => {
              const daysLeft = event.timeline.lotteryEndDate ? getDaysRemaining(event.timeline.lotteryEndDate) : -1;
              const isFav = favorites.includes(event.id);

              return (
                <div 
                  key={event.id}
                  id={`event-card-${event.id}`}
                  className="bg-white rounded-2xl border border-slate-100 hover:border-slate-200 shadow-xs overflow-hidden flex flex-col transition duration-205 hover:-translate-y-0.5"
                >
                  <div className="p-3 flex items-center gap-3.5 cursor-pointer" onClick={() => onSelectEvent(event)}>
                    
                    {/* Left: Geometric Date Box Indicator */}
                    <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center border border-slate-200 shrink-0 select-none overflow-hidden bg-slate-50">
                      <div 
                        className="w-full text-[8.5px] font-black text-white text-center py-0.5 font-mono tracking-wider uppercase leading-none"
                        style={{ backgroundColor: oshiColor }}
                      >
                        {getMonthAbbr(event.date)}
                      </div>
                      <div className="flex-1 flex items-center justify-center text-sm font-black text-slate-900 font-display">
                        {getDayNumStr(event.date)}
                      </div>
                    </div>

                    {/* Middle: Title, venue and badges */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="text-xs font-black text-slate-900 tracking-tight leading-snug line-clamp-1">
                        {event.title}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-medium truncate flex items-center gap-1">
                        <span>⭐ {event.artistName}</span>
                        <span className="text-slate-300">|</span>
                        <span>📍 {event.venueName}</span>
                      </p>
                      
                      {/* Sub-platform badge layout */}
                      <div className="flex gap-1.5 pt-0.5">
                        <span 
                          className="text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono border"
                          style={{ 
                            color: oshiColor, 
                            borderColor: `${oshiColor}30`,
                            backgroundColor: `${oshiColor}08`
                          }}
                        >
                          {event.platform}
                        </span>
                        <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-mono font-medium">
                          {event.category}
                        </span>
                      </div>
                    </div>

                    {/* Right: Cover Thumbnail Image */}
                    <div className="w-11 h-14 rounded-lg overflow-hidden shrink-0 bg-slate-50 border border-slate-205 relative">
                      <img 
                        referrerPolicy="no-referrer"
                        src={event.imageUrl} 
                        alt={event.category} 
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>

                  {/* Lottery interactive countdown bar panel */}
                  {event.timeline.lotteryEndDate && (
                    <div className="px-3.5 pb-2.5 pt-1.5 bg-slate-50/70 border-t border-slate-150/50 flex items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                          <span className="font-bold uppercase tracking-wider">先行 抽選受付</span>
                          <span>{daysLeft >= 0 ? `⏰ 仅剩 ${daysLeft} 天` : '已截止'}</span>
                        </div>
                        {/* Simulate simple visual heatbar */}
                        <div className="w-full bg-slate-205 h-1.5 rounded-full mt-1 overflow-hidden">
                          <div 
                            className="h-full rounded-full transition-all"
                            style={{ 
                              width: daysLeft >= 0 ? `${Math.max(15, Math.min(100, 100 - (daysLeft * 10)))}%` : '100%',
                              backgroundColor: oshiColor
                            }}
                          ></div>
                        </div>
                      </div>

                      {/* Small Quick Fav toggler */}
                      <button
                        id={`btn-fav-card-${event.id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onToggleFavorite(event.id);
                        }}
                        className="p-2 rounded-xl transition hover:bg-slate-200"
                        style={{ color: isFav ? oshiColor : '#cbd5e1' }}
                      >
                        <Star className="w-3.5 h-3.5 fill-current" />
                      </button>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

      </div>

      {/* Insert Custom Event Portal Dialog (Tachiyomi Extension Mock Simulator) */}
      {showAddModal && (
        <div id="add-live-modal" className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-40">
          <div className="w-full max-w-sm bg-white rounded-3xl p-5 shadow-2xl relative overflow-hidden text-slate-800">
            <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2.5 flex items-center gap-1.5">
              <PlusCircle className="w-4 h-4 text-emerald-500" />
              同步本地演出信息 (Custom Oshi)
            </h3>

            <form onSubmit={handleCreateCustomEvent} className="p-1 space-y-3 mt-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase">公演标题</label>
                <input
                  id="form-title"
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="如：LiSA Acoutic Solo Show 2026"
                  className="w-full border border-slate-200 p-2 rounded-lg mt-1 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">推し艺人</label>
                  <input
                    id="form-artist"
                    type="text"
                    required
                    value={newArtist}
                    onChange={(e) => setNewArtist(e.target.value)}
                    placeholder="艺人或企划"
                    className="w-full border border-slate-200 p-2 rounded-lg mt-1 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">公演场馆</label>
                  <input
                    id="form-venue"
                    type="text"
                    required
                    value={newVenue}
                    onChange={(e) => setNewVenue(e.target.value)}
                    placeholder="如: Zepp Haneda"
                    className="w-full border border-slate-200 p-2 rounded-lg mt-1 focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">公演日期</label>
                  <input
                    id="form-date"
                    type="date"
                    required
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="w-full border border-slate-200 p-1.5 rounded-lg mt-1 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">价格估值 (例: ¥7,500)</label>
                  <input
                    id="form-price"
                    type="text"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-full border border-slate-200 p-1.5 rounded-lg mt-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">地区</label>
                  <AppSelect
                    id="form-region"
                    value={newRegion}
                    onChange={setNewRegion}
                    oshiColor={oshiColor}
                    title="选择地区"
                    ariaLabel="地区"
                    className="w-full bg-white text-sm border border-slate-200 p-1.5 rounded-lg mt-1"
                    options={[
                      { value: '关东 (东京)', label: '东京 (Kanto)' },
                      { value: '关西 (大阪)', label: '大阪 (Kansai)' },
                      { value: '中部 (名古屋)', label: '名古屋 (Chubu)' },
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase">抓取源分类</label>
                  <AppSelect
                    id="form-platform"
                    value={newPlatform}
                    onChange={setNewPlatform}
                    oshiColor={oshiColor}
                    title="抓取源分类"
                    ariaLabel="抓取源分类"
                    className="w-full bg-white text-sm border border-slate-200 p-1.5 rounded-lg mt-1"
                    options={[
                      { value: 'Ticket Pia', label: 'Ticket Pia' },
                      { value: 'eplus', label: 'eplus' },
                      { value: 'LivePocket', label: 'LivePocket' },
                      { value: 'Lawson Ticket', label: 'Lawson Ticket' },
                    ]}
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-100">
                <button
                  id="btn-cancel-add-event"
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-semibold"
                >
                  取消
                </button>
                <button
                  id="btn-confirm-add-event"
                  type="submit"
                  className="flex-1 py-2 text-white rounded-xl text-xs font-semibold"
                  style={{ backgroundColor: oshiColor }}
                >
                  确认同步
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

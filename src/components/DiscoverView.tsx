import { useState } from 'react';
import { ActivityEvent, TicketPlatform, ExtensionSource, Artist, Venue, TicketSearchReport } from '../types';
import { Search, Sparkles, AlertCircle, Star, ChevronDown } from 'lucide-react';
import { formatDisplayDate, getDaysRemaining, platformLabel, primaryDeadline, sortByActionability } from '../utils';
import { openPurchaseUrl } from '../native';
import { eventPlatforms } from '../sources/aggregate';
import { isFavorited } from '../favorites';
import { AppSelect } from './AppSelect';
import { useI18n } from '../i18n/I18nProvider';
import type { Locale, TFunction } from '../i18n/core';

// Geometric Balance date parsing helpers
const getMonthLabel = (dateStr: string, locale: Locale) => {
  const month = Number(dateStr.split('-')[1]);
  if (!Number.isFinite(month) || month <= 0) return '未定';
  return new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'Asia/Tokyo' })
    .format(new Date(`${dateStr}T00:00:00+09:00`));
};

const getDayNumStr = (dateStr: string) => {
  try {
    const parts = dateStr.split('-');
    return parts[2] || '24';
  } catch {
    return '24';
  }
};

const reportStatusLabel = (report: TicketSearchReport, t: TFunction) => {
  if (report.status === 'pending') return t('report.pending');
  if (report.status === 'ok') return t('report.ok', { count: report.count });
  if (report.status === 'empty') return t('report.empty');
  if (report.status === 'blocked') return t('report.blocked');
  if (report.status === 'skipped') return t('report.skipped');
  return t('report.error');
};

const reportDotClass = (status: TicketSearchReport['status']) => {
  if (status === 'pending') return 'bg-slate-300 animate-pulse';
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
  // 代理配置了但连不上（本次走手机直连兜底）→ 显示降级提示
  searchDegraded: boolean;
  // 结果抓取时间(ISO) 与 是否本次会话抓取（列表头「实时 vs 上次搜索」标注用）
  searchFetchedAt: string | null;
  searchIsLive: boolean;
  extensions: ExtensionSource[];
  artists: Artist[];
  venues: Venue[];
  onSelectEvent: (event: ActivityEvent) => void;
  favorites: string[];
  onToggleFavorite: (event: ActivityEvent) => void;
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
  searchDegraded,
  searchFetchedAt,
  searchIsLive,
  extensions,
  artists,
  venues,
  onSelectEvent,
  favorites,
  onToggleFavorite,
  onRunPlatformSearch,
  onClearSearchResults,
  oshiColor
}: DiscoverViewProps) {
  const { locale, t } = useI18n();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState<TicketPlatform[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<string>('All');
  const [activeDeadlineFilter, setActiveDeadlineFilter] = useState<'all' | 'lottery' | 'general' | 'payment'>('all');
  const [showReports, setShowReports] = useState(false);

  const [searchNote, setSearchNote] = useState('');

  // Verify which platforms are active via the Ext Extension Source system
  const activePlatforms = extensions
    .filter(ext => ext.isEnabled && ext.isInstalled)
    .map(ext => ext.platform);

  // 调用启用平台插件实时搜索（真机经 CapacitorHttp 绕 CORS）
  const runPlatformSearch = async () => {
    const q = searchQuery.trim();
    if (!q) { onClearSearchResults(); setSearchNote(''); return; }
    setSearchNote(t('discover.noteSearching'));
    try {
      const { events: res, reports } = await onRunPlatformSearch(q, activePlatforms as string[]);
      const summary = reports.map(p => `${p.platform}:${reportStatusLabel(p, t)}`).join(' · ');
      setSearchNote(res.length
        ? t('discover.noteFound', { count: res.length, summary })
        : t('discover.noteEmpty', { summary: summary || t('discover.noteEmptyNoSource') }));
    } catch (e: unknown) {
      setSearchNote(t('discover.noteError', { message: e instanceof Error ? e.message : String(e) }));
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

    // 3. Platform filter (merged events expose every platform present in their windows)
    // 多选筛选：未选任何平台 = 不筛选(全部显示);选了若干个 = 只显示这些平台的结果。
    const matchesPlatform = selectedPlatforms.length === 0 || selectedPlatforms.some(sp => eventPlatforms(event).includes(sp));

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
    { value: 'All', label: t('discover.regionAll') },
    ...presentRegions.map(pref => ({ value: pref, label: pref })),
  ];
  const filteredSavedEvents = events
    .filter(event => isFavorited(event, favorites))
    .filter(filterEvent);
  const filteredSearchResults = searchResults.filter(filterEvent);

  // 实时结果优先；为空时回退显示已保存/收藏，避免「搜索框有字就把已存事件藏起来」。
  // 排序按「可行动性」（QA #7）：还能报名的靠前（截止近者优先），已截止垫底——不再按抓取时间霸榜。
  const displayEvents = sortByActionability(
    filteredSearchResults.length > 0 ? filteredSearchResults : filteredSavedEvents,
  );

  // 结果头时间标注（QA #6）：本次会话搜的才叫「实时」；装载的持久化结果标「上次搜索 + 时间」。
  const fetchedAtLabel = searchFetchedAt
    ? new Intl.DateTimeFormat(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Tokyo' }).format(new Date(searchFetchedAt))
    : '';

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
              <h1 className="text-base font-bold font-display tracking-tight text-slate-900">{t('discover.title')}</h1>
              <p className="text-[10px] text-slate-400 font-medium">{t('discover.subtitle')}</p>
            </div>
          </div>
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
            placeholder={t('discover.searchPlaceholder')}
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
            {searching ? t('discover.searching') : t('discover.searchButton')}
          </button>
          {searchNote && <span className="text-[10px] text-slate-500 flex-1 line-clamp-2">{searchNote}</span>}
        </div>
        {/* 代理降级提示：别静默退化——告诉用户 Lawson 等代理依赖源本次不可用（QA #2） */}
        {searchDegraded && (
          <div
            id="proxy-degraded-note"
            className="mt-1.5 text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5"
          >
            {t('discover.proxyDegraded')}
          </div>
        )}
      </div>

      {/* Screen Interactive scrollable core body */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        
        {/* Tachiyomi-Extensions status quick-bar widgets */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase">
              {t('discover.sourcesTitle')}
            </span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto no-scrollbar pb-1">
            {['Ticket Pia', 'eplus', 'TicketDive', 'LivePocket', 'Lawson Ticket'].map((platName) => {
              const config = extensions.find(ext => ext.platform === platName);
              const isActive = config?.isEnabled && config?.isInstalled;
              return (
                <button
                  key={platName}
                  onClick={() => setSelectedPlatforms(prev =>
                    prev.includes(platName as TicketPlatform)
                      ? prev.filter(p => p !== platName)
                      : [...prev, platName as TicketPlatform],
                  )}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold flex items-center gap-1.5 border transition-all shrink-0 ${
                    selectedPlatforms.includes(platName as TicketPlatform)
                      ? 'bg-slate-900 border-slate-900 text-white'
                      : isActive
                      ? 'bg-white border-slate-200 text-slate-700 hover:border-slate-300'
                      : 'bg-slate-50 border-slate-100 text-slate-300 pointer-events-none'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-400'}`}></span>
                  {platformLabel(platName)}
                  {!isActive && <span className="text-[8px] bg-slate-200 text-slate-400 px-1 rounded">{t('common.offline')}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {searchReports.length > 0 && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={() => setShowReports((v) => !v)}
              aria-expanded={showReports}
              className="w-full flex items-center gap-2 px-2.5 py-2 bg-white border border-slate-100 rounded-xl"
            >
              <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider uppercase shrink-0">
                {t('discover.reportTitle')}
              </span>
              <ChevronDown className={`w-4 h-4 text-slate-400 shrink-0 ml-auto transition-transform ${showReports ? 'rotate-180' : ''}`} />
            </button>
            {showReports && (
            <div className="grid grid-cols-1 gap-2">
              {searchReports.map((report) => (
                <div key={report.platform} className="bg-white border border-slate-100 rounded-xl p-2.5 flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${reportDotClass(report.status)}`}></span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-slate-800">
                      {platformLabel(report.platform)} · {reportStatusLabel(report, t)}
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
                      {t('discover.openPlatform', { platform: platformLabel(report.platform) })}
                    </button>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        )}

        {/* Advanced quick toggle filters: Region & Status */}
        <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200/30">
          <div>
            <AppSelect
              value={selectedRegion}
              onChange={setSelectedRegion}
              oshiColor={oshiColor}
              title={t('discover.regionTitle')}
              ariaLabel={t('discover.regionTitle')}
              options={regionOptions}
            />
          </div>
          <div>
            <AppSelect
              value={activeDeadlineFilter}
              onChange={setActiveDeadlineFilter}
              oshiColor={oshiColor}
              title={t('discover.phaseTitle')}
              ariaLabel={t('discover.phaseTitle')}
              options={[
                { value: 'all', label: t('discover.phaseAll') },
                { value: 'lottery', label: t('discover.phaseLottery') },
                { value: 'general', label: t('discover.phaseGeneral') },
                { value: 'payment', label: t('discover.phasePayment') },
              ]}
            />
          </div>
        </div>

        {/* Unified Search Outputs */}
        <div className="space-y-3.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-700" id="results-heading">
              {filteredSearchResults.length > 0
                ? (searchIsLive
                    ? t('discover.resultsTitle', { count: displayEvents.length })
                    : t('discover.resultsStaleTitle', { count: displayEvents.length, time: fetchedAtLabel }))
                : t('discover.savedTitle', { count: displayEvents.length })}
            </span>
          </div>

          {displayEvents.length === 0 && searching ? (
            /* 搜索进行中不给「未找到」误导（QA #4）——结果会流式并入 */
            <div id="searching-placeholder" className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-5 space-y-2.5">
              <div
                className="w-7 h-7 mx-auto rounded-full border-[3px] border-slate-200 border-t-transparent"
                style={{ borderLeftColor: oshiColor, animation: 'oshi-spin 0.9s linear infinite' }}
              />
              <p className="text-xs font-semibold text-slate-600">{t('discover.searchingEmptyTitle')}</p>
              <p className="text-[10px] text-slate-400">{t('discover.searchingEmptyBody')}</p>
            </div>
          ) : displayEvents.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-slate-100 p-5 space-y-2">
              <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
              <p className="text-xs font-semibold text-slate-600">{t('discover.emptyTitle')}</p>
              <p className="text-[10px] text-slate-400">
                {t('discover.emptyBody')}
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
              // 卡片截止条：直接读 ticketWindows 取最相关轮次（未截止优先），
              // 别让过期先行/最早先着盖住还在受付的一般発売（QA #3）
              const deadline = primaryDeadline(event);
              const isFav = isFavorited(event, favorites);

              return (
                <div
                  key={event.id}
                  id={`event-card-${event.id}`}
                  className="relative bg-white rounded-2xl border border-slate-100 hover:border-slate-200 shadow-xs overflow-hidden flex flex-col transition duration-205 hover:-translate-y-0.5"
                >
                  {/* Persistent quick-favorite toggle — top-right corner, present on every card */}
                  <button
                    id={`btn-fav-card-${event.id}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(event);
                    }}
                    aria-label={isFav ? t('discover.favoriteRemove') : t('discover.favoriteAdd')}
                    aria-pressed={isFav}
                    className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-white/80 backdrop-blur-sm shadow-sm hover:bg-white transition"
                    style={{ color: isFav ? oshiColor : '#cbd5e1' }}
                  >
                    <Star className="w-3.5 h-3.5 fill-current" />
                  </button>

                  <div id={`btn-open-detail-${event.id}`} className="p-3 flex items-center gap-3.5 cursor-pointer" onClick={() => onSelectEvent(event)}>
                    
                    {/* Left: Geometric Date Box Indicator */}
                    <div className="w-12 h-12 rounded-xl flex flex-col items-center justify-center border border-slate-200 shrink-0 select-none overflow-hidden bg-slate-50">
                      <div 
                        className="w-full text-[8.5px] font-black text-white text-center py-0.5 font-mono tracking-wider uppercase leading-none"
                        style={{ backgroundColor: oshiColor }}
                      >
                        {getMonthLabel(event.date, locale)}
                      </div>
                      <div className="flex-1 flex items-center justify-center text-sm font-black text-slate-900 font-display">
                        {getDayNumStr(event.date)}
                      </div>
                    </div>

                    {/* Middle: Title, venue and badges */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <h3 className="text-xs font-black text-slate-900 tracking-tight leading-snug line-clamp-2">
                        {event.title}
                      </h3>
                      <p className="text-[10px] text-slate-500 font-medium truncate flex items-center gap-1">
                        {/* 检索词回显（artistSource:'query'）用 🔍 展示，不冒充出演者 */}
                        <span>{event.artistSource === 'query' ? '🔍' : '⭐'} {event.artistName}</span>
                        <span className="text-slate-300">|</span>
                        <span>📍 {event.venueName}</span>
                      </p>
                      
                      {/* Sub-platform badges (one per platform offering this concert) */}
                      <div className="flex flex-wrap gap-1.5 pt-0.5">
                        {eventPlatforms(event).map((p) => (
                          <span
                            key={p}
                            className="text-[9px] font-bold px-1.5 py-0.5 rounded-md font-mono border"
                            style={{
                              color: oshiColor,
                              borderColor: `${oshiColor}30`,
                              backgroundColor: `${oshiColor}08`
                            }}
                          >
                            {platformLabel(p)}
                          </span>
                        ))}
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

                  {/* 截止倒计时条：展示最相关轮次（未截止的先行/一般优先；全过期才显示已截止） */}
                  {deadline && (
                    <div className="px-3.5 pb-2.5 pt-1.5 bg-slate-50/70 border-t border-slate-150/50">
                      <div className="flex items-center justify-between text-[8px] font-mono text-slate-400">
                        <span className="font-bold uppercase tracking-wider">
                          {deadline.label || (deadline.kind === 'general' ? t('discover.generalBadge') : t('discover.lotteryBadge'))}
                        </span>
                        <span>{!deadline.closed ? t('discover.deadlinePrefix', { days: deadline.daysLeft }) : t('discover.deadlineClosed')}</span>
                      </div>
                      {/* Simulate simple visual heatbar */}
                      <div className="w-full bg-slate-205 h-1.5 rounded-full mt-1 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: !deadline.closed ? `${Math.max(15, Math.min(100, 100 - (deadline.daysLeft * 10)))}%` : '100%',
                            backgroundColor: oshiColor
                          }}
                        ></div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })
          )}
        </div>

      </div>

    </div>
  );
}

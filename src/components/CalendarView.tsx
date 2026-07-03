import React, { useState } from 'react';
import { ActivityEvent, NotificationAlert, TicketPlatform } from '../types';
import { 
  CalendarDays, Download, Clock, Star, BellRing, 
  MapPin, CheckCircle, Info, ChevronRight 
} from 'lucide-react';
import { 
  downloadAllFollowedEventsIcs, downloadEventIcs, 
  formatDisplayDate, getDaysRemaining, getJstDateKey
} from '../utils';
import { isFavorited } from '../favorites';
import { upcomingTicketDeadlines } from '../followed';
import { useI18n } from '../i18n/I18nProvider';

// 截止雷达的展望窗口（天）：覆盖 7 天纵轴之外、又不至于列出太远的噪音。
const RADAR_HORIZON_DAYS = 14;

interface CalendarViewProps {
  events: ActivityEvent[];
  favorites: string[];
  followedArtists: string[];
  followedVenues: string[];
  activeAlerts: NotificationAlert[];
  onSelectEvent: (event: ActivityEvent) => void;
  oshiColor: string; // hex
}

export function CalendarView({
  events,
  favorites,
  followedArtists,
  followedVenues,
  activeAlerts,
  onSelectEvent,
  oshiColor
}: CalendarViewProps) {
  const { locale, t } = useI18n();
  const alertEventIds = new Set(activeAlerts.map(alert => alert.eventId));
  const followedArtistSet = new Set(followedArtists);
  const followedVenueSet = new Set(followedVenues);
  // 日历雷达 = 我关心的所有演出：收藏 + 已设提醒 + 关注的艺人/会场的演出。
  const trackedEvents = events.filter(e =>
    isFavorited(e, favorites) ||
    alertEventIds.has(e.id) ||
    followedArtistSet.has(e.artistId) ||
    followedVenueSet.has(e.venueId),
  );
  // 截止雷达数据：未来 14 天内已追踪演出的所有受付/入金締切（QA #5）
  const deadlineRadar = upcomingTicketDeadlines(trackedEvents, RADAR_HORIZON_DAYS);
  const todayKey = getJstDateKey();
  const tomorrowKey = getJstDateKey(new Date(new Date(`${todayKey}T00:00:00+09:00`).getTime() + 86400000));
  const monthFormatter = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'Asia/Tokyo' });
  
  const timelineDays = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(new Date(`${todayKey}T00:00:00+09:00`).getTime() + i * 86400000);
    const dateStr = getJstDateKey(date);
    const dayNum = Number(dateStr.slice(8, 10));
    const dayOfWeek = new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(date);
    
    // Find events happening on this specific date
    const hasConcerts = trackedEvents.filter(e => e.date === dateStr);
    const hasLotteryDeadline = trackedEvents.filter(e => e.timeline.lotteryEndDate === dateStr);
    const hasPaymentDeadline = trackedEvents.filter(e => e.timeline.paymentDeadlineDate === dateStr);
    const hasGeneralOpen = trackedEvents.filter(e => e.timeline.generalStartDate === dateStr);

    return {
      dayNum,
      dateStr,
      dayOfWeek,
      hasConcerts,
      hasLotteryDeadline,
      hasPaymentDeadline,
      hasGeneralOpen,
      isToday: dateStr === todayKey
    };
  });

  const [selectedDateFilter, setSelectedDateFilter] = useState<string>(todayKey);

  // Find events for the selected horizontal calendar day
  const selectedDayData = timelineDays.find(d => d.dateStr === selectedDateFilter);
  
  // Categorize timeline events in general:
  // Today's deadlines:
  const todayLotteryDeadlines = trackedEvents.filter(e => e.timeline.lotteryEndDate === todayKey);
  const todayPaymentDeadlines = trackedEvents.filter(e => e.timeline.paymentDeadlineDate === todayKey);
  
  // Tomorrow's deadlines:
  const tomorrowLotteryDeadlines = trackedEvents.filter(e => e.timeline.lotteryEndDate === tomorrowKey);
  const tomorrowPaymentDeadlines = trackedEvents.filter(e => e.timeline.paymentDeadlineDate === tomorrowKey);

  const upcomingTrackedLives = [...trackedEvents].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleExportAll = () => {
    if (trackedEvents.length === 0) {
      alert(t('calendar.exportEmpty'));
      return;
    }
    downloadAllFollowedEventsIcs(trackedEvents, t);
  };

  return (
    <div id="calendar-view-root" className="flex-1 flex flex-col overflow-hidden">
      
      {/* Header Container */}
      <div className="bg-white px-4 pt-3 pb-3 border-b border-slate-100 z-10 sticky top-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="p-1.5 rounded-xl text-white transition-colors"
              style={{ backgroundColor: oshiColor }}
            >
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold font-display tracking-tight text-slate-900">{t('calendar.title')}</h1>
              <p className="text-[10px] text-slate-400 font-mono">{t('calendar.baseline', { date: todayKey })}</p>
            </div>
          </div>

          <button
            id="btn-export-combined-ics"
            onClick={handleExportAll}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>{t('calendar.exportAll')}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        
        {/* Horizontal Calendar strip */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider">
              {t('calendar.timelineTitle')}
            </span>
            <span className="text-[10px] text-slate-400">{t('calendar.swipeHint')}</span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-2 pt-0.5 no-scrollbar">
            {timelineDays.map(day => {
              const isSelected = selectedDateFilter === day.dateStr;
              const hasActivity = day.hasConcerts.length > 0 || day.hasLotteryDeadline.length > 0 || day.hasPaymentDeadline.length > 0 || day.hasGeneralOpen.length > 0;
              
              return (
                <button
                  key={day.dateStr}
                  id={`day-pill-${day.dayNum}`}
                  onClick={() => setSelectedDateFilter(day.dateStr)}
                  className={`w-11 py-2.5 rounded-2xl flex flex-col items-center justify-between border text-center transition-all shrink-0 grow-0 ${
                    isSelected
                      ? 'text-white'
                      : day.isToday
                      ? 'bg-slate-100 border-slate-600 text-slate-900 font-bold ring-2 ring-slate-200'
                      : 'bg-white border-slate-100/80 text-slate-800'
                  }`}
                  style={{
                    backgroundColor: isSelected ? oshiColor : undefined,
                    borderColor: isSelected ? oshiColor : undefined
                  }}
                >
                  <span className="text-[9px] scale-90 opacity-60 font-medium">
                    {day.dayOfWeek}
                  </span>
                  <span className="text-xs font-bold font-display z-10">
                    {day.dayNum}
                  </span>

                  {/* Indicator Dot arrays */}
                  <div className="flex gap-0.5 h-1 mt-1 justify-center">
                    {day.hasPaymentDeadline.length > 0 && <span className="w-1 h-1 rounded-full bg-rose-500"></span>}
                    {day.hasLotteryDeadline.length > 0 && <span className="w-1 h-1 rounded-full bg-amber-500"></span>}
                    {day.hasConcerts.length > 0 && <span className="w-1 h-1 rounded-full bg-purple-500"></span>}
                    {day.hasGeneralOpen.length > 0 && <span className="w-1 h-1 rounded-full bg-emerald-400"></span>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Selected date events detailed analysis */}
        <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200/50 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200/50 pb-2">
            <span className="text-xs font-bold text-slate-900">
              {t('calendar.dayDetails', {
                date: selectedDayData?.dateStr || '',
                label: selectedDayData?.isToday ? t('common.today') : t('common.scheduleItems'),
              })}
            </span>
            <div className="flex flex-wrap gap-1 justify-end">
              <span className="text-[9px] bg-white border border-slate-100 px-1.5 py-0.5 rounded text-rose-600 font-bold">{t('calendar.legendPayment')}</span>
              <span className="text-[9px] bg-white border border-slate-100 px-1.5 py-0.5 rounded text-amber-600 font-bold">{t('calendar.legendLottery')}</span>
              <span className="text-[9px] bg-white border border-slate-100 px-1.5 py-0.5 rounded text-purple-600 font-bold">{t('calendar.legendConcert')}</span>
              <span className="text-[9px] bg-white border border-slate-100 px-1.5 py-0.5 rounded text-emerald-600 font-bold">{t('calendar.legendSale')}</span>
            </div>
          </div>

          <div className="space-y-2">
            {/* Find matching indicators for selected day */}
            {selectedDayData && (
              <>
                {selectedDayData.hasConcerts.map(e => (
                  <div key={e.id} onClick={() => onSelectEvent(e)} className="cursor-pointer bg-purple-50 border border-purple-100 p-2.5 rounded-xl flex items-center justify-between hover:bg-purple-100/50 transition">
                    <div className="min-w-0 pr-2">
                      <div className="text-[9px] text-purple-600 font-bold uppercase tracking-wider">{t('calendar.eventLabel')}</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{e.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{t('calendar.eventMeta', { time: e.time, venue: e.venueName })}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-purple-400 shrink-0" />
                  </div>
                ))}

                {selectedDayData.hasLotteryDeadline.map(e => (
                  <div key={e.id} onClick={() => onSelectEvent(e)} className="cursor-pointer bg-amber-50 border border-amber-100 p-2.5 rounded-xl flex items-center justify-between hover:bg-amber-100/50 transition">
                    <div className="min-w-0 pr-2">
                      <div className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">{t('calendar.lotteryEndsLabel')}</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{e.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{t('calendar.lotteryEndsMeta', { platform: e.platform })}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
                  </div>
                ))}

                {selectedDayData.hasPaymentDeadline.map(e => (
                  <div key={e.id} onClick={() => onSelectEvent(e)} className="cursor-pointer bg-rose-50 border border-rose-100 p-2.5 rounded-xl flex items-center justify-between hover:bg-rose-100/50 transition">
                    <div className="min-w-0 pr-2">
                      <div className="text-[9px] text-rose-600 font-bold uppercase tracking-wider">{t('calendar.paymentLabel')}</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{e.title}</h4>
                      <p className="text-[10px] text-rose-500 font-mono mt-0.5">{t('calendar.paymentMeta', { platform: e.platform })}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-rose-500 shrink-0" />
                  </div>
                ))}

                {selectedDayData.hasGeneralOpen.map(e => (
                  <div key={e.id} onClick={() => onSelectEvent(e)} className="cursor-pointer bg-emerald-50 border border-emerald-100 p-2.5 rounded-xl flex items-center justify-between hover:bg-emerald-100/50 transition">
                    <div className="min-w-0 pr-2">
                      <div className="text-[9px] text-emerald-700 font-bold uppercase tracking-wider">{t('calendar.generalSaleLabel')}</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{e.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{e.platform}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-emerald-500 shrink-0" />
                  </div>
                ))}

                {selectedDayData.hasConcerts.length === 0 &&
                 selectedDayData.hasLotteryDeadline.length === 0 &&
                 selectedDayData.hasPaymentDeadline.length === 0 &&
                 selectedDayData.hasGeneralOpen.length === 0 && (
	                   <p className="text-[11px] text-slate-400 text-center py-4">{t('calendar.noMarks')}</p>
                 )
                }
              </>
            )}
          </div>
        </div>

        {/* 截止雷达（QA #5）：未来 14 天内已追踪演出的受付/入金締切，按时间升序。
            旧逻辑只在截止=今天/明天时冒头，7 天纵轴外的截止完全不可见 → 容易错过申込。 */}
        {deadlineRadar.length > 0 && (
          <div id="deadline-radar" className="space-y-2 pt-1">
            <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
              <Clock className="w-4 h-4 text-rose-500" />
              {t('calendar.radarTitle', { days: RADAR_HORIZON_DAYS })}
            </h3>
            <div className="bg-white rounded-2xl border border-slate-100 divide-y divide-slate-100 overflow-hidden">
              {deadlineRadar.map((deadlineItem) => {
                const days = getDaysRemaining(deadlineItem.date);
                return (
                  <button
                    key={`${deadlineItem.event.id}-${deadlineItem.kind}-${deadlineItem.at}`}
                    id={`radar-${deadlineItem.event.id}-${deadlineItem.kind}`}
                    onClick={() => onSelectEvent(deadlineItem.event)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 transition"
                  >
                    <span
                      className="text-[10px] font-black font-mono px-1.5 py-0.5 rounded-md text-white shrink-0"
                      style={{ backgroundColor: days <= 1 ? '#f43f5e' : oshiColor }}
                    >
                      {days > 0 ? `T-${days}` : t('common.today')}
                    </span>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 ${
                      deadlineItem.kind === 'apply_end' ? 'bg-amber-50 text-amber-700' : 'bg-rose-50 text-rose-600'
                    }`}>
                      {t(deadlineItem.kind === 'apply_end' ? 'calendar.radarApplyEnd' : 'calendar.radarResultEnd')}
                    </span>
                    <span className="flex-1 min-w-0 text-[11px] font-bold text-slate-800 truncate">
                      {deadlineItem.event.title}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono shrink-0">
                      {formatDisplayDate(deadlineItem.date)}{deadlineItem.label ? ` · ${deadlineItem.label.slice(0, 10)}` : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* My Favorites tick timelines deadlines */}
        <div className="space-y-3 pt-1">
          <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            {t('calendar.boardTitle')}
          </h3>

          {trackedEvents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center space-y-1.5 py-6">
              <p className="text-xs font-bold text-slate-600">{t('calendar.emptyBoardTitle')}</p>
              <p className="text-[10px] text-slate-400">
                {t('calendar.emptyBoardBody')}
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              
              {/* Today list */}
              {(todayLotteryDeadlines.length > 0 || todayPaymentDeadlines.length > 0) && (
                <div className="border border-red-100 rounded-2xl p-3 bg-red-50/50 space-y-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-600">
                    {t('calendar.todayCritical')}
                  </span>

                  {todayLotteryDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[190px]">{t('calendar.lotteryPrefix', { title: e.title })}</span>
                      <button onClick={() => downloadEventIcs(e, 'lottery_end', t)} className="text-[10px] text-white bg-red-500 px-2.5 py-1 rounded-lg">
                        {t('calendar.paymentIcs')}
                      </button>
                    </div>
                  ))}
                  {todayPaymentDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[190px]">{t('calendar.paymentPrefix', { title: e.title })}</span>
                      <button onClick={() => downloadEventIcs(e, 'payment', t)} className="text-[10px] text-white bg-red-500 px-2.5 py-1 rounded-lg">
                        {t('calendar.convenienceIcs')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Tomorrow list */}
              {(tomorrowLotteryDeadlines.length > 0 || tomorrowPaymentDeadlines.length > 0) && (
                <div className="border border-amber-100 rounded-2xl p-3 bg-amber-50/50 space-y-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                    {t('calendar.tomorrowDue')}
                  </span>

                  {tomorrowLotteryDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[195px]">{e.title}</span>
                      <button onClick={() => downloadEventIcs(e, 'lottery_end', t)} className="text-[10px] text-white bg-amber-500 px-2 py-1 rounded-lg">
                        {t('calendar.checkIn')}
                      </button>
                    </div>
                  ))}
                  {tomorrowPaymentDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[195px]">{e.title}</span>
                      <button onClick={() => downloadEventIcs(e, 'payment', t)} className="text-[10px] text-white bg-amber-500 px-2 py-1 rounded-lg">
                        {t('calendar.checkIn')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Master upcoming list */}
              <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 font-mono block">
                  {t('calendar.upcomingTitle')}
                </span>
                
                {upcomingTrackedLives.map(e => {
                  return (
                    <div 
                      key={e.id} 
                      onClick={() => onSelectEvent(e)}
                      className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition"
                    >
                      <div className="text-center bg-slate-100 p-1 rounded-lg w-10 shrink-0">
                        <p className="text-[9px] text-slate-400 font-mono tracking-tighter uppercase">
                          {monthFormatter.format(new Date(`${e.date}T00:00:00+09:00`))}
                        </p>
                        <p className="text-xs font-bold font-display text-slate-800">{e.date.split('-')[2]}</p>
                      </div>

                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{e.title}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[8.5px] font-bold text-slate-400 bg-slate-100 px-1 py-0.2 rounded">
                            {e.platform}
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {e.venueName.slice(0, 15)}...
                          </span>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <span className="text-[10px] font-bold font-mono text-emerald-600 block">
                          {getDaysRemaining(e.date) > 0 ? `T-${getDaysRemaining(e.date)}` : t('calendar.eventDay')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

            </div>
          )}

        </div>

      </div>

    </div>
  );
}

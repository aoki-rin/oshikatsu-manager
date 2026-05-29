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

interface CalendarViewProps {
  events: ActivityEvent[];
  favorites: string[];
  activeAlerts: NotificationAlert[];
  onSelectEvent: (event: ActivityEvent) => void;
  oshiColor: string; // hex
}

export function CalendarView({
  events,
  favorites,
  activeAlerts,
  onSelectEvent,
  oshiColor
}: CalendarViewProps) {
  const alertEventIds = new Set(activeAlerts.map(alert => alert.eventId));
  const favoriteEvents = events.filter(e => favorites.includes(e.id) || alertEventIds.has(e.id));
  const todayKey = getJstDateKey();
  const tomorrowKey = getJstDateKey(new Date(new Date(`${todayKey}T00:00:00+09:00`).getTime() + 86400000));
  
  const daysOfMay = Array.from({ length: 14 }, (_, i) => {
    const date = new Date(new Date(`${todayKey}T00:00:00+09:00`).getTime() + i * 86400000);
    const dateStr = getJstDateKey(date);
    const dayNum = Number(dateStr.slice(8, 10));
    const dayOfWeek = new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'Asia/Tokyo' }).format(date);
    
    // Find events happening on this specific date
    const hasConcerts = favoriteEvents.filter(e => e.date === dateStr);
    const hasLotteryDeadline = favoriteEvents.filter(e => e.timeline.lotteryEndDate === dateStr);
    const hasPaymentDeadline = favoriteEvents.filter(e => e.timeline.paymentDeadlineDate === dateStr);
    const hasGeneralOpen = favoriteEvents.filter(e => e.timeline.generalStartDate === dateStr);

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
  const selectedDayData = daysOfMay.find(d => d.dateStr === selectedDateFilter);
  
  // Categorize timeline events in general:
  // Today's deadlines:
  const todayLotteryDeadlines = favoriteEvents.filter(e => e.timeline.lotteryEndDate === todayKey);
  const todayPaymentDeadlines = favoriteEvents.filter(e => e.timeline.paymentDeadlineDate === todayKey);
  
  // Tomorrow's deadlines:
  const tomorrowLotteryDeadlines = favoriteEvents.filter(e => e.timeline.lotteryEndDate === tomorrowKey);
  const tomorrowPaymentDeadlines = favoriteEvents.filter(e => e.timeline.paymentDeadlineDate === tomorrowKey);

  const upcomingFavoriteLives = favoriteEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleExportAll = () => {
    if (favoriteEvents.length === 0) {
      alert('您的收藏夹目前是空的，请先在“发现”页面点击星星收藏一些演出！');
      return;
    }
    downloadAllFollowedEventsIcs(favoriteEvents);
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
              <h1 className="text-base font-bold font-display tracking-tight text-slate-900">票程日历</h1>
              <p className="text-[10px] text-slate-400 font-mono">基准时间: {todayKey} (JST)</p>
            </div>
          </div>

          <button
            id="btn-export-combined-ics"
            onClick={handleExportAll}
            className="text-[11px] font-bold px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1 transition"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>导出全部到手机日历</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        
        {/* Horizontal Calendar strip */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider">
              近期日程纵轴 (JST TIMELINE)
            </span>
            <span className="text-[10px] text-slate-400">滑动查看 ⮕</span>
          </div>

          <div className="flex gap-2.5 overflow-x-auto pb-2 pt-0.5 no-scrollbar">
            {daysOfMay.map(day => {
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
              📅 {selectedDayData?.dateStr} 提醒详情 ({selectedDayData?.isToday ? '今天' : '日程项'})
            </span>
            <div className="flex gap-2">
              <span className="text-[9px] bg-white border border-slate-100 px-1.5 py-0.5 rounded text-amber-600 font-bold">● 截止</span>
              <span className="text-[9px] bg-white border border-slate-100 px-1.5 py-0.5 rounded text-purple-600 font-bold">● 公演</span>
            </div>
          </div>

          <div className="space-y-2">
            {/* Find matching indicators for selected day */}
            {selectedDayData && (
              <>
                {selectedDayData.hasConcerts.map(e => (
                  <div key={e.id} onClick={() => onSelectEvent(e)} className="cursor-pointer bg-purple-50 border border-purple-100 p-2.5 rounded-xl flex items-center justify-between hover:bg-purple-100/50 transition">
                    <div className="min-w-0 pr-2">
                      <div className="text-[9px] text-purple-600 font-bold uppercase tracking-wider">🎸 演出/公演 Live Show</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{e.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">{e.time} 场 | {e.venueName}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-purple-400 shrink-0" />
                  </div>
                ))}

                {selectedDayData.hasLotteryDeadline.map(e => (
                  <div key={e.id} onClick={() => onSelectEvent(e)} className="cursor-pointer bg-amber-50 border border-amber-100 p-2.5 rounded-xl flex items-center justify-between hover:bg-amber-100/50 transition">
                    <div className="min-w-0 pr-2">
                      <div className="text-[9px] text-amber-700 font-bold uppercase tracking-wider">⚠️ 先行抽选截止 LOTTERY ENDS</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{e.title}</h4>
                      <p className="text-[10px] text-slate-500 font-mono mt-0.5">23:59 截止 | {e.platform}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-500 shrink-0" />
                  </div>
                ))}

                {selectedDayData.hasPaymentDeadline.map(e => (
                  <div key={e.id} onClick={() => onSelectEvent(e)} className="cursor-pointer bg-rose-50 border border-rose-100 p-2.5 rounded-xl flex items-center justify-between hover:bg-rose-100/50 transition">
                    <div className="min-w-0 pr-2">
                      <div className="text-[9px] text-rose-600 font-bold uppercase tracking-wider">🚨 中选门票付款截止 PAYMENT TIME</div>
                      <h4 className="text-xs font-bold text-slate-800 truncate mt-0.5">{e.title}</h4>
                      <p className="text-[10px] text-rose-500 font-mono mt-0.5">23:00 截至 | {e.platform}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-rose-500 shrink-0" />
                  </div>
                ))}

                {selectedDayData.hasConcerts.length === 0 && 
                 selectedDayData.hasLotteryDeadline.length === 0 && 
                 selectedDayData.hasPaymentDeadline.length === 0 && (
                   <p className="text-[11px] text-slate-400 text-center py-4">本日无特别标记的门票抽选或公演开场指标。</p>
                 )
                }
              </>
            )}
          </div>
        </div>

        {/* My Favorites tick timelines deadlines */}
        <div className="space-y-3 pt-1">
          <h3 className="text-xs font-bold text-slate-700 flex items-center gap-1">
            <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
            已收藏 Oshi 票务临期看板 
          </h3>

          {favoriteEvents.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-100 p-4 text-center space-y-1.5 py-6">
              <p className="text-xs font-bold text-slate-600">您的临期看板暂不饱满</p>
              <p className="text-[10px] text-slate-400">
                收藏的购票活动将自动在这里被按截止时间降序排列，帮您盯防便利店结算期！
              </p>
            </div>
          ) : (
            <div className="space-y-2.5">
              
              {/* Today list */}
              {(todayLotteryDeadlines.length > 0 || todayPaymentDeadlines.length > 0) && (
                <div className="border border-red-100 rounded-2xl p-3 bg-red-50/50 space-y-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-100 text-red-600">
                    ⚠️ 今天截止 (TODAY CRITICAL)
                  </span>

                  {todayLotteryDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[190px]">【抽选】{e.title}</span>
                      <button onClick={() => downloadEventIcs(e, 'lottery_end')} className="text-[10px] text-white bg-red-500 px-2.5 py-1 rounded-lg">
                        付款日历.ics
                      </button>
                    </div>
                  ))}
                  {todayPaymentDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[190px]">【支付】{e.title}</span>
                      <button onClick={() => downloadEventIcs(e, 'payment')} className="text-[10px] text-white bg-red-500 px-2.5 py-1 rounded-lg">
                        便利店付款.ics
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Tomorrow list */}
              {(tomorrowLotteryDeadlines.length > 0 || tomorrowPaymentDeadlines.length > 0) && (
                <div className="border border-amber-100 rounded-2xl p-3 bg-amber-50/50 space-y-2">
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-700">
                    ⏰ 明天截止 (TOMORROW DUE)
                  </span>

                  {tomorrowLotteryDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[195px]">{e.title}</span>
                      <button onClick={() => downloadEventIcs(e, 'lottery_end')} className="text-[10px] text-white bg-amber-500 px-2 py-1 rounded-lg">
                        打卡
                      </button>
                    </div>
                  ))}
                  {tomorrowPaymentDeadlines.map(e => (
                    <div key={e.id} className="flex justify-between items-center text-xs">
                      <span className="font-semibold text-slate-800 truncate max-w-[195px]">{e.title}</span>
                      <button onClick={() => downloadEventIcs(e, 'payment')} className="text-[10px] text-white bg-amber-500 px-2 py-1 rounded-lg">
                        打卡
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Master upcoming list */}
              <div className="bg-white rounded-2xl border border-slate-100 p-3.5 space-y-2">
                <span className="text-[10px] font-bold text-slate-400 font-mono block">
                  未来的演出票程 (UPCOMING OSHIKATSU LIST)
                </span>
                
                {upcomingFavoriteLives.map(e => {
                  return (
                    <div 
                      key={e.id} 
                      onClick={() => onSelectEvent(e)}
                      className="flex items-center gap-2.5 py-2 border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50 p-1.5 rounded-lg transition"
                    >
                      <div className="text-center bg-slate-100 p-1 rounded-lg w-10 shrink-0">
                        <p className="text-[9px] text-slate-400 font-mono tracking-tighter uppercase">{e.date.slice(5, 7)}月</p>
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
                          {getDaysRemaining(e.date) > 0 ? `T-${getDaysRemaining(e.date)}` : '公演日'}
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

import React, { useState, useEffect } from 'react';
import { ActivityEvent, Artist, Venue, NotificationAlert, ReminderTarget } from '../types';
import { 
  X, Calendar, Clock, MapPin, Tag, ExternalLink, 
  Sparkles, Bell, Heart, Check, Building, CreditCard 
} from 'lucide-react';
import { downloadEventIcs, formatDisplayDate, getDaysRemaining, platformLabel } from '../utils';
import { buildReminderTargets } from '../notifications';
import { openPurchaseUrl } from '../native';
import { eventPlatforms } from '../sources/aggregate';

// Display an ISO (+09:00) instant in JST regardless of the viewer's timezone (R2 principle).
function fmtJst(iso?: string | null): string {
  if (!iso) return '未定';
  return new Date(iso).toLocaleString('ja-JP', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  });
}

// Status of an application window relative to now.
function windowStatus(applyStart?: string | null, applyEnd?: string | null): { label: string; cls: string } {
  const now = Date.now();
  if (applyEnd && now > new Date(applyEnd).getTime()) return { label: '受付終了', cls: 'bg-slate-400' };
  if (applyStart && now < new Date(applyStart).getTime()) return { label: '受付予定', cls: 'bg-blue-500' };
  return { label: '受付中', cls: 'bg-emerald-500' };
}

function daysLeft(iso?: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

interface EventDetailModalProps {
  event: ActivityEvent;
  artists: Artist[];
  venues: Venue[];
  onClose: () => void;
  isFavorited: boolean;
  onToggleFavorite: (eventId: string) => void;
  isArtistFollowed: boolean;
  onToggleFollowArtist: (artistId: string) => void;
  isVenueFollowed: boolean;
  onToggleFollowVenue: (venueId: string) => void;
  activeAlerts: NotificationAlert[];
  onToggleAlert: (target: ReminderTarget) => void;
  oshiColor: string; // Hex code
}

export function EventDetailModal({
  event,
  artists,
  venues,
  onClose,
  isFavorited,
  onToggleFavorite,
  isArtistFollowed,
  onToggleFollowArtist,
  isVenueFollowed,
  onToggleFollowVenue,
  activeAlerts,
  onToggleAlert,
  oshiColor
}: EventDetailModalProps) {
  const artist = artists.find(a => a.id === event.artistId);
  const venue = venues.find(v => v.id === event.venueId);

  const reminderTargets = buildReminderTargets(event);
  const isReminderActive = (target: ReminderTarget) => activeAlerts.some(a => a.notificationId === target.notificationId);

  const [activeTab, setActiveTab] = useState<'info' | 'timeline' | 'reminders'>('info');

  return (
    <div id={`modal-${event.id}`} className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-end justify-center z-50">
      
      {/* Background click dismiss */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Slide-up Container Panel representing a mobile-native Bottom Sheet */}
      <div 
        id="bottom-sheet-container" 
        className="w-full bg-white rounded-t-[32px] max-h-[85%] overflow-y-auto flex flex-col z-10 shadow-2xl relative transition-transform duration-300 transform translate-y-0"
        style={{ scrollbarWidth: 'none' }}
      >
        {/* Styled Pinch Drag Handle Indicator */}
        <div className="flex justify-center py-2.5">
          <div className="w-12 h-1.5 bg-slate-200 rounded-full"></div>
        </div>

        {/* Modal Close Action Header Row */}
        <div className="px-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
            {event.category}
          </span>
          <div className="flex items-center gap-2">
            {/* Quick Favorite Star Button */}
            <button
              id={`btn-fav-modal-${event.id}`}
              onClick={() => onToggleFavorite(event.id)}
              className="p-1 px-3 rounded-full flex items-center gap-1.5 text-xs font-medium transition-all"
              style={{
                color: isFavorited ? '#ffffff' : oshiColor,
                backgroundColor: isFavorited ? oshiColor : `${oshiColor}15`
              }}
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span>{isFavorited ? '已添加' : '收藏入库'}</span>
            </button>

            <button 
              id="btn-close-bottom-sheet"
              onClick={onClose} 
              className="p-1.5 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 hover:text-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Event Title Card Hero Section */}
        <div className="px-5 py-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {eventPlatforms(event).map((p) => (
              <span
                key={p}
                className="text-[10px] font-bold tracking-widest uppercase px-2 py-0.5 rounded text-white"
                style={{ backgroundColor: oshiColor }}
              >
                {platformLabel(p)}
              </span>
            ))}
            <span className="text-[10px] text-slate-400">源端</span>
          </div>
          <h2 className="text-base font-bold text-slate-900 mt-2 leading-snug">
            {event.title}
          </h2>

          <div className="flex flex-wrap gap-2 mt-2">
            {event.tags.map(tag => (
              <span key={tag} className="text-[11px] font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                #{tag}
              </span>
            ))}
          </div>
        </div>

        {/* Tab Selection Switches (Mobile App Segmented Control Layout) */}
        <div className="px-5">
          <div className="p-0.5 bg-slate-100 rounded-xl flex items-center justify-between">
            <button
              id="btn-tab-info"
              onClick={() => setActiveTab('info')}
              className={`flex-1 text-center py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'info' ? 'bg-white shadow text-slate-950 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              公演信息
            </button>
            <button
              id="btn-tab-timeline"
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 text-center py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'timeline' ? 'bg-white shadow text-slate-950 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              票程Milestones
            </button>
            <button
              id="btn-tab-reminders"
              onClick={() => setActiveTab('reminders')}
              className={`flex-1 text-center py-2 rounded-lg text-xs font-semibold  transition-all flex items-center justify-center gap-1 ${
                activeTab === 'reminders' ? 'bg-white shadow text-slate-950 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Bell className="w-3.5 h-3.5" style={{ color: activeTab === 'reminders' ? oshiColor : undefined }} />
              开票开响提醒
            </button>
          </div>
        </div>

        {/* Scrollable Container Area */}
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-8 h-4/5 text-slate-800">
          
          {activeTab === 'info' && (
            <div className="space-y-4">
              
              {/* Cover concert vibe image */}
              <div className="w-full h-44 rounded-2xl overflow-hidden relative border border-slate-100">
                <img 
                  referrerPolicy="no-referrer"
                  src={event.imageUrl} 
                  alt={event.title} 
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-transparent to-transparent flex items-end p-4">
                  <div>
                    <span className="text-[10px] text-white/80 font-mono">公演日期与时间</span>
                    <p className="text-white text-sm font-bold flex items-center gap-1.5 mt-0.5">
                      <Calendar className="w-4 h-4 text-white" />
                      {formatDisplayDate(event.date)} ({event.time})
                    </p>
                  </div>
                </div>
              </div>

              {/* Venue and access list */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-3">
                <div className="flex gap-2.5">
                  <div className="p-1.5 h-fit bg-slate-200 rounded-lg text-slate-700">
                    <MapPin className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-900">演馆：{event.venueName}</h4>
                      <button
                        onClick={() => onToggleFollowVenue(event.venueId)}
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold transition-all border ${
                          isVenueFollowed 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isVenueFollowed ? '✓ 关注该馆' : '+ 关注场馆'}
                      </button>
                    </div>
                    {venue ? (
                      <>
                        <p className="text-[11px] text-slate-500 mt-1">{venue.address}</p>
                        <p className="text-[11px] text-slate-500 leading-tight mt-1 bg-white p-1.5 rounded border border-slate-100">
                          🏢 容纳数: <b className="text-slate-700">{venue.capacity?.toLocaleString()}人</b>
                        </p>
                        <p className="text-[11px] text-slate-400 leading-tight mt-1.5 font-mono">
                          🚉 {venue.accessInfo}
                        </p>
                      </>
                    ) : (
                      event.region && <p className="text-[11px] text-slate-500 mt-1">📍 {event.region}</p>
                    )}
                  </div>
                </div>

                <div className="border-t border-slate-200/50 pt-2.5 flex gap-2.5">
                  <div className="p-1.5 h-fit bg-slate-200 rounded-lg text-slate-700">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">参考票价/席位</h4>
                    <p className="text-sm font-bold text-amber-600 mt-0.5">{event.price}</p>
                  </div>
                </div>
              </div>

              {/* Performer Oshi description */}
              <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2.5">
                <div className="flex items-center gap-2.5">
                  {artist?.avatarUrl ? (
                    <img
                      referrerPolicy="no-referrer"
                      src={artist.avatarUrl}
                      alt={artist.name}
                      className="w-10 h-10 rounded-full object-cover border-2 border-slate-200"
                    />
                  ) : (
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold border-2 border-slate-200 shrink-0"
                      style={{ backgroundColor: oshiColor }}
                    >
                      {event.artistName.slice(0, 1)}
                    </div>
                  )}
                  <div>
                    <div className="flex items-center gap-1.5">
                      <h4 className="text-xs font-bold text-slate-900">演职艺人：{event.artistName}</h4>
                      <button
                        onClick={() => onToggleFollowArtist(event.artistId)}
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold transition-all border ${
                          isArtistFollowed
                            ? 'bg-pink-50 text-pink-600 border-pink-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isArtistFollowed ? '♥ 已在推し名单' : '+ 加入推し'}
                      </button>
                    </div>
                    {artist && (
                      <p className="text-[10px] text-slate-400 font-mono">推心指数: {artist.followerCount?.toLocaleString()} 粉丝</p>
                    )}
                  </div>
                </div>
                {artist?.description && (
                  <p className="text-xs text-slate-600 leading-relaxed pt-1.5 border-t border-slate-200/50">
                    {artist.description}
                  </p>
                )}
              </div>

              {/* Narrative detailed event explanation */}
              <div className="space-y-1">
                <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1">
                  <Sparkles className="w-3.5 h-3.5 text-slate-500" />
                  公演特色亮点简介
                </h4>
                <p className="text-xs text-slate-600 leading-relaxed bg-slate-100/50 p-3 rounded-xl border border-slate-100">
                  {event.description}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div className="space-y-4">
              {/* R3: 真实抓取的多轮抽選/发售窗口（JST 显示） */}
              {event.ticketWindows && event.ticketWindows.length > 0 && (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500 leading-tight">
                    🎫 自动抓取的多轮抽選/发售窗口（时间为日本时间 JST）。每轮可点「申込」直达，或点来源核对。
                  </p>
                  {event.ticketWindows.map((w) => {
                    const st = windowStatus(w.applyStart, w.applyEnd);
                    const dl = daysLeft(w.applyEnd);
                    return (
                      <div key={w.id} className="rounded-2xl border border-slate-200 p-3.5 bg-white">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-white px-2 py-0.5 rounded" style={{ backgroundColor: oshiColor }}>{platformLabel(w.platform)}</span>
                            <span className="text-xs font-bold text-slate-900">{w.roundType}</span>
                          </div>
                          <span className={`text-[9px] font-bold text-white px-2 py-0.5 rounded-full ${w.statusText ? (/終了|完売/.test(w.statusText) ? 'bg-slate-400' : 'bg-emerald-500') : st.cls}`}>{w.statusText || st.label}</span>
                        </div>
                        <div className="mt-2 space-y-1">
                          {(w.applyStart || w.applyEnd) && (
                            <p className="text-[11px] text-slate-700"><span className="text-slate-400">受付</span> {fmtJst(w.applyStart)} → {fmtJst(w.applyEnd)}</p>
                          )}
                          {(w.resultStart || w.resultEnd) && (
                            <p className="text-[11px] text-slate-700"><span className="text-slate-400">当落・入金</span> {fmtJst(w.resultStart)} → {fmtJst(w.resultEnd)}</p>
                          )}
                          {st.label === '受付中' && dl !== null && dl >= 0 && (
                            <p className="text-[11px] font-bold text-rose-600">締切まであと {dl} 日</p>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          {w.applyUrl && (
                            <button onClick={() => openPurchaseUrl(w.applyUrl!)} className="text-[10px] font-bold text-white px-2.5 py-1 rounded-lg" style={{ backgroundColor: oshiColor }}>申込はこちら ↗</button>
                          )}
                          {w.sourceUrl && (
                            <button onClick={() => openPurchaseUrl(w.sourceUrl!)} className="text-[10px] text-slate-500 underline">来源核对</button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 汎用 fallback timeline（无抓取窗口时） */}
              {(!event.ticketWindows || event.ticketWindows.length === 0) && (
              <>
              <p className="text-[11px] text-slate-500 leading-tight">
                🎫 日本各大票务平台购票一般分为 <b>抽选先行申请</b> 与 <b>一般先到先得发售</b>，中选后务必在 <b>付款截止日</b> 前完成结算。点击以下任意节点可单独生成 ICS 文件！
              </p>

              {/* Interactive Visual Timeline List */}
              <div className="relative pl-6 space-y-5 border-l border-slate-200/80 ml-2 pt-2 pb-2">
                
                {/* 1. Lottery Start */}
                {event.timeline.lotteryStartDate && (
                  <div className="relative">
                    <div className="absolute -left-8.5 top-0.5 w-5 h-5 rounded-full bg-blue-500 border-4 border-white shadow-sm flex items-center justify-center"></div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">抽选申请首日 (Lottery Open)</span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'lottery_end')}
                          className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100 transition"
                        >
                          导出.ics
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-605 mt-0.5">{event.timeline.lotteryStartDate} 起</p>
                      <p className="text-[11px] text-slate-400">先行申票渠道开启，各票仓开始接受会员或特约卡中选取。开票率高。</p>
                    </div>
                  </div>
                )}

                {/* 2. Lottery End */}
                {event.timeline.lotteryEndDate && (
                  <div className="relative">
                    <div className="absolute -left-8.5 top-0.5 w-5 h-5 rounded-full bg-amber-500 border-4 border-white shadow-sm flex items-center justify-center"></div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">先期抽选截止 (Lottery Deadline)</span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'lottery_end')}
                          className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded hover:bg-amber-100 transition"
                        >
                          导出.ics
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-605 mt-0.5">{event.timeline.lotteryEndDate} 23:59止</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500 text-white">重要</span>
                        <span className="text-[11px] text-amber-700 font-medium">
                          {getDaysRemaining(event.timeline.lotteryEndDate) > 0 
                            ? `仅剩 ${getDaysRemaining(event.timeline.lotteryEndDate)} 天申购时间` 
                            : '已截止申请'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. Payment Deadline */}
                {event.timeline.paymentDeadlineDate && (
                  <div className="relative">
                    <div className="absolute -left-8.5 top-0.5 w-5 h-5 rounded-full bg-rose-600 border-4 border-white shadow-sm flex items-center justify-center animate-pulse"></div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                          首轮中选付款截止
                        </span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'payment')}
                          className="text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded hover:bg-rose-100 transition"
                        >
                          导出.ics
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-605 mt-0.5">{event.timeline.paymentDeadlineDate} 23:00</p>
                      <p className="text-[11px] text-slate-400">中选通知书发放后的第2~3天，未按时通过便利店或国际信用卡付款将自动作废名额。</p>
                    </div>
                  </div>
                )}

                {/* 4. General Sales Start */}
                {event.timeline.generalStartDate && (
                  <div className="relative">
                    <div className="absolute -left-8.5 top-0.5 w-5 h-5 rounded-full bg-emerald-500 border-4 border-white shadow-sm flex items-center justify-center"></div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">一般票先到先得发售 (General Sale)</span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'concert')}
                          className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded hover:bg-emerald-110 transition"
                        >
                          导出.ics
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-650 mt-0.5">{event.timeline.generalStartDate} 10:00</p>
                      <p className="text-[11px] text-slate-400">公开一般发售，通常不拼运气而拼网速，瞬间秒空，请预先备好对应票仓认证环境。</p>
                    </div>
                  </div>
                )}
              </div>
              </>
              )}
            </div>
          )}

          {activeTab === 'reminders' && (
            <div className="space-y-4">
              <div className="bg-amber-50 rounded-xl p-3 border border-amber-100 text-[11px] text-amber-800 leading-snug">
                🚨 <b>本地通知</b>：这些开关会向 Android/iOS 系统登记本地通知。若系统权限关闭，App 会提示你打开通知权限。
              </div>

              <div className="space-y-3">
                {reminderTargets.length === 0 ? (
                  <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-600">这个结果还没有可提醒的票务时间</p>
                    <p className="text-[10px] text-slate-400 mt-1">请打开来源核对；平台补全受付期間后再次搜索会自动更新。</p>
                  </div>
                ) : reminderTargets.map((target) => {
                  const active = isReminderActive(target);
                  return (
                    <div key={`${target.windowId}-${target.type}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                      <div className="min-w-0 pr-3">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{target.label}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{fmtJst(target.scheduleAt)}</p>
                      </div>
                      <button
                        id={`opt-${target.notificationId}`}
                        onClick={() => onToggleAlert(target)}
                        className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-all shrink-0 ${
                          active ? 'bg-emerald-500 justify-end' : 'bg-slate-300 justify-start'
                        }`}
                      >
                        <div className="w-4 h-4 rounded-full bg-white shadow"></div>
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>

        {/* Footer Jump Action Panel */}
        <div className="p-4 bg-slate-100 border-t border-slate-200 flex items-center gap-2.5">
          <div className="flex-1">
            <span className="text-[9px] text-slate-400 font-mono">Aggregation Protocol Verified</span>
            <p className="text-[10px] text-slate-600 font-medium">已就绪抓取链接。将代理分发至移动浏览器。</p>
          </div>
          <button
            id={`btn-visit-source-${event.id}`}
            onClick={() => openPurchaseUrl(event.purchaseUrl || event.originalUrl)}
            className="px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition pulse-primary shadow-md"
            style={{ backgroundColor: oshiColor }}
          >
            <span>直接前往 {platformLabel(event.platform)} 购票</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}

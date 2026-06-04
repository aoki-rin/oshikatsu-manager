import React, { useState, useEffect } from 'react';
import { ActivityEvent, Artist, Venue, NotificationAlert, ReminderTarget } from '../types';
import { 
  X, Calendar, Clock, MapPin, Tag, ExternalLink, 
  Sparkles, Bell, Heart, Check, Building, CreditCard 
} from 'lucide-react';
import { downloadEventIcs, formatDisplayDate, getDaysRemaining, platformLabel } from '../utils';
import { buildReminderTargets, isPastReminder } from '../notifications';
import { openPurchaseUrl } from '../native';
import { eventPlatforms } from '../sources/aggregate';
import { primaryPurchaseUrl, isHttpUrl } from '../sources/shared';
import { enrichPiaWindows } from '../sources/pia';
import { useI18n } from '../i18n/I18nProvider';
import type { Locale, TFunction } from '../i18n/core';

// Display an ISO (+09:00) instant in JST regardless of the viewer's timezone (R2 principle).
function fmtJst(iso: string | null | undefined, t: TFunction, locale: Locale): string {
  if (!iso) return t('common.unspecified');
  return new Date(iso).toLocaleString(locale, {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  });
}

// Status of an application window relative to now.
function windowStatus(
  applyStart: string | null | undefined,
  applyEnd: string | null | undefined,
  t: TFunction,
): { label: string; cls: string; state: 'ended' | 'upcoming' | 'open' } {
  const now = Date.now();
  if (applyEnd && now > new Date(applyEnd).getTime()) return { label: t('detail.windowStatusEnded'), cls: 'bg-slate-400', state: 'ended' };
  if (applyStart && now < new Date(applyStart).getTime()) return { label: t('detail.windowStatusUpcoming'), cls: 'bg-blue-500', state: 'upcoming' };
  return { label: t('detail.windowStatusOpen'), cls: 'bg-emerald-500', state: 'open' };
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
  onToggleFavorite: (event: ActivityEvent) => void;
  isArtistFollowed: boolean;
  onToggleFollowArtist: (artistId: string) => void;
  isVenueFollowed: boolean;
  onToggleFollowVenue: (venueId: string) => void;
  activeAlerts: NotificationAlert[];
  onToggleAlert: (target: ReminderTarget) => void;
  onEnrichEvent?: (event: ActivityEvent) => void;
  oshiColor: string; // Hex code
}

export function EventDetailModal({
  event: eventProp,
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
  onEnrichEvent,
  oshiColor
}: EventDetailModalProps) {
  const { locale, t } = useI18n();
  const numberFormatter = new Intl.NumberFormat(locale);
  // Lazy detail enrichment (e.g. Pia precise 受付 dates) on open — search stays fast,
  // details load when you actually open the event (Mihon-style). Best-effort.
  const [event, setEvent] = useState<ActivityEvent>(eventProp);
  useEffect(() => {
    setEvent(eventProp);
    let cancelled = false;
    enrichPiaWindows(eventProp).then((enriched) => {
      if (cancelled || enriched === eventProp) return;
      setEvent(enriched);
      onEnrichEvent?.(enriched);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventProp.id]);

  const artist = artists.find(a => a.id === event.artistId);
  const venue = venues.find(v => v.id === event.venueId);

  // 过滤掉已过期的窗口：避免对已结束的受付显示一个「点了就立刻弹/无反应」的提醒开关。
  const reminderTargets = buildReminderTargets(event, t).filter((target) => !isPastReminder(target));
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
              onClick={() => onToggleFavorite(event)}
              className="p-1 px-3 rounded-full flex items-center gap-1.5 text-xs font-medium transition-all"
              style={{
                color: isFavorited ? '#ffffff' : oshiColor,
                backgroundColor: isFavorited ? oshiColor : `${oshiColor}15`
              }}
            >
              <Heart className="w-3.5 h-3.5 fill-current" />
              <span>{isFavorited ? t('detail.favoriteAdded') : t('detail.favoriteAdd')}</span>
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
            <span className="text-[10px] text-slate-400">{t('common.source')}</span>
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
              {t('detail.tabInfo')}
            </button>
            <button
              id="btn-tab-timeline"
              onClick={() => setActiveTab('timeline')}
              className={`flex-1 text-center py-2 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'timeline' ? 'bg-white shadow text-slate-950 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              {t('detail.tabTimeline')}
            </button>
            <button
              id="btn-tab-reminders"
              onClick={() => setActiveTab('reminders')}
              className={`flex-1 text-center py-2 rounded-lg text-xs font-semibold  transition-all flex items-center justify-center gap-1 ${
                activeTab === 'reminders' ? 'bg-white shadow text-slate-950 font-bold' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Bell className="w-3.5 h-3.5" style={{ color: activeTab === 'reminders' ? oshiColor : undefined }} />
              {t('detail.tabReminders')}
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
                    <span className="text-[10px] text-white/80 font-mono">{t('detail.dateTimeLabel')}</span>
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
                      <h4 className="text-xs font-bold text-slate-900">{t('detail.venueTitle', { name: event.venueName })}</h4>
                      <button
                        onClick={() => onToggleFollowVenue(event.venueId)}
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold transition-all border ${
                          isVenueFollowed 
                            ? 'bg-emerald-50 text-emerald-600 border-emerald-200' 
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isVenueFollowed ? t('detail.followVenueOn') : t('detail.followVenueOff')}
                      </button>
                    </div>
                    {venue ? (
                      <>
                        <p className="text-[11px] text-slate-500 mt-1">{venue.address}</p>
                        <p className="text-[11px] text-slate-500 leading-tight mt-1 bg-white p-1.5 rounded border border-slate-100">
                          🏢 <b className="text-slate-700">{t('detail.capacity', { count: numberFormatter.format(venue.capacity ?? 0) })}</b>
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
                    <h4 className="text-xs font-bold text-slate-900">{t('detail.priceTitle')}</h4>
                    {event.price && event.price !== '—' ? (
                      <p className="text-sm font-bold text-amber-600 mt-0.5">{event.price}</p>
                    ) : (
                      <p className="text-xs text-slate-400 mt-0.5">{t('detail.priceUnavailable')}</p>
                    )}
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
                      <h4 className="text-xs font-bold text-slate-900">{t('detail.artistTitle', { name: event.artistName })}</h4>
                      <button
                        onClick={() => onToggleFollowArtist(event.artistId)}
                        className={`text-[9px] px-2 py-0.5 rounded-full font-bold transition-all border ${
                          isArtistFollowed
                            ? 'bg-pink-50 text-pink-600 border-pink-200'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isArtistFollowed ? t('detail.followArtistOn') : t('detail.followArtistOff')}
                      </button>
                    </div>
                    {artist && (
                      <p className="text-[10px] text-slate-400 font-mono">{t('detail.artistPower', { count: numberFormatter.format(artist.followerCount ?? 0) })}</p>
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
                  {t('detail.descriptionTitle')}
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
                    {t('detail.windowsIntro')}
                  </p>
                  {event.ticketWindows.map((w) => {
                    const st = windowStatus(w.applyStart, w.applyEnd, t);
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
                            <p className="text-[11px] text-slate-700"><span className="text-slate-400">{t('detail.windowApplyRangeLabel')}</span> {fmtJst(w.applyStart, t, locale)} → {fmtJst(w.applyEnd, t, locale)}</p>
                          )}
                          {(w.resultStart || w.resultEnd) && (
                            <p className="text-[11px] text-slate-700"><span className="text-slate-400">{t('detail.windowResultRangeLabel')}</span> {fmtJst(w.resultStart, t, locale)} → {fmtJst(w.resultEnd, t, locale)}</p>
                          )}
                          {st.state === 'open' && dl !== null && dl >= 0 && (
                            <p className="text-[11px] font-bold text-rose-600">{t('detail.windowDeadlineDays', { days: dl })}</p>
                          )}
                        </div>
                        <div className="mt-2.5 flex items-center gap-2">
                          {isHttpUrl(w.applyUrl) && (
                            <button onClick={() => openPurchaseUrl(w.applyUrl!)} className="text-[10px] font-bold text-white px-2.5 py-1 rounded-lg" style={{ backgroundColor: oshiColor }}>{t('detail.applyButton')}</button>
                          )}
                          {isHttpUrl(w.sourceUrl) && (
                            <button onClick={() => openPurchaseUrl(w.sourceUrl!)} className="text-[10px] text-slate-500 underline">{t('common.checkSource')}</button>
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
                {t('detail.timelineIntro')}
              </p>

              {/* Interactive Visual Timeline List */}
              <div className="relative pl-6 space-y-5 border-l border-slate-200/80 ml-2 pt-2 pb-2">
                
                {/* 1. Lottery Start */}
                {event.timeline.lotteryStartDate && (
                  <div className="relative">
                    <div className="absolute -left-8.5 top-0.5 w-5 h-5 rounded-full bg-blue-500 border-4 border-white shadow-sm flex items-center justify-center"></div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{t('detail.lotteryOpenTitle')}</span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'lottery_end', t)}
                          className="text-[10px] text-blue-600 bg-blue-50 px-2 py-0.5 rounded hover:bg-blue-100 transition"
                        >
                          {t('common.exportIcs')}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-605 mt-0.5">{t('detail.lotteryOpenDate', { date: event.timeline.lotteryStartDate })}</p>
                      <p className="text-[11px] text-slate-400">{t('detail.lotteryOpenBody')}</p>
                    </div>
                  </div>
                )}

                {/* 2. Lottery End */}
                {event.timeline.lotteryEndDate && (
                  <div className="relative">
                    <div className="absolute -left-8.5 top-0.5 w-5 h-5 rounded-full bg-amber-500 border-4 border-white shadow-sm flex items-center justify-center"></div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{t('detail.lotteryDeadlineTitle')}</span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'lottery_end', t)}
                          className="text-[10px] text-amber-600 bg-amber-50 px-2 py-0.5 rounded hover:bg-amber-100 transition"
                        >
                          {t('common.exportIcs')}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-605 mt-0.5">{t('detail.lotteryDeadlineDate', { date: event.timeline.lotteryEndDate })}</p>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-amber-500 text-white">{t('detail.important')}</span>
                        <span className="text-[11px] text-amber-700 font-medium">
                          {getDaysRemaining(event.timeline.lotteryEndDate) > 0 
                            ? t('detail.lotteryRemainingDays', { days: getDaysRemaining(event.timeline.lotteryEndDate) })
                            : t('detail.lotteryClosed')}
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
                          {t('detail.paymentDeadlineTitle')}
                        </span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'payment', t)}
                          className="text-[10px] text-rose-600 bg-rose-50 px-2 py-0.5 rounded hover:bg-rose-100 transition"
                        >
                          {t('common.exportIcs')}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-605 mt-0.5">{t('detail.paymentDeadlineDate', { date: event.timeline.paymentDeadlineDate })}</p>
                      <p className="text-[11px] text-slate-400">{t('detail.paymentDeadlineBody')}</p>
                    </div>
                  </div>
                )}

                {/* 4. General Sales Start */}
                {event.timeline.generalStartDate && (
                  <div className="relative">
                    <div className="absolute -left-8.5 top-0.5 w-5 h-5 rounded-full bg-emerald-500 border-4 border-white shadow-sm flex items-center justify-center"></div>
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-900">{t('detail.generalSaleTitle')}</span>
                        <button 
                          onClick={() => downloadEventIcs(event, 'concert', t)}
                          className="text-[10px] text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded hover:bg-emerald-110 transition"
                        >
                          {t('common.exportIcs')}
                        </button>
                      </div>
                      <p className="text-xs font-mono text-slate-650 mt-0.5">{t('detail.generalSaleDate', { date: event.timeline.generalStartDate })}</p>
                      <p className="text-[11px] text-slate-400">{t('detail.generalSaleBody')}</p>
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
                🚨 <b>{t('detail.reminderIntroTitle')}</b>: {t('detail.reminderIntroBody')}
              </div>

              <div className="space-y-3">
                {reminderTargets.length === 0 ? (
                  <div className="text-center p-4 bg-slate-50 rounded-xl border border-slate-100">
                    <p className="text-xs font-bold text-slate-600">{t('detail.reminderEmptyTitle')}</p>
                    <p className="text-[10px] text-slate-400 mt-1">{t('detail.reminderEmptyBody')}</p>
                  </div>
                ) : reminderTargets.map((target) => {
                  const active = isReminderActive(target);
                  return (
                    <div key={`${target.windowId}-${target.type}`} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/60">
                      <div className="min-w-0 pr-3">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{target.label}</h4>
                        <p className="text-[10px] text-slate-400 mt-0.5">{fmtJst(target.scheduleAt, t, locale)}</p>
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
        <div className="p-4 bg-slate-100 border-t border-slate-200">
          <button
            id={`btn-visit-source-${event.id}`}
            onClick={() => openPurchaseUrl(primaryPurchaseUrl(event))}
            className="w-full justify-center px-4 py-2.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition pulse-primary shadow-md"
            style={{ backgroundColor: oshiColor }}
          >
            <span>{t('detail.openPurchaseButton', { platform: platformLabel(event.platform) })}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
}

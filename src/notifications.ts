import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ActivityEvent, AlertType, ReminderTarget, TicketWindow } from './types';
import { createTranslator, type TFunction } from './i18n/core';

const defaultT = createTranslator('zh-CN');

function hashPositive(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647 || 1;
}

export function makeReminderNotificationId(eventId: string, windowId: string, type: AlertType): number {
  return hashPositive(`${eventId}:${windowId}:${type}`);
}

function formatJstIso(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:00+09:00`;
}

function minusHours(iso: string, hours: number): string {
  return formatJstIso(new Date(new Date(iso).getTime() - hours * 3600000));
}

function fromEventDate(event: ActivityEvent): string | null {
  if (!event.date) return null;
  return `${event.date}T${event.time || '18:00'}:00+09:00`;
}

function target(
  event: ActivityEvent,
  windowId: string,
  type: AlertType,
  label: string,
  scheduleAt: string | null | undefined,
  t: TFunction,
): ReminderTarget | null {
  if (!scheduleAt) return null;
  const titleMap: Record<AlertType, string> = {
    lottery_start: t('notification.title.lottery_start'),
    lottery_end: t('notification.title.lottery_end'),
    general_start: t('notification.title.general_start'),
    result_start: t('notification.title.result_start'),
    payment_deadline: t('notification.title.payment_deadline'),
    concert: t('notification.title.concert'),
  };
  return {
    eventId: event.id,
    eventTitle: event.title,
    platform: event.platform,
    windowId,
    type,
    label,
    scheduleAt,
    notificationId: makeReminderNotificationId(event.id, windowId, type),
    title: `【${titleMap[type]}】${event.artistName}`,
    body: t('notification.body', { title: event.title, platform: event.platform }),
  };
}

function targetsFromWindow(event: ActivityEvent, window: TicketWindow, t: TFunction): ReminderTarget[] {
  const result = [
    target(event, window.id, 'lottery_start', t('notification.window.lotteryStart', { round: window.roundType }), window.applyStart, t),
    target(event, window.id, 'lottery_end', t('notification.window.lotteryEnd', { round: window.roundType }), window.applyEnd ? minusHours(window.applyEnd, 24) : null, t),
    target(event, window.id, 'result_start', t('notification.window.resultStart', { round: window.roundType }), window.resultStart, t),
    target(event, window.id, 'payment_deadline', t('notification.window.paymentDeadline', { round: window.roundType }), window.resultEnd, t),
  ].filter(Boolean) as ReminderTarget[];
  return result;
}

export function buildReminderTargets(event: ActivityEvent, t: TFunction = defaultT): ReminderTarget[] {
  const windowTargets = (event.ticketWindows || []).flatMap((window) => targetsFromWindow(event, window, t));
  const fallbackTargets = [
    target(event, 'event', 'lottery_start', t('notification.fallback.lotteryStart'), event.timeline.lotteryStartDate ? `${event.timeline.lotteryStartDate}T10:00:00+09:00` : null, t),
    target(event, 'event', 'lottery_end', t('notification.fallback.lotteryEnd'), event.timeline.lotteryEndDate ? `${event.timeline.lotteryEndDate}T23:59:00+09:00` : null, t),
    target(event, 'event', 'general_start', t('notification.fallback.generalStart'), event.timeline.generalStartDate ? `${event.timeline.generalStartDate}T08:00:00+09:00` : null, t),
    target(event, 'event', 'payment_deadline', t('notification.fallback.paymentDeadline'), event.timeline.paymentDeadlineDate ? `${event.timeline.paymentDeadlineDate}T20:00:00+09:00` : null, t),
  ].filter(Boolean) as ReminderTarget[];
  const concert = target(event, 'event', 'concert', t('notification.fallback.concert'), fromEventDate(event), t);
  return [...(windowTargets.length > 0 ? windowTargets : fallbackTargets), ...(concert ? [concert] : [])];
}

export async function scheduleReminderTarget(targetInfo: ReminderTarget, t: TFunction = defaultT): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error(t('notification.nativeOnly'));
  }
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') {
    throw new Error(t('notification.permissionClosed'));
  }
  await LocalNotifications.schedule({
    notifications: [{
      id: targetInfo.notificationId,
      title: targetInfo.title,
      body: targetInfo.body,
      schedule: { at: new Date(targetInfo.scheduleAt) },
      extra: {
        eventId: targetInfo.eventId,
        windowId: targetInfo.windowId,
        type: targetInfo.type,
      },
    }],
  });
}

export async function cancelReminderTarget(notificationId: number): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  await LocalNotifications.cancel({ notifications: [{ id: notificationId }] });
}

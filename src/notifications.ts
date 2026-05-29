import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ActivityEvent, AlertType, ReminderTarget, TicketWindow } from './types';

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
): ReminderTarget | null {
  if (!scheduleAt) return null;
  const titleMap: Record<AlertType, string> = {
    lottery_start: '抽选开始',
    lottery_end: '抽选截止',
    general_start: '一般发售',
    result_start: '当落发表',
    payment_deadline: '付款截止',
    concert: '公演开始',
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
    body: `${event.title} / ${event.platform}`,
  };
}

function targetsFromWindow(event: ActivityEvent, window: TicketWindow): ReminderTarget[] {
  const result = [
    target(event, window.id, 'lottery_start', `${window.roundType} 受付开始`, window.applyStart),
    target(event, window.id, 'lottery_end', `${window.roundType} 截止前24小时`, window.applyEnd ? minusHours(window.applyEnd, 24) : null),
    target(event, window.id, 'result_start', `${window.roundType} 当落发表`, window.resultStart),
    target(event, window.id, 'payment_deadline', `${window.roundType} 付款截止`, window.resultEnd),
  ].filter(Boolean) as ReminderTarget[];
  return result;
}

export function buildReminderTargets(event: ActivityEvent): ReminderTarget[] {
  const windowTargets = (event.ticketWindows || []).flatMap((window) => targetsFromWindow(event, window));
  const fallbackTargets = [
    target(event, 'event', 'lottery_start', '抽选开始', event.timeline.lotteryStartDate ? `${event.timeline.lotteryStartDate}T10:00:00+09:00` : null),
    target(event, 'event', 'lottery_end', '抽选截止前24小时', event.timeline.lotteryEndDate ? `${event.timeline.lotteryEndDate}T23:59:00+09:00` : null),
    target(event, 'event', 'general_start', '一般发售前2小时', event.timeline.generalStartDate ? `${event.timeline.generalStartDate}T08:00:00+09:00` : null),
    target(event, 'event', 'payment_deadline', '付款截止', event.timeline.paymentDeadlineDate ? `${event.timeline.paymentDeadlineDate}T20:00:00+09:00` : null),
  ].filter(Boolean) as ReminderTarget[];
  const concert = target(event, 'event', 'concert', '公演开始', fromEventDate(event));
  return [...(windowTargets.length > 0 ? windowTargets : fallbackTargets), ...(concert ? [concert] : [])];
}

export async function scheduleReminderTarget(targetInfo: ReminderTarget): Promise<void> {
  if (!Capacitor.isNativePlatform()) {
    throw new Error('本地通知仅支持 Android/iOS App，请在手机包中开启提醒');
  }
  const permission = await LocalNotifications.requestPermissions();
  if (permission.display !== 'granted') {
    throw new Error('系统通知权限未开启');
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

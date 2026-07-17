import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import type { ActivityEvent, AlertType, ReminderTarget, TicketWindow } from './types';
import { stableConcertKey } from './sources/aggregate';
import { createTranslator, type TFunction } from './i18n/core';

const defaultT = createTranslator('zh-CN');

function hashPositive(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 2147483647 || 1;
}

// keyBase 应传「跨聚合稳定的并发键」(stableConcertKey),而非易变的 event.id(#74)。
export function makeReminderNotificationId(keyBase: string, windowId: string, type: AlertType): number {
  return hashPositive(`${keyBase}:${windowId}:${type}`);
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

// 申込締切提醒的时刻选择：常规提前 24h;已不足 24h 时退化为提前 1h（临近締切恰是最需要
// 提醒的时段,旧逻辑固定 −24h → 一旦已过就被 isPastReminder 过滤,开关整个消失）;
// 不足 1h / 締切已过 / 垃圾日期串（formatToParts(Invalid Date) 会抛 RangeError,
// 调用链直通详情页渲染,毒性套件抓获过）→ null,不产出提醒目标。
interface DeadlineReminder {
  scheduleAt: string;
  hoursBefore: 24 | 1; // 消费方据此选 label 文案（「前24小时」vs「前1小时」）
}

function deadlineReminder(applyEndIso: string, now: Date): DeadlineReminder | null {
  const end = new Date(applyEndIso).getTime();
  if (Number.isNaN(end) || end <= now.getTime()) return null;
  for (const hoursBefore of [24, 1] as const) {
    const at = end - hoursBefore * 3600000;
    if (at > now.getTime()) return { scheduleAt: formatJstIso(new Date(at)), hoursBefore };
  }
  return null;
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
  // 空值或垃圾日期串都不产出提醒目标——scheduleAt 会被 isPastReminder/原生排程直接消费
  if (!scheduleAt || Number.isNaN(new Date(scheduleAt).getTime())) return null;
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
    notificationId: makeReminderNotificationId(stableConcertKey(event), windowId, type),
    title: `【${titleMap[type]}】${event.artistName}`,
    body: t('notification.body', { title: event.title, platform: event.platform }),
  };
}

function targetsFromWindow(event: ActivityEvent, window: TicketWindow, t: TFunction, now: Date): ReminderTarget[] {
  const endReminder = window.applyEnd ? deadlineReminder(window.applyEnd, now) : null;
  const result = [
    target(event, window.id, 'lottery_start', t('notification.window.lotteryStart', { round: window.roundType }), window.applyStart, t),
    target(event, window.id, 'lottery_end', t(endReminder?.hoursBefore === 1 ? 'notification.window.lotteryEndSoon' : 'notification.window.lotteryEnd', { round: window.roundType }), endReminder?.scheduleAt ?? null, t),
    target(event, window.id, 'result_start', t('notification.window.resultStart', { round: window.roundType }), window.resultStart, t),
    target(event, window.id, 'payment_deadline', t('notification.window.paymentDeadline', { round: window.roundType }), window.resultEnd, t),
  ].filter(Boolean) as ReminderTarget[];
  return result;
}

export function buildReminderTargets(event: ActivityEvent, t: TFunction = defaultT, now: Date = new Date()): ReminderTarget[] {
  const windowTargets = (event.ticketWindows || []).flatMap((window) => targetsFromWindow(event, window, t, now));
  const fallbackEnd = event.timeline.lotteryEndDate ? deadlineReminder(`${event.timeline.lotteryEndDate}T23:59:00+09:00`, now) : null;
  const fallbackTargets = [
    target(event, 'event', 'lottery_start', t('notification.fallback.lotteryStart'), event.timeline.lotteryStartDate ? `${event.timeline.lotteryStartDate}T10:00:00+09:00` : null, t),
    // 提前 24h 的语义(#75)由 deadlineReminder 承接,并叠加临近締切的 −1h 兜底。
    target(event, 'event', 'lottery_end', t(fallbackEnd?.hoursBefore === 1 ? 'notification.fallback.lotteryEndSoon' : 'notification.fallback.lotteryEnd'), fallbackEnd?.scheduleAt ?? null, t),
    target(event, 'event', 'general_start', t('notification.fallback.generalStart'), event.timeline.generalStartDate ? `${event.timeline.generalStartDate}T08:00:00+09:00` : null, t),
    target(event, 'event', 'payment_deadline', t('notification.fallback.paymentDeadline'), event.timeline.paymentDeadlineDate ? `${event.timeline.paymentDeadlineDate}T20:00:00+09:00` : null, t),
  ].filter(Boolean) as ReminderTarget[];
  const concert = target(event, 'event', 'concert', t('notification.fallback.concert'), fromEventDate(event), t);
  const merged = [...(windowTargets.length > 0 ? windowTargets : fallbackTargets), ...(concert ? [concert] : [])];
  // 同一时刻同一类型只留一条（QA #9）：Lawson 等按票种给多窗口、eplus 多轮共享同一入金截止，
  // 会生成 N 条一模一样的「付款截止 08/03 23:59」开关，用户无从选择。保留先出现的（带轮次名）。
  const seen = new Set<string>();
  return merged.filter((targetInfo) => {
    const key = `${targetInfo.type}|${targetInfo.scheduleAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// 已过去的受付/开演时间没有提醒意义：原生端 schedule 一个过去时刻会「立刻弹」或被系统丢弃，
// 点了像没用。消费方（详情页）据此过滤，不给已结束的窗口显示提醒开关。
export function isPastReminder(targetInfo: ReminderTarget, now: Date = new Date()): boolean {
  const at = new Date(targetInfo.scheduleAt).getTime();
  return Number.isNaN(at) || at <= now.getTime();
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

// 取消本 App 排程的全部 pending 通知。以系统 getPending 为准（而非 activeAlerts）——
// 这样连「UI 已失联的孤儿通知」（聚合 id 漂移/竞态产生，见 #73/#74）也能被清掉。
// 「重置全部数据」必须先调它再清库，否则系统通知照弹且用户已无从关闭（#71）。
export async function cancelAllReminders(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const pending = await LocalNotifications.getPending();
  const ids = pending.notifications.map((n) => ({ id: n.id }));
  if (ids.length === 0) return;
  await LocalNotifications.cancel({ notifications: ids });
}

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from '../../src/i18n/core';
import type { ActivityEvent, ReminderTarget } from '../../src/types';

const h = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async (_opts: unknown) => {}),
  cancel: vi.fn(async (_opts: unknown) => {}),
  getPending: vi.fn(async () => ({ notifications: [] as Array<{ id: number }> })),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    requestPermissions: h.requestPermissions, schedule: h.schedule, cancel: h.cancel, getPending: h.getPending,
  },
}));

import {
  scheduleReminderTarget, cancelReminderTarget, cancelAllReminders, cancelOrphanReminders,
  buildReminderTargets, isPastReminder, makeReminderNotificationId, reminderIdsForEvents,
} from '../../src/notifications';
import { stableConcertKey } from '../../src/sources/aggregate';
import { makeEvent, makeWindow } from '../_fixtures';

const t = ((key: string) => key) as unknown as TFunction;
const target: ReminderTarget = {
  eventId: 'e1', eventTitle: 'T', platform: 'eplus', windowId: 'w1', type: 'general_start',
  label: 'L', scheduleAt: '2030-08-01T10:00:00+09:00', notificationId: 1001, title: 'Title', body: 'Body',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.isNativePlatform.mockReturnValue(true);
  h.requestPermissions.mockResolvedValue({ display: 'granted' });
  h.getPending.mockResolvedValue({ notifications: [] });
});

describe('notifications.scheduleReminderTarget', () => {
  it('非原生平台 → 抛错且不排程', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await expect(scheduleReminderTarget(target, t)).rejects.toThrow();
    expect(h.schedule).not.toHaveBeenCalled();
  });

  it('权限被拒 → 抛错且不排程', async () => {
    h.requestPermissions.mockResolvedValue({ display: 'denied' });
    await expect(scheduleReminderTarget(target, t)).rejects.toThrow();
    expect(h.schedule).not.toHaveBeenCalled();
  });

  it('权限通过 → 调 schedule（带正确 id/title）', async () => {
    await scheduleReminderTarget(target, t);
    expect(h.schedule).toHaveBeenCalledTimes(1);
    const arg = h.schedule.mock.calls[0][0] as { notifications: Array<{ id: number; title: string }> };
    expect(arg.notifications[0].id).toBe(1001);
    expect(arg.notifications[0].title).toBe('Title');
  });
});

// 申込締切提醒的时刻选择：常规提前 24h;不足 24h 时退化为提前 1h(临近締切恰是最需要提醒的
// 时段,旧逻辑固定 −24h → 已过就被 isPastReminder 过滤,开关整个消失);不足 1h/已过 → 不产出。
describe('notifications.buildReminderTargets — 締切临近兜底', () => {
  const applyEnd = '2030-08-10T23:59:00+09:00';
  const windowEvent = () => makeEvent({ ticketWindows: [makeWindow({ applyEnd })] });
  const findLotteryEnd = (targets: ReminderTarget[]) => targets.find((x) => x.type === 'lottery_end');

  it('距締切 >24h → 提前 24h(label 用 24h 文案)', () => {
    const now = new Date('2030-08-01T00:00:00+09:00');
    const found = findLotteryEnd(buildReminderTargets(windowEvent(), t, now));
    expect(found?.scheduleAt).toBe('2030-08-09T23:59:00+09:00');
    expect(found?.label).toBe('notification.window.lotteryEnd');
    expect(isPastReminder(found!, now)).toBe(false);
  });

  it('距締切 12h(−24h 已过)→ 退化为提前 1h(label 用 1h 文案)', () => {
    const now = new Date('2030-08-10T11:59:00+09:00');
    const found = findLotteryEnd(buildReminderTargets(windowEvent(), t, now));
    expect(found?.scheduleAt).toBe('2030-08-10T22:59:00+09:00');
    expect(found?.label).toBe('notification.window.lotteryEndSoon');
    expect(isPastReminder(found!, now)).toBe(false);
  });

  it('距締切 30min(−1h 也已过)→ 不产出 lottery_end', () => {
    const now = new Date('2030-08-10T23:29:00+09:00');
    expect(findLotteryEnd(buildReminderTargets(windowEvent(), t, now))).toBeUndefined();
  });

  it('締切已过 → 不产出 lottery_end', () => {
    const now = new Date('2030-08-11T00:00:00+09:00');
    expect(findLotteryEnd(buildReminderTargets(windowEvent(), t, now))).toBeUndefined();
  });

  it('fallback(无窗口,timeline 日期)同样享受 −24h→−1h 链', () => {
    const event = makeEvent({ timeline: { lotteryEndDate: '2030-08-10' } });
    const now = new Date('2030-08-10T11:59:00+09:00'); // 距 23:59 締切 12h
    const found = findLotteryEnd(buildReminderTargets(event, t, now));
    expect(found?.scheduleAt).toBe('2030-08-10T22:59:00+09:00');
  });
});

describe('notifications.cancelReminderTarget', () => {
  it('非原生 → 不调 cancel', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await cancelReminderTarget(1001);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('原生 → 调 cancel(id)', async () => {
    await cancelReminderTarget(1001);
    expect(h.cancel).toHaveBeenCalledWith({ notifications: [{ id: 1001 }] });
  });
});

describe('notifications.cancelAllReminders (#71)', () => {
  it('非原生 → 不查询也不取消', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await cancelAllReminders();
    expect(h.getPending).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('原生且有 pending → 按系统实际 pending id 全量取消（含 UI 已失联的孤儿）', async () => {
    h.getPending.mockResolvedValue({ notifications: [{ id: 11 }, { id: 22 }, { id: 33 }] });
    await cancelAllReminders();
    expect(h.cancel).toHaveBeenCalledWith({ notifications: [{ id: 11 }, { id: 22 }, { id: 33 }] });
  });

  it('原生但无 pending → 不调 cancel（避免空数组调用）', async () => {
    h.getPending.mockResolvedValue({ notifications: [] });
    await cancelAllReminders();
    expect(h.cancel).not.toHaveBeenCalled();
  });
});

// Lawson id 方案迁移（lawson-html-v2）遗留的孤儿清理：窗口 id 从硬编码 -0 变为 -<schduleNo>，
// notificationId 内嵌旧 windowId → 已排定的系统通知再也对不上任何开关（幽灵通知）。
describe('notifications.reminderIdsForEvents', () => {
  it('收齐当前事件能产出的全部提醒 id（窗口 + fallback）', () => {
    const event = makeEvent({ ticketWindows: [makeWindow({ id: 'w-1' })] });
    const ids = reminderIdsForEvents([event], t, new Date('2030-01-01T00:00:00+09:00'));

    for (const built of buildReminderTargets(event, t, new Date('2030-01-01T00:00:00+09:00'))) {
      expect(ids.has(built.notificationId)).toBe(true);
    }
    // 旧方案窗口 id 派生的提醒不在集合里 → 判定为孤儿
    expect(ids.has(makeReminderNotificationId(stableConcertKey(event), 'w-1-0', 'lottery_start'))).toBe(false);
  });

  it('无事件 → 空集合', () => {
    expect(reminderIdsForEvents([], t).size).toBe(0);
  });

  // 调用方是启动加载链（useOshiStore），持久化事件的结构无法预设：一条坏数据不能让整轮对账
  // 连同后续状态加载一起崩（d24ec3f 立下的不变量）。
  it('单条事件结构损坏 → 跳过它,其余事件的提醒 id 照收', () => {
    const broken = { ...makeEvent({ id: 'broken' }), ticketWindows: 'oops' } as unknown as ActivityEvent;
    const healthy = makeEvent({ id: 'ok-1', ticketWindows: [makeWindow({ id: 'w-ok' })] });
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const ids = reminderIdsForEvents([broken, healthy], t, new Date('2030-01-01T00:00:00+09:00'));

    expect(ids.has(makeReminderNotificationId(stableConcertKey(healthy), 'w-ok', 'lottery_start'))).toBe(true);
  });
});

describe('notifications.cancelOrphanReminders（id 方案迁移清理）', () => {
  it('非原生 → 不查询也不取消', async () => {
    h.isNativePlatform.mockReturnValue(false);
    await cancelOrphanReminders(new Set([11]));
    expect(h.getPending).not.toHaveBeenCalled();
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('只取消不在有效集里的 pending（有效提醒不误伤）', async () => {
    h.getPending.mockResolvedValue({ notifications: [{ id: 11 }, { id: 22 }, { id: 33 }] });

    const cancelled = await cancelOrphanReminders(new Set([22]));

    expect(h.cancel).toHaveBeenCalledWith({ notifications: [{ id: 11 }, { id: 33 }] });
    expect(cancelled).toEqual([11, 33]);
  });

  it('pending 全部有效 → 不调 cancel', async () => {
    h.getPending.mockResolvedValue({ notifications: [{ id: 11 }, { id: 22 }] });
    expect(await cancelOrphanReminders(new Set([11, 22]))).toEqual([]);
    expect(h.cancel).not.toHaveBeenCalled();
  });

  it('getPending 失败 → 吞掉异常（自愈是 best-effort，不该挡住启动）', async () => {
    h.getPending.mockRejectedValue(new Error('plugin unavailable'));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(cancelOrphanReminders(new Set([11]))).resolves.toEqual([]);
  });
});

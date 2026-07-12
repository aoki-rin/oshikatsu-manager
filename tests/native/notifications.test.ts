import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from '../../src/i18n/core';
import type { ReminderTarget } from '../../src/types';

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

import { scheduleReminderTarget, cancelReminderTarget, cancelAllReminders } from '../../src/notifications';

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

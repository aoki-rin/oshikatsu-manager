import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { TFunction } from '../../src/i18n/core';
import type { ReminderTarget } from '../../src/types';

const h = vi.hoisted(() => ({
  isNativePlatform: vi.fn(() => true),
  requestPermissions: vi.fn(async () => ({ display: 'granted' })),
  schedule: vi.fn(async (_opts: unknown) => {}),
  cancel: vi.fn(async (_opts: unknown) => {}),
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: h.isNativePlatform } }));
vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { requestPermissions: h.requestPermissions, schedule: h.schedule, cancel: h.cancel },
}));

import { scheduleReminderTarget, cancelReminderTarget } from '../../src/notifications';

const t = ((key: string) => key) as unknown as TFunction;
const target: ReminderTarget = {
  eventId: 'e1', eventTitle: 'T', platform: 'eplus', windowId: 'w1', type: 'general_start',
  label: 'L', scheduleAt: '2030-08-01T10:00:00+09:00', notificationId: 1001, title: 'Title', body: 'Body',
};

beforeEach(() => {
  vi.clearAllMocks();
  h.isNativePlatform.mockReturnValue(true);
  h.requestPermissions.mockResolvedValue({ display: 'granted' });
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

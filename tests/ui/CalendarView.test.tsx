// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

// 只 stub 会落地文件（走 native）的 ICS 下载；其余纯格式化函数保留真实现。
vi.mock('../../src/utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils')>();
  return {
    ...actual,
    downloadAllFollowedEventsIcs: vi.fn(async () => {}),
    downloadEventIcs: vi.fn(async () => {}),
  };
});

import { renderWithI18n, makeEvent, fireEvent, cleanup } from './_helpers';
import { favoriteKey } from '../../src/favorites';
import * as utils from '../../src/utils';
import type { ComponentProps } from 'react';
import { CalendarView } from '../../src/components/CalendarView';

afterEach(cleanup);

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    events: [] as ReturnType<typeof makeEvent>[],
    favorites: [] as string[],
    followedArtists: [] as string[],
    followedVenues: [] as string[],
    activeAlerts: [],
    onSelectEvent: vi.fn(),
    oshiColor: '#ec4899',
    ...overrides,
  };
}

describe('CalendarView', () => {
  it('无追踪事件时导出按钮点击不触发下载（空态守卫）', () => {
    const props = makeProps({ events: [makeEvent()], favorites: [] });
    const { container } = renderWithI18n(<CalendarView {...(props as unknown as ComponentProps<typeof CalendarView>)} />);

    fireEvent.click(container.querySelector('#btn-export-combined-ics') as HTMLButtonElement);
    expect(utils.downloadAllFollowedEventsIcs).not.toHaveBeenCalled();
  });

  it('收藏事件进入 trackedEvents，导出调用 downloadAllFollowedEventsIcs', () => {
    const ev = makeEvent({ id: 'eplus-1' });
    const props = makeProps({ events: [ev], favorites: [favoriteKey(ev)] });
    const { container } = renderWithI18n(<CalendarView {...(props as unknown as ComponentProps<typeof CalendarView>)} />);

    fireEvent.click(container.querySelector('#btn-export-combined-ics') as HTMLButtonElement);
    expect(utils.downloadAllFollowedEventsIcs).toHaveBeenCalledWith([ev], expect.anything());
  });

  it('关注艺人的事件也进入 trackedEvents（关注归集）', () => {
    const ev = makeEvent({ id: 'eplus-1', artistId: 'art-fz' });
    const props = makeProps({ events: [ev], followedArtists: ['art-fz'] });
    const { container } = renderWithI18n(<CalendarView {...(props as unknown as ComponentProps<typeof CalendarView>)} />);

    fireEvent.click(container.querySelector('#btn-export-combined-ics') as HTMLButtonElement);
    expect(utils.downloadAllFollowedEventsIcs).toHaveBeenCalledWith([ev], expect.anything());
  });
});

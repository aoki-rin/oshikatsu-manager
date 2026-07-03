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

import { renderWithI18n, makeEvent, makeWindow, fireEvent, cleanup } from './_helpers';
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

  it('截止雷达：14 天内的受付締切成行显示，点击进详情（QA ISSUE-005）', () => {
    // 组件用真实当前时间 → 动态造一个 3 天后的受付締切
    const applyEnd = new Date(Date.now() + 3 * 86400000).toISOString();
    const ev = makeEvent({
      id: 'eplus-1',
      ticketWindows: [makeWindow({ id: 'w-1', roundType: '★一般発売', applyStart: null, applyEnd })],
    });
    const props = makeProps({ events: [ev], favorites: [favoriteKey(ev)] });
    const { container } = renderWithI18n(<CalendarView {...(props as unknown as ComponentProps<typeof CalendarView>)} />);

    const row = container.querySelector('#radar-eplus-1-apply_end') as HTMLButtonElement;
    expect(row).not.toBeNull();
    fireEvent.click(row);
    expect(props.onSelectEvent).toHaveBeenCalledWith(ev);
  });

  it('截止雷达：没有窗口内截止时整卡不渲染', () => {
    const ev = makeEvent({ id: 'eplus-1', ticketWindows: [], timeline: {} });
    const props = makeProps({ events: [ev], favorites: [favoriteKey(ev)] });
    const { container } = renderWithI18n(<CalendarView {...(props as unknown as ComponentProps<typeof CalendarView>)} />);

    expect(container.querySelector('#deadline-radar')).toBeNull();
  });
});

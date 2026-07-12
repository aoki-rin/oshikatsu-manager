// @vitest-environment jsdom
// iOS 能力裁剪的 UI 呈现：日历导出按钮与 Lawson 插件行在 iOS 上整体不渲染。
// 通过 mock src/platform 模拟 iOS（jsdom 里 Capacitor.getPlatform() 恒为 'web'）。
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/platform', () => ({
  supportsCalendarExport: () => false,
  supportsLawsonSource: () => false,
}));
vi.mock('../../src/sources', () => ({
  enrichEventWindows: vi.fn(async (e: unknown) => e),
}));
vi.mock('../../src/native', () => ({
  openPurchaseUrl: vi.fn(async () => {}),
  deliverIcs: vi.fn(async () => {}),
}));

import { renderWithI18n, makeEvent, fireEvent, cleanup } from './_helpers';
import type { ComponentProps } from 'react';
import { CalendarView } from '../../src/components/CalendarView';
import { ExtensionView } from '../../src/components/ExtensionView';
import { EventDetailModal } from '../../src/components/EventDetailModal';
import { INITIAL_EXTENSIONS } from '../../src/data/mockData';

afterEach(cleanup);

describe('iOS 裁剪：日历导出', () => {
  it('CalendarView 不渲染「导出全部」按钮', () => {
    const props = {
      events: [makeEvent()],
      favorites: [],
      followedArtists: [],
      followedVenues: [],
      activeAlerts: [],
      onSelectEvent: vi.fn(),
      oshiColor: '#ec4899',
    };
    const { container } = renderWithI18n(<CalendarView {...(props as unknown as ComponentProps<typeof CalendarView>)} />);
    expect(container.querySelector('#btn-export-combined-ics')).toBeNull();
  });

  it('EventDetailModal 时间线不渲染「导出.ics」按钮', () => {
    const event = makeEvent({
      timeline: {
        lotteryStartDate: '2026-08-01',
        lotteryEndDate: '2026-08-10',
        paymentDeadlineDate: '2026-08-15',
        generalStartDate: '2026-08-20',
      },
    });
    const props = {
      event,
      artists: [],
      venues: [],
      onClose: vi.fn(),
      isFavorited: false,
      onToggleFavorite: vi.fn(),
      isArtistFollowed: false,
      onToggleFollowArtist: vi.fn(),
      isVenueFollowed: false,
      onToggleFollowVenue: vi.fn(),
      activeAlerts: [],
      onToggleAlert: vi.fn(),
      onEnrichEvent: vi.fn(),
      oshiColor: '#ec4899',
    };
    const { container, queryAllByText, getByText } = renderWithI18n(
      <EventDetailModal {...(props as unknown as ComponentProps<typeof EventDetailModal>)} />,
    );
    // 切到时间线 tab（导出按钮只在该 tab 渲染），并确认时间线内容确实出现了——
    // 否则「查不到按钮」可能只是 tab 没切成功的空断言。
    fireEvent.click(container.querySelector('#btn-tab-timeline') as HTMLButtonElement);
    getByText('2026-08-10', { exact: false });
    expect(queryAllByText('导出.ics')).toHaveLength(0);
  });
});

describe('iOS 裁剪：Lawson 插件', () => {
  it('ExtensionView 不展示 Lawson 行，其余源保留', () => {
    const props = {
      extensions: INITIAL_EXTENSIONS.map(ext => ({ ...ext, isInstalled: true })),
      onToggleExtension: vi.fn(),
      sourceStats: {},
      oshiColor: '#ec4899',
    };
    const { container } = renderWithI18n(<ExtensionView {...(props as unknown as ComponentProps<typeof ExtensionView>)} />);
    expect(container.textContent).not.toContain('Lawson');
    expect(container.textContent).toContain('eplus');
  });
});

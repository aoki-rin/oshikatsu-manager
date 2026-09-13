// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

// 详情页打开时会 lazy-enrich（enrichEventWindows → Capacitor）+ 跳转购票（openPurchaseUrl）。
// mock 这两个副作用边界；buildReminderTargets/isPastReminder/aggregate/shared 跑真实现。
vi.mock('../../src/sources', () => ({
  enrichEventWindows: vi.fn(async (e: unknown) => e),
}));
vi.mock('../../src/native', () => ({
  openPurchaseUrl: vi.fn(async () => {}),
  deliverIcs: vi.fn(async () => {}),
}));

import { renderWithI18n, makeEvent, makeWindow, fireEvent, cleanup } from './_helpers';
import * as native from '../../src/native';
import type { ComponentProps } from 'react';
import { EventDetailModal } from '../../src/components/EventDetailModal';

afterEach(cleanup);

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    event: makeEvent(),
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
    ...overrides,
  };
}

describe('EventDetailModal', () => {
  it('收藏按钮回调传入该事件', () => {
    const event = makeEvent({ id: 'eplus-1' });
    const props = makeProps({ event });
    const { container } = renderWithI18n(<EventDetailModal {...(props as unknown as ComponentProps<typeof EventDetailModal>)} />);

    fireEvent.click(container.querySelector('#btn-fav-modal-eplus-1') as HTMLButtonElement);
    expect(props.onToggleFavorite).toHaveBeenCalledWith(event);
  });

  it('关闭按钮触发 onClose', () => {
    const props = makeProps();
    const { container } = renderWithI18n(<EventDetailModal {...(props as unknown as ComponentProps<typeof EventDetailModal>)} />);

    fireEvent.click(container.querySelector('#btn-close-bottom-sheet') as HTMLButtonElement);
    expect(props.onClose).toHaveBeenCalled();
  });

  it('提醒 tab：未来窗口生成提醒项，点击回调 onToggleAlert', () => {
    const props = makeProps({ event: makeEvent({ ticketWindows: [makeWindow()] }) });
    const { container } = renderWithI18n(<EventDetailModal {...(props as unknown as ComponentProps<typeof EventDetailModal>)} />);

    fireEvent.click(container.querySelector('#btn-tab-reminders') as HTMLButtonElement);
    const opts = container.querySelectorAll('[id^="opt-"]');
    expect(opts.length).toBeGreaterThan(0);

    fireEvent.click(opts[0] as HTMLElement);
    expect(props.onToggleAlert).toHaveBeenCalledTimes(1);
  });

  it('提醒 tab：全过期事件不渲染任何提醒项（#35 isPastReminder）', () => {
    const props = makeProps({ event: makeEvent({ date: '2020-01-01', ticketWindows: undefined }) });
    const { container } = renderWithI18n(<EventDetailModal {...(props as unknown as ComponentProps<typeof EventDetailModal>)} />);

    fireEvent.click(container.querySelector('#btn-tab-reminders') as HTMLButtonElement);
    expect(container.querySelectorAll('[id^="opt-"]').length).toBe(0);
  });

  it('底部购票按钮触发 openPurchaseUrl', () => {
    const props = makeProps({ event: makeEvent({ id: 'eplus-1' }) });
    const { container } = renderWithI18n(<EventDetailModal {...(props as unknown as ComponentProps<typeof EventDetailModal>)} />);

    fireEvent.click(container.querySelector('#btn-visit-source-eplus-1') as HTMLButtonElement);
    expect(native.openPurchaseUrl).toHaveBeenCalledTimes(1);
  });
});

import { waitFor } from '@testing-library/react';
import * as sources from '../../src/sources';
it('shows a Pia busy warning and user-triggered retry clears it after success', async () => {
  const event=makeEvent({platform:'Ticket Pia',ticketWindows:[makeWindow({platform:'Ticket Pia',applyStart:null})]});
  vi.mocked(sources.enrichEventWindows).mockResolvedValueOnce({...event,detailWarning:'pia-busy'}).mockResolvedValueOnce({...event,detailWarning:undefined});
  const screen=renderWithI18n(<EventDetailModal {...makeProps({event})} />);
  await waitFor(()=>expect(screen.getByTestId('detail-fetch-warning')).toBeInTheDocument());
  expect(screen.getByTestId('detail-fetch-warning').textContent).toContain('Pia 官网繁忙');
  fireEvent.click(screen.getByText('重试获取详情'));
  await waitFor(()=>expect(screen.queryByTestId('detail-fetch-warning')).not.toBeInTheDocument());
});

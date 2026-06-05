// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/native', () => ({
  openPurchaseUrl: vi.fn(async () => {}),
  deliverIcs: vi.fn(async () => {}),
}));

import { renderWithI18n, makeEvent, fireEvent, cleanup } from './_helpers';
import { favoriteKey } from '../../src/favorites';
import type { ExtensionSource } from '../../src/types';
import type { ComponentProps } from 'react';
import { DiscoverView } from '../../src/components/DiscoverView';

afterEach(cleanup);

// DiscoverView 只展示「已启用且已安装」插件对应平台的事件，所以测试需要一个 active 的 eplus 源。
const eplusExt: ExtensionSource = {
  id: 'ext-eplus', name: 'eplus', platform: 'eplus', version: '1.0', author: 'test',
  isEnabled: true, isInstalled: true, rating: 5, iconType: 'eplus', description: '',
};

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    events: [],
    searchResults: [],
    searchReports: [],
    recentSearches: [],
    searching: false,
    extensions: [eplusExt],
    artists: [],
    venues: [],
    onSelectEvent: vi.fn(),
    favorites: [] as string[],
    onToggleFavorite: vi.fn(),
    onRunPlatformSearch: vi.fn().mockResolvedValue({ events: [], reports: [] }),
    onClearSearchResults: vi.fn(),
    oshiColor: '#ec4899',
    ...overrides,
  };
}

describe('DiscoverView', () => {
  it('输入关键词点搜索 → onRunPlatformSearch(query, platforms)', () => {
    const props = makeProps();
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    fireEvent.change(container.querySelector('#search-input-field') as HTMLInputElement, {
      target: { value: 'FRUITS ZIPPER' },
    });
    fireEvent.click(container.querySelector('#btn-platform-search') as HTMLButtonElement);

    expect(props.onRunPlatformSearch).toHaveBeenCalledWith('FRUITS ZIPPER', expect.any(Array));
  });

  it('无实时结果时回退展示已收藏事件，点击卡片回调 onSelectEvent', () => {
    const ev = makeEvent({ id: 'eplus-1' });
    const props = makeProps({ events: [ev], favorites: [favoriteKey(ev)] });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    const card = container.querySelector('#event-card-eplus-1') as HTMLElement;
    expect(card).not.toBeNull();
    fireEvent.click(card.querySelector('.cursor-pointer') as HTMLElement);
    expect(props.onSelectEvent).toHaveBeenCalledWith(ev);
  });

  it('卡片收藏按钮回调 onToggleFavorite', () => {
    const ev = makeEvent({ id: 'eplus-1' });
    const props = makeProps({ events: [ev], favorites: [favoriteKey(ev)] });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    fireEvent.click(container.querySelector('#btn-fav-card-eplus-1') as HTMLButtonElement);
    expect(props.onToggleFavorite).toHaveBeenCalledWith(ev);
  });

  it('无结果且无收藏 → 不渲染任何事件卡', () => {
    const ev = makeEvent({ id: 'eplus-1' });
    const props = makeProps({ events: [ev], favorites: [] });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    expect(container.querySelector('[id^="event-card-"]')).toBeNull();
  });

  it('有实时结果时优先展示结果卡', () => {
    const result = makeEvent({ id: 'pia-9', title: 'SEARCH HIT' });
    const props = makeProps({ searchResults: [result] });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    expect(container.querySelector('#event-card-pia-9')).not.toBeNull();
  });
});

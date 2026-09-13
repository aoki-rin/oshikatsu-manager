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
    searchDegraded: false,
    searchFetchedAt: null,
    searchIsLive: false,
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
    fireEvent.click(container.querySelector('#btn-open-detail-eplus-1') as HTMLElement);
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
    const props = makeProps({ searchResults: [result], searchIsLive: true });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    expect(container.querySelector('#event-card-pia-9')).not.toBeNull();
    expect(container.querySelector('#results-heading')?.textContent).toContain('实时搜索结果');
  });

  it('装载的持久化结果标「上次搜索结果 + 时间」（QA #6）', () => {
    const result = makeEvent({ id: 'pia-9' });
    const props = makeProps({ searchResults: [result], searchIsLive: false, searchFetchedAt: '2026-07-03T12:00:00.000Z' });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    expect(container.querySelector('#results-heading')?.textContent).toContain('上次搜索结果');
    expect(container.querySelector('#results-heading')?.textContent).toContain('07/03');
  });

  it('旧数据无抓取时间 → 标题不悬空分隔符', () => {
    const result = makeEvent({ id: 'pia-9' });
    const props = makeProps({ searchResults: [result], searchIsLive: false, searchFetchedAt: null });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);
    const text = container.querySelector('#results-heading')?.textContent ?? '';
    expect(text).toContain('上次搜索结果');
    expect(text).not.toContain('· ）');
  });

  it('搜索进行中显示搜索占位而非「未找到」（QA #4）', () => {
    const props = makeProps({ searching: true });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    expect(container.querySelector('#searching-placeholder')).not.toBeNull();
  });

  it('无搜索历史时显示冷启动示例词，点击填入搜索框（分发化）', () => {
    const props = makeProps({ recentSearches: [] });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    const chips = container.querySelector('#search-term-chips');
    expect(chips?.textContent).toContain('FRUITS ZIPPER');
    fireEvent.click([...chips!.querySelectorAll('button')].find(b => b.textContent === 'YOASOBI')!);
    expect((container.querySelector('#search-input-field') as HTMLInputElement).value).toBe('YOASOBI');
  });

  it('有搜索历史时示例词让位于历史', () => {
    const props = makeProps({ recentSearches: ['乃木坂46'] });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);
    const chips = container.querySelector('#search-term-chips');
    expect(chips?.textContent).toContain('乃木坂46');
    expect(chips?.textContent).not.toContain('YOASOBI');
  });

  it('已截止的排在还能报名的后面（QA #7）', () => {
    const open = makeEvent({ id: 'eplus-open', ticketWindows: [{ id: 'w1', platform: 'eplus', roundType: '一般', applyStart: null, applyEnd: '2030-08-01T18:00:00+09:00' }] });
    const closed = makeEvent({ id: 'eplus-closed', ticketWindows: [{ id: 'w2', platform: 'eplus', roundType: '先行', applyStart: null, applyEnd: '2020-01-01T18:00:00+09:00' }] });
    const props = makeProps({ searchResults: [closed, open], searchIsLive: true });
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);

    const ids = [...container.querySelectorAll('[id^=event-card-]')].map((c) => c.id);
    expect(ids).toEqual(['event-card-eplus-open', 'event-card-eplus-closed']);
  });
});

it('keeps a merged card visible when its primary source is disabled but another member is enabled', () => {
  const event=makeEvent({platform:'Ticket Pia',ticketWindows:[{id:'eplus-w',platform:'eplus',roundType:'受付',applyStart:null,applyEnd:null}]});
  const props=makeProps({searchResults:[event],extensions:[eplusExt]});
  const {container}=renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);
  expect(container.querySelector('[id^="event-card-"]')).toBeTruthy();
});

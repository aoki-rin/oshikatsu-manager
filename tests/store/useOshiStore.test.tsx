// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import type { ActivityEvent, ReminderTarget } from '../../src/types';
import { LOCALE_STORAGE_KEY, type TFunction } from '../../src/i18n/core';
import { favoriteKey } from '../../src/favorites';
import { INITIAL_EXTENSIONS } from '../../src/data/mockData';

// 只 mock 外部副作用边界：搜索（网络）与提醒（Capacitor）。
// aggregate / dedupe / favorites / mockData / i18n 都是纯逻辑，跑真实现以验证编排。
vi.mock('../../src/sources', () => ({
  searchableTargets: vi.fn(() => [] as string[]),
  searchPlatformsStreaming: vi.fn(async () => {}),
}));
vi.mock('../../src/notifications', () => ({
  scheduleReminderTarget: vi.fn(async () => {}),
  cancelReminderTarget: vi.fn(async () => {}),
}));

import * as sources from '../../src/sources';
import * as notifications from '../../src/notifications';
import { useOshiStore } from '../../src/store/useOshiStore';

const t = ((key: string) => key) as unknown as TFunction;

function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'eplus-1',
    title: 'FRUITS ZIPPER LIVE',
    artistId: 'art-fz',
    artistName: 'FRUITS ZIPPER',
    venueId: 'ven-gt',
    venueName: '東京ガーデンシアター',
    date: '2026-08-10',
    time: '18:00',
    region: '東京都',
    platform: 'eplus',
    price: '¥8,000',
    imageUrl: 'https://example.test/img.jpg',
    timeline: {},
    originalUrl: 'https://example.test/e/1',
    description: '',
    category: 'J-Pop',
    tags: [],
    sourceKind: 'live',
    ...overrides,
  };
}

function makeTarget(overrides: Partial<ReminderTarget> = {}): ReminderTarget {
  return {
    eventId: 'eplus-1',
    eventTitle: 'FRUITS ZIPPER LIVE',
    platform: 'eplus',
    windowId: 'w-1',
    type: 'general_start',
    label: '一般発売',
    scheduleAt: '2026-08-01T10:00:00+09:00',
    notificationId: 1001,
    title: 'リマインド',
    body: '受付開始',
    ...overrides,
  };
}

const render = () => renderHook(() => useOshiStore(t));

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
});

describe('useOshiStore — 持久化加载', () => {
  it('空 localStorage → 安全默认值', () => {
    const { result } = render();
    expect(result.current.oshiColorId).toBe('pink');
    expect(result.current.events).toEqual([]);
    expect(result.current.favorites).toEqual([]);
    expect(result.current.followedArtists).toEqual([]);
    expect(result.current.extensions).toHaveLength(INITIAL_EXTENSIONS.length);
  });

  it('重载 events：过滤非 live、默认 sourceKind、单平台事件保留原 id', () => {
    const live = makeEvent({ id: 'eplus-1' });
    const manual = makeEvent({ id: 'manual-1', sourceKind: undefined });
    localStorage.setItem('oshikatsu_events', JSON.stringify([manual, live]));

    const { result } = render();

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].id).toBe('eplus-1');
    expect(result.current.events[0].sourceKind).toBe('live');
  });

  it('重载 follows / lastViewed / sourceStats / alerts / recentSearches', () => {
    localStorage.setItem('oshikatsu_followed_artists', JSON.stringify(['art-fz']));
    localStorage.setItem('oshikatsu_followed_venues', JSON.stringify(['ven-gt']));
    localStorage.setItem('oshikatsu_last_viewed', JSON.stringify({ 'art-fz': '2026-06-01T00:00:00Z' }));
    localStorage.setItem('oshikatsu_source_stats', JSON.stringify({ eplus: { lastFetchedAt: 'x', count: 3, status: 'ok' } }));
    localStorage.setItem('oshikatsu_recent_searches', JSON.stringify(['FRUITS ZIPPER']));

    const { result } = render();

    expect(result.current.followedArtists).toEqual(['art-fz']);
    expect(result.current.followedVenues).toEqual(['ven-gt']);
    expect(result.current.lastViewed['art-fz']).toBe('2026-06-01T00:00:00Z');
    expect(result.current.sourceStats.eplus.count).toBe(3);
    expect(result.current.recentSearches).toEqual(['FRUITS ZIPPER']);
  });

  it('重载 searchResultIds 时剔除已不存在的事件 id', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ id: 'eplus-1' })]));
    localStorage.setItem('oshikatsu_search_result_ids', JSON.stringify(['eplus-1', 'ghost-2']));

    const { result } = render();

    expect(result.current.searchResultIds).toEqual(['eplus-1']);
  });
});

describe('useOshiStore — 收藏稳定键（#36 回归）', () => {
  it('收藏用 favoriteKey 存（非 event.id）并持久化', () => {
    const ev = makeEvent({ id: 'lawson-1', platform: 'Lawson Ticket' });
    const { result } = render();

    act(() => result.current.handleToggleFavorite(ev));

    const key = favoriteKey(ev);
    expect(key.startsWith('fav:')).toBe(true);
    expect(result.current.favorites).toEqual([key]);
    expect(JSON.parse(localStorage.getItem('oshikatsu_favorites')!)).toEqual([key]);
  });

  it('再次 toggle 取消收藏（清掉 key 与旧 id）', () => {
    const ev = makeEvent({ id: 'lawson-1' });
    const { result } = render();

    act(() => result.current.handleToggleFavorite(ev));
    act(() => result.current.handleToggleFavorite(ev));

    expect(result.current.favorites).toEqual([]);
    expect(JSON.parse(localStorage.getItem('oshikatsu_favorites')!)).toEqual([]);
  });

  it('单平台收藏在重载（被聚合迁移）后仍命中', () => {
    const ev = makeEvent({ id: 'lawson-1', platform: 'Lawson Ticket' });
    localStorage.setItem('oshikatsu_events', JSON.stringify([ev]));
    localStorage.setItem('oshikatsu_favorites', JSON.stringify([favoriteKey(ev)]));

    const { result } = render();

    expect(result.current.favorites).toContain(favoriteKey(ev));
  });
});

describe('useOshiStore — 关注 + 取关剪枝（#32 回归）', () => {
  it('关注 artist：写入 followedArtists 并从 events 派生最小记录持久化', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ artistId: 'art-fz', artistName: 'FRUITS ZIPPER' })]));
    const { result } = render();

    act(() => result.current.handleToggleFollowArtist('art-fz'));

    expect(result.current.followedArtists).toEqual(['art-fz']);
    expect(result.current.artists.find(a => a.id === 'art-fz')?.name).toBe('FRUITS ZIPPER');
    expect(JSON.parse(localStorage.getItem('oshikatsu_followed_artists')!)).toEqual(['art-fz']);
    expect(JSON.parse(localStorage.getItem('oshikatsu_artists')!)).toHaveLength(1);
  });

  it('取关 artist：剪枝 followedArtists 与 artists 记录', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ artistId: 'art-fz' })]));
    const { result } = render();

    act(() => result.current.handleToggleFollowArtist('art-fz'));
    act(() => result.current.handleToggleFollowArtist('art-fz'));

    expect(result.current.followedArtists).toEqual([]);
    expect(result.current.artists.find(a => a.id === 'art-fz')).toBeUndefined();
    expect(JSON.parse(localStorage.getItem('oshikatsu_artists')!)).toEqual([]);
  });

  it('关注 / 取关 venue 同样剪枝', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ venueId: 'ven-gt', venueName: '東京ガーデンシアター' })]));
    const { result } = render();

    act(() => result.current.handleToggleFollowVenue('ven-gt'));
    expect(result.current.followedVenues).toEqual(['ven-gt']);
    expect(result.current.venues.find(v => v.id === 'ven-gt')?.name).toBe('東京ガーデンシアター');

    act(() => result.current.handleToggleFollowVenue('ven-gt'));
    expect(result.current.followedVenues).toEqual([]);
    expect(result.current.venues.find(v => v.id === 'ven-gt')).toBeUndefined();
  });
});

describe('useOshiStore — 搜索编排', () => {
  it('流式结果 → searchResultIds / events 合并持久化 / sourceStats / reports / recentSearches', async () => {
    vi.mocked(sources.searchableTargets).mockReturnValue(['eplus']);
    vi.mocked(sources.searchPlatformsStreaming).mockImplementation(async (_q, _p, onSource) => {
      onSource(
        { platform: 'eplus', status: 'ok', count: 1, handoffUrl: 'h', runtime: 'client' },
        [makeEvent({ id: 'eplus-1' })],
      );
    });

    const { result } = render();
    await act(async () => {
      await result.current.handleRunPlatformSearch('FRUITS ZIPPER', ['eplus']);
    });

    expect(result.current.searchResultIds).toEqual(['eplus-1']);
    expect(result.current.events.some(e => e.id === 'eplus-1')).toBe(true);
    expect(result.current.sourceStats.eplus).toMatchObject({ count: 1, status: 'ok' });
    expect(result.current.recentSearches).toEqual(['FRUITS ZIPPER']);
    expect(result.current.isSearching).toBe(false);
    // 持久化
    expect(JSON.parse(localStorage.getItem('oshikatsu_search_result_ids')!)).toEqual(['eplus-1']);
    expect(JSON.parse(localStorage.getItem('oshikatsu_events')!).some((e: ActivityEvent) => e.id === 'eplus-1')).toBe(true);
    expect(JSON.parse(localStorage.getItem('oshikatsu_source_stats')!).eplus.status).toBe('ok');
  });

  it('空 query 直接返回且不触发搜索', async () => {
    const { result } = render();
    let ret;
    await act(async () => {
      ret = await result.current.handleRunPlatformSearch('   ', ['eplus']);
    });
    expect(ret).toEqual({ events: [], reports: [] });
    expect(sources.searchPlatformsStreaming).not.toHaveBeenCalled();
  });
});

describe('useOshiStore — enrich 回写', () => {
  it('handleEnrichEvent 按 id 替换并持久化', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ id: 'eplus-1', time: '18:00' })]));
    const { result } = render();

    act(() => result.current.handleEnrichEvent(makeEvent({ id: 'eplus-1', time: '19:30' })));

    expect(result.current.events.find(e => e.id === 'eplus-1')?.time).toBe('19:30');
    expect(JSON.parse(localStorage.getItem('oshikatsu_events')!)[0].time).toBe('19:30');
  });
});

describe('useOshiStore — 提醒开关', () => {
  it('成功排程 → 新增 alert 并持久化', async () => {
    vi.mocked(notifications.scheduleReminderTarget).mockResolvedValue(undefined);
    const { result } = render();
    const target = makeTarget({ notificationId: 1001 });

    await act(async () => {
      await result.current.handleToggleAlert(target);
    });

    expect(notifications.scheduleReminderTarget).toHaveBeenCalledOnce();
    expect(result.current.activeAlerts).toHaveLength(1);
    expect(result.current.activeAlerts[0].notificationId).toBe(1001);
    expect(JSON.parse(localStorage.getItem('oshikatsu_alerts')!)).toHaveLength(1);
  });

  it('排程失败（权限拒绝）→ 不新增 alert', async () => {
    vi.mocked(notifications.scheduleReminderTarget).mockRejectedValue(new Error('denied'));
    const { result } = render();

    await act(async () => {
      await result.current.handleToggleAlert(makeTarget());
    });

    expect(result.current.activeAlerts).toEqual([]);
    expect(localStorage.getItem('oshikatsu_alerts')).toBeNull();
  });

  it('关闭已存在的提醒 → 调 cancel 并移除', async () => {
    vi.mocked(notifications.scheduleReminderTarget).mockResolvedValue(undefined);
    const { result } = render();
    const target = makeTarget({ notificationId: 2002 });

    await act(async () => {
      await result.current.handleToggleAlert(target);
    });
    await act(async () => {
      await result.current.handleToggleAlert(target);
    });

    expect(notifications.cancelReminderTarget).toHaveBeenCalledWith(2002);
    expect(result.current.activeAlerts).toEqual([]);
  });
});

describe('useOshiStore — 扩展开关', () => {
  it('handleToggleExtension 翻转 isEnabled 并持久化', () => {
    const { result } = render();
    const target = result.current.extensions.find(e => e.id === 'ext-eplus')!;
    const before = target.isEnabled;

    act(() => result.current.handleToggleExtension('ext-eplus'));

    const after = result.current.extensions.find(e => e.id === 'ext-eplus')!;
    expect(after.isEnabled).toBe(!before);
    const persisted = JSON.parse(localStorage.getItem('oshikatsu_extensions')!);
    expect(persisted.find((e: { id: string; isEnabled: boolean }) => e.id === 'ext-eplus').isEnabled).toBe(!before);
  });
});

describe('useOshiStore — 主题 / 重置 / 查看 / 清空 / 扩展合并', () => {
  it('handleSelectOshiColor 切换主题色并持久化', () => {
    const { result } = render();
    act(() => result.current.handleSelectOshiColor('blue'));
    expect(result.current.oshiColorId).toBe('blue');
    expect(localStorage.getItem('oshikatsu_color_id')).toBe('blue');
  });

  it('markViewed 记录查看时间戳并持久化', () => {
    const { result } = render();
    act(() => result.current.markViewed('art-fz'));
    expect(typeof result.current.lastViewed['art-fz']).toBe('string');
    expect(JSON.parse(localStorage.getItem('oshikatsu_last_viewed')!)['art-fz']).toBeTruthy();
  });

  it('clearSearchResults 清空结果与报告并持久化空数组', () => {
    const { result } = render();
    act(() => result.current.clearSearchResults());
    expect(result.current.searchResultIds).toEqual([]);
    expect(result.current.searchReports).toEqual([]);
    expect(JSON.parse(localStorage.getItem('oshikatsu_search_result_ids')!)).toEqual([]);
  });

  it('handleResetDatabase 清库但保留语言设置', () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ja');
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent()]));
    const { result } = render();
    expect(result.current.events).toHaveLength(1);

    act(() => result.current.handleResetDatabase());

    expect(result.current.events).toEqual([]);
    expect(result.current.favorites).toEqual([]);
    expect(result.current.oshiColorId).toBe('pink');
    expect(localStorage.getItem('oshikatsu_events')).toBeNull();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja');
  });

  it('重载扩展：存储覆盖默认 + 强制安装/启用 Lawson', () => {
    localStorage.setItem('oshikatsu_extensions', JSON.stringify([
      { id: 'ext-eplus', isEnabled: false },
      { id: 'ext-lawson', isEnabled: false, isInstalled: false },
    ]));
    const { result } = render();

    expect(result.current.extensions.find(e => e.id === 'ext-eplus')?.isEnabled).toBe(false);
    const lawson = result.current.extensions.find(e => e.id === 'ext-lawson')!;
    expect(lawson.isInstalled).toBe(true);
    expect(lawson.isEnabled).toBe(true);
  });
});

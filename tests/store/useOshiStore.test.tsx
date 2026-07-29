// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';

import type { ActivityEvent, NotificationAlert, ReminderTarget } from '../../src/types';
import { LOCALE_STORAGE_KEY, type TFunction } from '../../src/i18n/core';
import { favoriteKey } from '../../src/favorites';
import { stableConcertKey } from '../../src/sources/aggregate';
import { INITIAL_EXTENSIONS } from '../../src/data/mockData';

// 只 mock 外部副作用边界：搜索（网络）与提醒（Capacitor）。
// aggregate / dedupe / favorites / mockData / i18n 都是纯逻辑，跑真实现以验证编排。
vi.mock('../../src/sources', () => ({
  searchableTargets: vi.fn(() => [] as string[]),
  searchPlatformsStreaming: vi.fn(async () => {}),
}));
// 提醒模块只换掉带原生副作用的函数；id 派生（makeReminderNotificationId /
// reminderIdsForWindow）是纯逻辑，跑真实现——否则迁移测试只是在测 mock。
vi.mock('../../src/notifications', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/notifications')>()),
  scheduleReminderTarget: vi.fn(async () => {}),
  cancelReminderTarget: vi.fn(async () => {}),
  cancelAllReminders: vi.fn(async () => {}),
  cancelReminderIds: vi.fn(async () => [] as number[]),
}));
vi.mock('../../src/sources/proxy', () => ({
  isProxyConfigured: vi.fn(() => false),
}));

import * as sources from '../../src/sources';
import * as proxy from '../../src/sources/proxy';
import * as notifications from '../../src/notifications';
import { makeReminderNotificationId } from '../../src/notifications';
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

describe('useOshiStore — 持久化坏数据自愈（深度 review）', () => {
  it('单个 key 损坏 → 该项回兜底且被清除,其余 key 照常加载', () => {
    localStorage.setItem('oshikatsu_followed_artists', '{broken json!!');
    localStorage.setItem('oshikatsu_recent_searches', JSON.stringify(['FRUITS ZIPPER']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = render();

    expect(result.current.followedArtists).toEqual([]); // 坏 key 兜底
    expect(localStorage.getItem('oshikatsu_followed_artists')).toBeNull(); // 坏数据被清
    expect(result.current.recentSearches).toEqual(['FRUITS ZIPPER']); // 后续 key 不受影响
  });

  it('持久化事件缺 timeline 字段 → 加载时补全为 {}(渲染面十余处裸访问 e.timeline.x)', () => {
    const legacy = makeEvent({ id: 'eplus-legacy' }) as Partial<ActivityEvent>;
    delete legacy.timeline;
    localStorage.setItem('oshikatsu_events', JSON.stringify([legacy]));

    const { result } = render();

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0].timeline).toEqual({});
  });
});

// lawson-html-v2（64abc9a）把 Lawson 事件 id 从「整组一个」lawson-<mid> 改成逐场
// lawson-<Lコード>-<prfDate>。旧记录没人清：加载只按 'lawson-' 前缀过滤（新旧通吃）、搜索按 id
// 增量合并（旧 id ≠ 新 id，两者并存）→ ①列表多出一张「整组坍缩」的重复卡，详情链常指向被误抓的
// 页脚新闻页；②旧事件把旧 windowId 一直续命成合法 id，启动提醒对账因此认为对应提醒仍有效。
//
// 判据只认 id 形状 /^lawson-\d+$/（单段纯数字）：新方案的 id 恒为
// `lawson-${base}-${prfDate || `p${i}`}`，两段起步，形状上不可能命中（见下方回退用例）。
// 但**必须一次性**：parseLawsonSearch 的旧结构回退路径至今仍在产 lawson-<纯数字>
// （lawsonParser.ts:276，parser-fixtures.test.ts 有断言）。无标记地每次启动都剪，
// 会把新版刚搜到的合法结果在下次启动时删掉 → 搜到又消失的死循环。
describe('useOshiStore — Lawson 旧格式事件一次性剪枝（lawson-html-v2 迁移）', () => {
  it('旧格式 lawson-<纯数字> 事件被剪掉,并从持久化中抹除', () => {
    const stale = makeEvent({ id: 'lawson-444647', platform: 'Lawson Ticket', artistName: 'A', date: '2026-08-01' });
    localStorage.setItem('oshikatsu_events', JSON.stringify([stale]));

    const { result } = render();

    expect(result.current.events.map(e => e.id)).not.toContain('lawson-444647');
    const persisted = JSON.parse(localStorage.getItem('oshikatsu_events')!) as ActivityEvent[];
    expect(persisted.map(e => e.id)).not.toContain('lawson-444647');
  });

  it('新格式逐场 id 与其他平台事件不受影响', () => {
    const fresh = makeEvent({ id: 'lawson-444647-20260815', platform: 'Lawson Ticket', artistName: 'B', date: '2026-08-15' });
    const eplus = makeEvent({ id: 'eplus-1', artistName: 'C', date: '2026-08-20' });
    localStorage.setItem('oshikatsu_events', JSON.stringify([fresh, eplus]));

    const { result } = render();

    expect(result.current.events.map(e => e.id).sort()).toEqual(['eplus-1', 'lawson-444647-20260815']);
  });

  it('无 Lコード 时的回退派生 id 不被误伤（标题 slug / g0 / p0 三种回退）', () => {
    // parseResultBoxGroup: base = lcode || groupLcode || titleSlug || `g${groupIdx}`，
    // 日期段 = prfDate || `p${prfIdx}` —— 三种回退都保持「两段」，均不该命中纯数字单段规则。
    const slugBase = makeEvent({ id: 'lawson-fruitszipper-20260815', platform: 'Lawson Ticket', artistName: 'D', date: '2026-08-16' });
    const idxBase = makeEvent({ id: 'lawson-g0-20260815', platform: 'Lawson Ticket', artistName: 'E', date: '2026-08-17' });
    const noDate = makeEvent({ id: 'lawson-444647-p0', platform: 'Lawson Ticket', artistName: 'F', date: '2026-08-18' });
    localStorage.setItem('oshikatsu_events', JSON.stringify([slugBase, idxBase, noDate]));

    const { result } = render();

    expect(result.current.events).toHaveLength(3);
  });

  it('「重置全部数据」不该让剪枝复活（clear 会连标记一起抹掉）', async () => {
    const { result } = render();
    await act(async () => { await result.current.handleResetDatabase(); });
    cleanup();

    // 重置后重新搜索，旧结构回退路径产出 lawson-<纯数字>；下次启动必须还在。
    localStorage.setItem('oshikatsu_events', JSON.stringify([
      makeEvent({ id: 'lawson-12345', platform: 'Lawson Ticket', artistName: 'G', date: '2026-09-01' }),
    ]));

    const reopened = render();

    expect(reopened.result.current.events.map(e => e.id)).toEqual(['lawson-12345']);
  });

  it('只剪一次：标记落地后,新版旧结构回退路径产出的 lawson-<纯数字> 不再被删', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([
      makeEvent({ id: 'lawson-444647', platform: 'Lawson Ticket', artistName: 'A', date: '2026-08-01' }),
    ]));
    const first = render();
    expect(first.result.current.events).toHaveLength(0);
    cleanup();

    // 新版仍可能走 parseLawsonSearch 的旧结构回退路径产出 lawson-<纯数字>（lawsonParser.ts:276）。
    // 这类是「刚搜到的真结果」，重启后必须还在。
    localStorage.setItem('oshikatsu_events', JSON.stringify([
      makeEvent({ id: 'lawson-12345', platform: 'Lawson Ticket', artistName: 'G', date: '2026-09-01' }),
    ]));

    const { result } = render();

    expect(result.current.events.map(e => e.id)).toEqual(['lawson-12345']);
  });
});

// Lawson id 方案迁移（lawson-html-v2）：事件 id 从「整组一个」变为逐场（lawson-<Lコード>-<prfDate>）、
// 窗口 id 从硬编码 -0 变为 -<schduleNo>。notificationId 内嵌 windowId（见 notifications.ts），
// 于是持久化 alert 与已排定的系统通知一起变成孤儿：详情页开关对不上（显示未开启），
// 系统通知却照弹且用户无从关闭。启动时按「当前事件数据能产出的提醒 id」对账。
describe('useOshiStore — id 方案迁移遗留的孤儿提醒 reconcile', () => {
  const migratedEvent = () => makeEvent({
    id: 'lawson-L12345-20300810',
    platform: 'Lawson Ticket',
    date: '2030-08-10',
    ticketWindows: [{
      id: 'lawson-L12345-20300810-1',
      platform: 'Lawson Ticket',
      roundType: '先行',
      applyStart: '2030-07-01T10:00:00+09:00',
      applyEnd: '2030-07-20T23:59:00+09:00',
    }],
  });

  const alertOn = (event: ActivityEvent, windowId: string, overrides: Partial<NotificationAlert> = {}): NotificationAlert => ({
    id: `alert-${windowId}`,
    eventId: event.id,
    eventTitle: event.title,
    platform: 'Lawson Ticket',
    type: 'lottery_start',
    alertDate: '2030-07-01',
    isTriggered: false,
    windowId,
    scheduleAt: '2030-07-01T10:00:00+09:00',
    notificationId: makeReminderNotificationId(stableConcertKey(event), windowId, 'lottery_start'),
    ...overrides,
  });

  const seed = (events: ActivityEvent[], alerts: NotificationAlert[]) => {
    localStorage.setItem('oshikatsu_events', JSON.stringify(events));
    localStorage.setItem('oshikatsu_alerts', JSON.stringify(alerts));
  };

  it('旧窗口 id 的 alert 被清理并回写,当前窗口的提醒不受影响', () => {
    const event = migratedEvent();
    const stale = alertOn(event, 'lawson-444647-0'); // 旧方案：整组一个 id + 硬编码 -0
    const live = alertOn(event, 'lawson-L12345-20300810-1');
    seed([event], [stale, live]);

    const { result } = render();

    expect(result.current.activeAlerts.map(a => a.notificationId)).toEqual([live.notificationId]);
    const persisted = JSON.parse(localStorage.getItem('oshikatsu_alerts')!) as NotificationAlert[];
    expect(persisted.map(a => a.notificationId)).toEqual([live.notificationId]);
  });

  it('把当前有效 id 集交给原生清扫（幽灵通知按系统 pending 取消）', () => {
    const event = migratedEvent();
    const stale = alertOn(event, 'lawson-444647-0');
    const live = alertOn(event, 'lawson-L12345-20300810-1');
    seed([event], [stale, live]);

    render();

    expect(notifications.cancelReminderIds).toHaveBeenCalledOnce();
    const deadIds = vi.mocked(notifications.cancelReminderIds).mock.calls[0][0];
    // deny-list：只取消可证明属于旧方案的 id,当前窗口的提醒绝不进清扫名单
    expect(deadIds.has(stale.notificationId!)).toBe(true);
    expect(deadIds.has(live.notificationId!)).toBe(false);
  });

  it('旧 schema 缺 notificationId 的 alert 一并清掉（永远点不亮开关的死记录）', () => {
    const event = migratedEvent();
    seed([event], [alertOn(event, 'lawson-L12345-20300810-1', { notificationId: undefined })]);

    const { result } = render();

    expect(result.current.activeAlerts).toEqual([]);
  });

  it('无孤儿 → 不回写 alerts（每次启动都重写是无谓写入）', () => {
    const event = migratedEvent();
    seed([event], [alertOn(event, 'lawson-L12345-20300810-1')]);
    // 不能用 vi.spyOn：两种运行环境下代码摸到的 localStorage 不是同一种东西
    // （本地 Node 25 → setup.ts 的普通对象；CI Node 22 → jsdom 真 Storage 是 Proxy），
    // spy 到任一具体对象都可能录不到调用 → 断言恒真。整体替换绑定来记账，两边都稳。
    const real = globalThis.localStorage;
    const written: string[] = [];
    const recorder: Storage = {
      get length() { return real.length; },
      clear: () => real.clear(),
      getItem: (k: string) => real.getItem(k),
      key: (i: number) => real.key(i),
      removeItem: (k: string) => real.removeItem(k),
      setItem: (k: string, v: string) => { written.push(k); real.setItem(k, v); },
    };
    const install = (value: Storage) => {
      for (const target of [globalThis, window] as Array<typeof globalThis | Window>) {
        Object.defineProperty(target, 'localStorage', { value, configurable: true, writable: true });
      }
    };
    install(recorder);
    try {
      const { result } = render();
      expect(result.current.activeAlerts).toHaveLength(1);
      // 先证明记账确实在工作（迁移标记那次写入必然发生），否则本用例又会悄悄退化成恒真
      expect(written.length).toBeGreaterThan(0);
      expect(written.filter(key => key === 'oshikatsu_alerts')).toEqual([]);
    } finally {
      install(real);
    }
  });

  // 对账把 buildReminderTargets 拉进了启动加载链：一条结构损坏的持久化事件（localStorage
  // 可以是任何东西）不能像 d24ec3f 前的裸 JSON.parse 那样打断整条链、让后续状态静默全丢。
  it('结构损坏的持久化事件不打断加载链,有效提醒不被误删', () => {
    const event = migratedEvent();
    const broken = { ...makeEvent({ id: 'lawson-broken' }), ticketWindows: 'oops' } as unknown as ActivityEvent;
    seed([broken, event], [alertOn(event, 'lawson-L12345-20300810-1')]);
    localStorage.setItem('oshikatsu_recent_searches', JSON.stringify(['FRUITS ZIPPER']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = render();

    expect(result.current.activeAlerts).toHaveLength(1);
    expect(result.current.recentSearches).toEqual(['FRUITS ZIPPER']); // 加载链未中断
  });

  it('事件数据为空（未搜索 / events 坏数据）→ 全部保留且不清扫：无基准可比,宁留孤儿不误删', () => {
    const event = migratedEvent();
    localStorage.setItem('oshikatsu_alerts', JSON.stringify([alertOn(event, 'lawson-L12345-20300810-1')]));

    const { result } = render();

    expect(result.current.activeAlerts).toHaveLength(1);
    expect(notifications.cancelReminderIds).not.toHaveBeenCalled();
  });

  // 只搜过 Lawson 的用户（正是本次 bug 的报告场景）升级后存量会被整体剪空,
  // 此时仍必须清扫——否则幽灵通知永远排在系统里。
  it('存量全是旧 id 事件 → 剪空后仍要清扫其幽灵通知', () => {
    const legacy = makeEvent({
      id: 'lawson-444647',
      platform: 'Lawson Ticket',
      date: '2030-08-10',
      ticketWindows: [{
        id: 'lawson-444647-0',
        platform: 'Lawson Ticket',
        roundType: '先行',
        applyStart: '2030-07-01T10:00:00+09:00',
        applyEnd: '2030-07-20T23:59:00+09:00',
      }],
    });
    seed([legacy], [alertOn(legacy, 'lawson-444647-0')]);

    const { result } = render();

    expect(result.current.events).toHaveLength(0);
    expect(result.current.activeAlerts).toHaveLength(0);
    expect(notifications.cancelReminderIds).toHaveBeenCalledOnce();
    // deny-list 精确列出被剪事件的 id,而非「清掉一切重建不出来的」
    const deadIds = vi.mocked(notifications.cancelReminderIds).mock.calls[0][0];
    expect(deadIds.size).toBeGreaterThan(0);
    expect(JSON.parse(localStorage.getItem('oshikatsu_alerts') ?? '[]')).toEqual([]);
  });
});

describe('useOshiStore — 迁移加固（#83 事后评审）', () => {
  const legacyEvent = (overrides: Partial<ActivityEvent> = {}) => makeEvent({
    id: 'lawson-444647',
    platform: 'Lawson Ticket',
    artistName: '倉木麻衣',
    date: '2030-08-10',
    ticketWindows: [{
      id: 'lawson-444647-0', platform: 'Lawson Ticket', roundType: '先行',
      applyStart: '2030-07-01T10:00:00+09:00', applyEnd: '2030-07-20T23:59:00+09:00',
    }],
    ...overrides,
  });

  // jsdom 的 Storage 是 Proxy：给它赋 .setItem 会被当成「存一个叫 setItem 的键」而非覆盖方法。
  // 本地(Node 25 注入残缺 localStorage 全局 → tests/setup.ts 换成普通对象)能改，
  // CI(Node 22 → 真 jsdom Storage)改不动 —— 覆盖静默失效，测试要么红要么恒真。
  // 整体替换绑定，两边都稳。
  const withFailingWrite = (failKey: string, run: () => void) => {
    const real = globalThis.localStorage;
    const stub: Storage = {
      get length() { return real.length; },
      clear: () => real.clear(),
      getItem: (k: string) => real.getItem(k),
      key: (i: number) => real.key(i),
      removeItem: (k: string) => real.removeItem(k),
      setItem: (k: string, v: string) => {
        if (k === failKey) { const err = new Error('quota'); err.name = 'QuotaExceededError'; throw err; }
        real.setItem(k, v);
      },
    };
    const install = (value: Storage) => {
      for (const target of [globalThis, window] as Array<typeof globalThis | Window>) {
        Object.defineProperty(target, 'localStorage', { value, configurable: true, writable: true });
      }
    };
    install(stub);
    try { run(); } finally { install(real); }
  };

  // ── 启动崩溃循环：加载链里的写入不得抛穿 ──
  // ErrorBoundary 唯一的恢复手段是 reload，reload 重跑同一 effect → 永久循环，
  // 用户在应用内够不到重置按钮。#83 之前这个 effect 里 0 处写入，之后有 3 处。
  it('存储配额爆掉 → 加载链后段照常执行,不抛穿', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([legacyEvent()]));
    localStorage.setItem('oshikatsu_recent_searches', JSON.stringify(['ARTIST']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    withFailingWrite('oshikatsu_events', () => {
      const { result } = render();
      expect(result.current.recentSearches).toEqual(['ARTIST']); // 加载链未被写入异常中断
      // 证明写入确实被拒（否则本用例在覆盖失效的环境里会恒真）
      const persisted = JSON.parse(localStorage.getItem('oshikatsu_events')!) as ActivityEvent[];
      expect(persisted.map(e => e.id)).toEqual(['lawson-444647']);
    });
  });

  it('alerts 存成 [null,42] 这类畸形载荷 → 不抛穿,加载链后段照常执行', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ id: 'eplus-1' })]));
    localStorage.setItem('oshikatsu_alerts', '[null,42]');
    localStorage.setItem('oshikatsu_recent_searches', JSON.stringify(['ARTIST']));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = render();

    expect(result.current.recentSearches).toEqual(['ARTIST']);
    expect(result.current.activeAlerts).toEqual([]);
  });

  // ── 迁移原子性：数据写失败时标记不得落地 ──
  it('事件回写失败 → 迁移标记不落地,下次启动重试剪枝', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([legacyEvent()]));
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    withFailingWrite('oshikatsu_events', () => {
      render();
      expect(localStorage.getItem('oshikatsu_lawson_id_migrated')).toBeNull();
      // 同上：证明剪枝结果确实没落盘,标记才该缺席
      const persisted = JSON.parse(localStorage.getItem('oshikatsu_events')!) as ActivityEvent[];
      expect(persisted.map(e => e.id)).toEqual(['lawson-444647']);
    });
  });

  it('首启无可剪内容 → 标记仍要落地(否则日后合法的 lawson-<纯数字> 会被误剪)', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ id: 'eplus-1' })]));
    render();
    // 落当前迁移版本；写更低的值会让下次启动误以为还欠一轮补做
    expect(localStorage.getItem('oshikatsu_lawson_id_migrated')).toBe('2');
  });

  // ── 聚合缺口（方案 B）：剥离旧窗口 + 清 memberIds,保住合法半边 ──
  it('旧 Lawson 事件被聚合进 agg- 卡：剥离旧窗口,eplus 那半与别名保留', () => {
    const agg = makeEvent({
      id: 'agg-倉木麻衣-2030-08-10-会場x',
      platform: 'Lawson Ticket',
      artistName: '倉木麻衣',
      date: '2030-08-10',
      memberIds: ['lawson-444647', 'eplus-99'],
      ticketWindows: [
        { id: 'eplus-99-0', platform: 'eplus', roundType: '一般', applyStart: null, applyEnd: '2030-07-25T23:59:00+09:00' },
        { id: 'lawson-444647-0', platform: 'Lawson Ticket', roundType: '先行', applyStart: null, applyEnd: '2030-07-20T23:59:00+09:00' },
      ],
    });
    localStorage.setItem('oshikatsu_events', JSON.stringify([agg]));

    const { result } = render();

    const card = result.current.events[0];
    expect(card.ticketWindows?.map(w => w.id)).toEqual(['eplus-99-0']); // 幽灵窗口已剥离
    // memberIds 保留：纯别名,剥掉会让收藏静默失联（评审 E）
    expect(card.memberIds).toEqual(['lawson-444647', 'eplus-99']);
    const persisted = JSON.parse(localStorage.getItem('oshikatsu_events')!) as ActivityEvent[];
    expect(persisted[0].ticketWindows?.map(w => w.id)).toEqual(['eplus-99-0']);
  });

  it('独立的旧格式事件仍整条剪掉;同轮里非 Lawson 事件与其提醒不受牵连', () => {
    const eplus = makeEvent({
      id: 'eplus-9', platform: 'eplus', artistName: 'C', date: '2030-08-20',
      ticketWindows: [{
        id: 'eplus-9-w1', platform: 'eplus', roundType: '一般',
        applyStart: '2030-07-01T10:00:00+09:00', applyEnd: '2030-07-20T23:59:00+09:00',
      }],
    });
    const keepAlert = {
      id: 'alert-eplus', eventId: 'eplus-9', eventTitle: eplus.title, platform: 'eplus' as const,
      type: 'lottery_start' as const, alertDate: '2030-07-01', isTriggered: false,
      windowId: 'eplus-9-w1', scheduleAt: '2030-07-01T10:00:00+09:00',
      notificationId: makeReminderNotificationId(stableConcertKey(eplus), 'eplus-9-w1', 'lottery_start'),
    };
    localStorage.setItem('oshikatsu_events', JSON.stringify([legacyEvent(), eplus]));
    localStorage.setItem('oshikatsu_alerts', JSON.stringify([keepAlert]));

    const { result } = render();

    expect(result.current.events.map(e => e.id)).toEqual(['eplus-9']);
    const persisted = JSON.parse(localStorage.getItem('oshikatsu_events')!) as ActivityEvent[];
    expect(persisted.map(e => e.id)).toEqual(['eplus-9']); // 幸存者不能被顺手抹掉
    expect(result.current.activeAlerts.map(a => a.notificationId)).toEqual([keepAlert.notificationId]);
  });

  // 真机实测（Pixel，装过 #83 的设备）暴露：标记已是 '1',本次的窗口剥离若挂在同一个
  // 「有标记就跳过」判断下,装过 #83 的用户永远等不到修复——而 #83 已在 main 上,那是全部存量用户。
  it('装过 #83 的设备(标记=1)升级后仍要剥离聚合卡里的旧窗口', () => {
    const agg = makeEvent({
      id: 'agg-a-2030-08-10-会場x', platform: 'eplus', artistName: 'A', date: '2030-08-10',
      memberIds: ['lawson-3', 'eplus-9'],
      ticketWindows: [
        { id: 'eplus-9-0', platform: 'eplus', roundType: '一般', applyStart: null, applyEnd: '2030-07-25T23:59:00+09:00' },
        { id: 'lawson-3-0', platform: 'Lawson Ticket', roundType: '先行', applyStart: null, applyEnd: '2030-07-20T23:59:00+09:00' },
      ],
    });
    localStorage.setItem('oshikatsu_events', JSON.stringify([agg]));
    localStorage.setItem('oshikatsu_lawson_id_migrated', '1'); // #83 留下的标记

    const { result } = render();

    expect(result.current.events[0].ticketWindows?.map(w => w.id)).toEqual(['eplus-9-0']);
    expect(result.current.events[0].memberIds).toEqual(['lawson-3', 'eplus-9']); // 别名保留
  });

  it('已是最新迁移版本的设备 → 不再重复剪枝(合法的 lawson-<纯数字> 不被误删)', () => {
    const fresh = makeEvent({ id: 'lawson-777', platform: 'Lawson Ticket', artistName: 'F', date: '2030-09-01' });
    localStorage.setItem('oshikatsu_events', JSON.stringify([fresh]));
    localStorage.setItem('oshikatsu_lawson_id_migrated', '2');

    const { result } = render();

    expect(result.current.events.map(e => e.id)).toEqual(['lawson-777']);
  });

  // stableConcertKey 只用「艺人|日期」(不含会场/id) → 同艺人同日的不同事件共用 keyBase;
  // 而 concert 提醒无条件用 windowId='event'。据此推导「被剪事件的死 id」会连坐幸存事件,
  // 正是本分支声称消灭的静默误删。'event' 不是旧方案窗口,其 id 不可证明归属于被剪事件。
  it('剪掉旧事件不得连坐同艺人同日幸存事件的当日提醒', () => {
    const legacy = makeEvent({ id: 'lawson-444647', platform: 'Lawson Ticket', artistName: 'A', date: '2030-08-10', ticketWindows: [] });
    const live = makeEvent({
      id: 'eplus-99', platform: 'eplus', artistName: 'A', date: '2030-08-10', venueName: '別会場',
      ticketWindows: [{ id: 'eplus-99-0', platform: 'eplus', roundType: '一般', applyStart: null, applyEnd: '2030-07-25T23:59:00+09:00' }],
    });
    // 幸存事件的「公演当日」提醒——与被剪事件共用 keyBase,windowId 同为 'event'
    const concertAlert = {
      id: 'alert-concert', eventId: 'eplus-99', eventTitle: live.title, platform: 'eplus' as const,
      type: 'concert' as const, alertDate: '2030-08-10', isTriggered: false,
      windowId: 'event', scheduleAt: '2030-08-09T18:00:00+09:00',
      notificationId: makeReminderNotificationId(stableConcertKey(live), 'event', 'concert'),
    };
    localStorage.setItem('oshikatsu_events', JSON.stringify([legacy, live]));
    localStorage.setItem('oshikatsu_alerts', JSON.stringify([concertAlert]));

    const { result } = render();

    expect(result.current.activeAlerts.map(a => a.notificationId)).toEqual([concertAlert.notificationId]);
    const dead = vi.mocked(notifications.cancelReminderIds).mock.calls[0]?.[0];
    if (dead) expect(dead.has(concertAlert.notificationId)).toBe(false);
  });

  // 旧结构回退路径至今仍在产 lawson-<纯数字> 事件与 lawson-<数字>-0 窗口
  //（parser-fixtures 有断言）。alert 形状清扫若每次启动都跑,用户为这类合法结果开的提醒
  // 会在每次启动被删 + 取消 —— 就是「搜到又消失」换到提醒上。
  it('已迁移设备：合法 legacy 形状结果的提醒不得被每次启动清掉', () => {
    const fresh = makeEvent({
      id: 'lawson-12345', platform: 'Lawson Ticket', artistName: 'F', date: '2030-09-01',
      ticketWindows: [{ id: 'lawson-12345-0', platform: 'Lawson Ticket', roundType: '先行', applyStart: '2030-08-01T10:00:00+09:00', applyEnd: '2030-08-20T23:59:00+09:00' }],
    });
    const alert = {
      id: 'alert-fresh', eventId: 'lawson-12345', eventTitle: fresh.title, platform: 'Lawson Ticket' as const,
      type: 'lottery_start' as const, alertDate: '2030-08-01', isTriggered: false,
      windowId: 'lawson-12345-0', scheduleAt: '2030-08-01T10:00:00+09:00',
      notificationId: makeReminderNotificationId(stableConcertKey(fresh), 'lawson-12345-0', 'lottery_start'),
    };
    localStorage.setItem('oshikatsu_events', JSON.stringify([fresh]));
    localStorage.setItem('oshikatsu_alerts', JSON.stringify([alert]));
    localStorage.setItem('oshikatsu_lawson_id_migrated', '2'); // 已完成迁移

    const { result } = render();

    expect(result.current.activeAlerts.map(a => a.notificationId)).toEqual([alert.notificationId]);
    expect(notifications.cancelReminderIds).not.toHaveBeenCalled();
  });

  it('剥离旧窗口时保留 memberIds 别名(否则收藏会被静默解除)', () => {
    const agg = makeEvent({
      id: 'agg-a-2030-08-10-会場x', platform: 'eplus', artistName: 'A', date: '2030-08-10',
      memberIds: ['lawson-444647', 'eplus-99'],
      ticketWindows: [
        { id: 'eplus-99-0', platform: 'eplus', roundType: '一般', applyStart: null, applyEnd: '2030-07-25T23:59:00+09:00' },
        { id: 'lawson-444647-0', platform: 'Lawson Ticket', roundType: '先行', applyStart: null, applyEnd: '2030-07-20T23:59:00+09:00' },
      ],
    });
    localStorage.setItem('oshikatsu_events', JSON.stringify([agg]));
    localStorage.setItem('oshikatsu_favorites', JSON.stringify(['lawson-444647']));

    const { result } = render();

    expect(result.current.events[0].ticketWindows?.map(w => w.id)).toEqual(['eplus-99-0']);
    // memberIds 是纯别名,没有任何东西从它派生 notificationId 或卡片;剥掉只会让收藏失联
    expect(result.current.favorites).toEqual(['lawson-444647']);
  });

  // ── 方案 A：只取消可证明属于旧方案的提醒 ──
  it('无窗口事件的 fallback 提醒(windowId=event)不因聚合补入窗口而被误删', () => {
    // buildReminderTargets 只在事件无窗口时产 fallback 目标；聚合从别家补入窗口后
    // 这些 id 就重建不出来。旧的 allow-list 会把它们连同已排定的系统通知一起删掉。
    const windowless = makeEvent({
      id: 'pia-1', platform: 'Ticket Pia', artistName: 'H', date: '2030-09-10',
      ticketWindows: [], timeline: { lotteryStartDate: '2030-08-01' },
    });
    const fallbackAlert = {
      id: 'alert-fallback', eventId: 'pia-1', eventTitle: windowless.title,
      platform: 'Ticket Pia' as const, type: 'lottery_start' as const, alertDate: '2030-08-01',
      isTriggered: false, windowId: 'event', scheduleAt: '2030-08-01T10:00:00+09:00',
      notificationId: 987654,
    };
    localStorage.setItem('oshikatsu_events', JSON.stringify([windowless]));
    localStorage.setItem('oshikatsu_alerts', JSON.stringify([fallbackAlert]));

    const { result } = render();

    expect(result.current.activeAlerts.map(a => a.notificationId)).toEqual([987654]);
  });
});

describe('useOshiStore — Lawson 插件默认开关（分发化）', () => {
  // 曾经「未配代理 → Lawson 默认关」,因为那时直连恒被反爬拒绝。ADR-0005/0006 之后
  // 两个平台都能端上直取,再默认关会让全新安装/重置数据后 Lawson 静默缺席。
  it('首启默认开启,与代理是否配置无关（ADR-0006）', () => {
    for (const configured of [false, true]) {
      vi.mocked(proxy.isProxyConfigured).mockReturnValue(configured);
      const { result } = render();
      expect(result.current.extensions.find(e => e.id === 'ext-lawson')?.isEnabled).toBe(true);
      expect(result.current.extensions.every(e => e.isEnabled)).toBe(true);
      cleanup();
    }
  });

  it('用户手动关掉 Lawson 后重载不再被强制打开（存量 bug 回归）', () => {
    vi.mocked(proxy.isProxyConfigured).mockReturnValue(true);
    localStorage.setItem('oshikatsu_extensions', JSON.stringify(
      INITIAL_EXTENSIONS.map(e => e.id === 'ext-lawson' ? { ...e, isEnabled: false } : e),
    ));
    const { result } = render();
    expect(result.current.extensions.find(e => e.id === 'ext-lawson')?.isEnabled).toBe(false);
  });
});

describe('useOshiStore — 收藏稳定键（#36 回归）', () => {
  it('收藏写入稳定键 + id 别名并持久化', () => {
    const ev = makeEvent({ id: 'lawson-1', platform: 'Lawson Ticket' });
    const { result } = render();

    act(() => result.current.handleToggleFavorite(ev));

    const key = favoriteKey(ev);
    expect(key.startsWith('fav:')).toBe(true);
    expect(result.current.favorites).toEqual([key, 'lawson-1']);
    expect(JSON.parse(localStorage.getItem('oshikatsu_favorites')!)).toEqual([key, 'lawson-1']);
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
    // id 用新格式（两段）：本用例验证的是「收藏稳定键跨重载命中」，与 Lawson id 迁移无关，
    // 而单段纯数字的 lawson-1 现在会被旧格式剪枝吃掉（事件没了，收藏自然一并失效）。
    const ev = makeEvent({ id: 'lawson-1-20260810', platform: 'Lawson Ticket' });
    localStorage.setItem('oshikatsu_events', JSON.stringify([ev]));
    localStorage.setItem('oshikatsu_favorites', JSON.stringify([favoriteKey(ev)]));

    const { result } = render();

    expect(result.current.favorites).toContain(favoriteKey(ev));
  });

  it('收藏写入别名全集（键+id+成员平台 id），取消时全部清掉（QA ISSUE-001）', () => {
    const ev = makeEvent({ id: 'agg-x-2030-08-10-v', memberIds: ['eplus-9', 'pia-B1'] });
    const { result } = render();

    act(() => result.current.handleToggleFavorite(ev));
    const stored = JSON.parse(localStorage.getItem('oshikatsu_favorites')!) as string[];
    expect(stored).toEqual(expect.arrayContaining(['eplus-9', 'pia-B1', 'agg-x-2030-08-10-v']));

    // 换关键词重搜后的同一场（艺人名/聚合 id 漂移，但成员平台 id 相同）仍算已收藏 → 再点是取消
    const refound = makeEvent({ id: 'agg-y-2030-08-10-v', artistName: '別の検索語', memberIds: ['eplus-9'] });
    act(() => result.current.handleToggleFavorite(refound));
    expect(JSON.parse(localStorage.getItem('oshikatsu_favorites')!)).not.toContain('eplus-9');
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

  it('代理降级（配置了但连不上）→ searchDegraded 置 true 供 UI 提示（QA #2）', async () => {
    vi.mocked(sources.searchableTargets).mockReturnValue(['eplus']);
    vi.mocked(sources.searchPlatformsStreaming).mockImplementation(async (_q, _p, onSource, options) => {
      options?.onMeta?.({ proxyDegraded: true });
      onSource({ platform: 'eplus', status: 'ok', count: 1, handoffUrl: 'h', runtime: 'client' }, [makeEvent()]);
    });

    const { result } = render();
    expect(result.current.searchDegraded).toBe(false);
    await act(async () => {
      await result.current.handleRunPlatformSearch('FRUITS ZIPPER', ['eplus']);
    });
    expect(result.current.searchDegraded).toBe(true);
  });

  it('搜索完成记录抓取时间并标 live；clear 归零（QA #6）', async () => {
    vi.mocked(sources.searchableTargets).mockReturnValue(['eplus']);
    vi.mocked(sources.searchPlatformsStreaming).mockImplementation(async (_q, _p, onSource) => {
      onSource({ platform: 'eplus', status: 'ok', count: 1, handoffUrl: 'h', runtime: 'client' }, [makeEvent()]);
    });
    const { result } = render();
    expect(result.current.searchIsLive).toBe(false);
    await act(async () => { await result.current.handleRunPlatformSearch('X', ['eplus']); });
    expect(result.current.searchIsLive).toBe(true);
    expect(typeof result.current.searchFetchedAt).toBe('string');
    expect(JSON.parse(localStorage.getItem('oshikatsu_search_fetched_at')!)).toBeTruthy();

    act(() => result.current.clearSearchResults());
    expect(result.current.searchIsLive).toBe(false);
    expect(result.current.searchFetchedAt).toBeNull();
    expect(localStorage.getItem('oshikatsu_search_fetched_at')).toBeNull();
  });

  it('装载持久化结果 → searchIsLive=false 但保留抓取时间（「上次搜索」标注）', () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent({ id: 'eplus-1' })]));
    localStorage.setItem('oshikatsu_search_result_ids', JSON.stringify(['eplus-1']));
    localStorage.setItem('oshikatsu_search_fetched_at', JSON.stringify('2026-07-03T12:00:00.000Z'));
    const { result } = render();
    expect(result.current.searchFetchedAt).toBe('2026-07-03T12:00:00.000Z');
    expect(result.current.searchIsLive).toBe(false);
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

  it('并发开启两个不同提醒 → 两者都进入 activeAlerts 且都持久化（#73 竞态）', async () => {
    vi.mocked(notifications.scheduleReminderTarget).mockResolvedValue(undefined);
    const { result } = render();
    // 从同一初始快照并发触发：闭包版会用同一份旧 activeAlerts=[]，后写覆盖先写 → 只剩 1 条。
    const toggle = result.current.handleToggleAlert;
    await act(async () => {
      await Promise.all([
        toggle(makeTarget({ notificationId: 3001 })),
        toggle(makeTarget({ notificationId: 3002 })),
      ]);
    });

    expect(result.current.activeAlerts.map(a => a.notificationId).sort()).toEqual([3001, 3002]);
    expect(JSON.parse(localStorage.getItem('oshikatsu_alerts')!)).toHaveLength(2);
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

  it('handleResetDatabase 清库但保留语言设置', async () => {
    localStorage.setItem(LOCALE_STORAGE_KEY, 'ja');
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent()]));
    const { result } = render();
    expect(result.current.events).toHaveLength(1);

    await act(async () => { await result.current.handleResetDatabase(); });

    expect(result.current.events).toEqual([]);
    expect(result.current.favorites).toEqual([]);
    expect(result.current.oshiColorId).toBe('pink');
    expect(localStorage.getItem('oshikatsu_events')).toBeNull();
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('ja');
  });

  it('handleResetDatabase 清库前先取消所有已排程系统通知（#71）', async () => {
    localStorage.setItem('oshikatsu_events', JSON.stringify([makeEvent()]));
    const { result } = render();

    await act(async () => { await result.current.handleResetDatabase(); });

    expect(notifications.cancelAllReminders).toHaveBeenCalledOnce();
  });

  it('重载扩展：存储覆盖默认 + 强制安装 Lawson（但开关尊重用户选择）', () => {
    localStorage.setItem('oshikatsu_extensions', JSON.stringify([
      { id: 'ext-eplus', isEnabled: false },
      { id: 'ext-lawson', isEnabled: false, isInstalled: false },
    ]));
    const { result } = render();

    expect(result.current.extensions.find(e => e.id === 'ext-eplus')?.isEnabled).toBe(false);
    const lawson = result.current.extensions.find(e => e.id === 'ext-lawson')!;
    expect(lawson.isInstalled).toBe(true);
    // 旧行为强制 isEnabled:true（用户关不掉 Lawson 的存量 bug）——现尊重持久化选择
    expect(lawson.isEnabled).toBe(false);
  });
});

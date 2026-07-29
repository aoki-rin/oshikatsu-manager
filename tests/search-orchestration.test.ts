import { describe, it, expect, vi, beforeEach } from 'vitest';
import assert from 'node:assert/strict';
import { makeEvent } from './_fixtures';
import type { TicketSearchReport } from '../src/types';

// 编排层此前一条测试都没有（index.ts 行覆盖 14%）：代理优先、降级标记、并发流式回调、
// 超时竞速、abort 全靠人工验证。这里只替身「最外圈」——各平台的 search 与 proxy 模块，
// searchableTargets / dedupeEvents / aggregate / withPlatformTimeout 都跑真实现，
// 否则测的是 mock 而不是编排。
const h = vi.hoisted(() => ({
  eplus: vi.fn(),
  pia: vi.fn(),
  ticketdive: vi.fn(),
  livepocket: vi.fn(),
  lawson: vi.fn(),
  searchViaProxy: vi.fn(),
  isProxyConfigured: vi.fn(() => false),
}));

vi.mock('../src/sources/eplus', () => ({ searchEplus: h.eplus }));
vi.mock('../src/sources/pia', () => ({ searchPia: h.pia, enrichPiaWindows: vi.fn(async (e) => e) }));
vi.mock('../src/sources/ticketdive', () => ({ searchTicketDive: h.ticketdive, enrichTicketDiveWindows: vi.fn(async (e) => e) }));
vi.mock('../src/sources/livepocket', () => ({ searchLivePocket: h.livepocket, enrichLivePocketWindows: vi.fn(async (e) => e) }));
vi.mock('../src/sources/lawson', () => ({ searchLawson: h.lawson }));
vi.mock('../src/sources/proxy', () => ({
  searchViaProxy: h.searchViaProxy,
  isProxyConfigured: h.isProxyConfigured,
  // searchWithProxyFallback 只被 searchAllPlatforms 用，这里保留真实语义的最小替身。
  searchWithProxyFallback: vi.fn(async (q: string, targets: string[], clientSearch) => clientSearch(q, targets)),
}));

import { searchPlatformsStreaming, searchClientPlatforms, searchAllPlatforms, hasPlugin } from '../src/sources';

const ALL = ['All'];

// 收集流式回调，保留到达顺序——「谁先回来谁先回调」正是这个函数存在的理由。
function collector() {
  const calls: { platform: string; status: string; count: number; at: number }[] = [];
  const events: Record<string, unknown[]> = {};
  const onSource = (report: TicketSearchReport, evs: unknown[]) => {
    calls.push({ platform: report.platform, status: report.status, count: report.count, at: Date.now() });
    events[report.platform] = evs;
  };
  return { calls, events, onSource, order: () => calls.map((c) => c.platform) };
}

const delayed = <T,>(value: T, ms: number) => () => new Promise<T>((r) => setTimeout(() => r(value), ms));

beforeEach(() => {
  vi.clearAllMocks();
  h.isProxyConfigured.mockReturnValue(false);
  h.searchViaProxy.mockResolvedValue(null);
  for (const fn of [h.eplus, h.pia, h.ticketdive, h.livepocket, h.lawson]) fn.mockResolvedValue([]);
});

describe('searchPlatformsStreaming：不该发请求的情况', () => {
  it('空 query → 一个源都不调,也不回调', async () => {
    const c = collector();
    await searchPlatformsStreaming('   ', ALL, c.onSource);
    assert.equal(c.calls.length, 0);
    assert.equal(h.eplus.mock.calls.length, 0);
    assert.equal(h.searchViaProxy.mock.calls.length, 0, '空 query 不该先去问代理');
  });

  it('没有任何已注册平台 → 直接返回', async () => {
    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ['不存在的平台'], c.onSource);
    assert.equal(c.calls.length, 0);
    assert.equal(h.eplus.mock.calls.length, 0);
  });
});

describe('searchPlatformsStreaming：代理优先', () => {
  it('代理有结果 → 用代理结果,不再打任何客户端源', async () => {
    h.isProxyConfigured.mockReturnValue(true);
    h.searchViaProxy.mockResolvedValue({
      events: [makeEvent({ id: 'e1', platform: 'eplus' }), makeEvent({ id: 'p1', platform: 'Ticket Pia' })],
      reports: [
        { platform: 'eplus', status: 'ok', count: 1 },
        { platform: 'Ticket Pia', status: 'ok', count: 1 },
      ],
      servedBy: 'proxy',
    });

    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ALL, c.onSource);

    assert.deepEqual(c.order(), ['eplus', 'Ticket Pia']);
    for (const fn of [h.eplus, h.pia, h.ticketdive, h.livepocket, h.lawson]) {
      assert.equal(fn.mock.calls.length, 0, '代理成功时不该再走客户端');
    }
  });

  it('代理结果按平台分发事件,不把别家的事件塞给这家', async () => {
    h.searchViaProxy.mockResolvedValue({
      events: [makeEvent({ id: 'e1', platform: 'eplus' }), makeEvent({ id: 'p1', platform: 'Ticket Pia' })],
      reports: [
        { platform: 'eplus', status: 'ok', count: 1 },
        { platform: 'Ticket Pia', status: 'ok', count: 1 },
      ],
      servedBy: 'proxy',
    });

    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ALL, c.onSource);

    assert.deepEqual((c.events['eplus'] as { id: string }[]).map((e) => e.id), ['e1']);
    assert.deepEqual((c.events['Ticket Pia'] as { id: string }[]).map((e) => e.id), ['p1']);
  });

  it('代理路径打 runtime:proxy；服务端自报的 runtime 优先保留', async () => {
    h.searchViaProxy.mockResolvedValue({
      events: [],
      reports: [
        { platform: 'eplus', status: 'empty', count: 0 },
        { platform: 'Lawson Ticket', status: 'ok', count: 0, runtime: 'client' },
      ],
      servedBy: 'proxy',
    });

    const seen: Record<string, string | undefined> = {};
    await searchPlatformsStreaming('倉木麻衣', ALL, (r) => { seen[r.platform] = r.runtime; });

    assert.equal(seen['eplus'], 'proxy');
    assert.equal(seen['Lawson Ticket'], 'client', '服务端说是它自己直连的,别改写成 proxy');
  });

  it('只把已过裁剪的 targets 交给代理,不把 All 直接透传', async () => {
    h.searchViaProxy.mockResolvedValue(null);
    await searchPlatformsStreaming('倉木麻衣', ALL, () => {});

    const [, targets] = h.searchViaProxy.mock.calls[0];
    assert.ok(!targets.includes('All'), "'All' 必须先展开,否则服务端的解释权与客户端不一致");
    assert.deepEqual([...targets].sort(), ['Lawson Ticket', 'LivePocket', 'Ticket Pia', 'TicketDive', 'eplus']);
  });
});

describe('searchPlatformsStreaming：降级标记（QA #2 的回归锁）', () => {
  it('配了代理但请求失败 → proxyDegraded:true,并退回客户端', async () => {
    h.isProxyConfigured.mockReturnValue(true);
    h.searchViaProxy.mockRejectedValue(new Error('ECONNREFUSED'));
    h.eplus.mockResolvedValue([makeEvent({ id: 'e1' })]);

    const metas: { proxyDegraded: boolean }[] = [];
    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ALL, c.onSource, { onMeta: (m) => metas.push(m) });

    assert.deepEqual(metas, [{ proxyDegraded: true }]);
    assert.equal(h.eplus.mock.calls.length, 1, '代理失败必须退回客户端,不能空手而归');
  });

  it('没配代理 → proxyDegraded:false（这是正常形态,不是降级）', async () => {
    h.isProxyConfigured.mockReturnValue(false);
    h.searchViaProxy.mockResolvedValue(null);

    const metas: { proxyDegraded: boolean }[] = [];
    await searchPlatformsStreaming('倉木麻衣', ALL, () => {}, { onMeta: (m) => metas.push(m) });

    assert.deepEqual(metas, [{ proxyDegraded: false }]);
  });

  it('没配代理却抛错（dev 同源代理挂了）→ 仍不算降级', async () => {
    h.isProxyConfigured.mockReturnValue(false);
    h.searchViaProxy.mockRejectedValue(new Error('boom'));

    const metas: { proxyDegraded: boolean }[] = [];
    await searchPlatformsStreaming('倉木麻衣', ALL, () => {}, { onMeta: (m) => metas.push(m) });

    assert.deepEqual(metas, [{ proxyDegraded: false }]);
  });

  it('代理成功 → 不报降级', async () => {
    h.isProxyConfigured.mockReturnValue(true);
    h.searchViaProxy.mockResolvedValue({ events: [], reports: [], servedBy: 'proxy' });

    const metas: { proxyDegraded: boolean }[] = [];
    await searchPlatformsStreaming('倉木麻衣', ALL, () => {}, { onMeta: (m) => metas.push(m) });

    assert.deepEqual(metas, [{ proxyDegraded: false }]);
  });
});

describe('searchPlatformsStreaming：客户端流式', () => {
  it('快源先回调,不等慢源（这是「流式」的全部意义）', async () => {
    h.eplus.mockImplementation(delayed([makeEvent({ id: 'e1' })], 60));
    h.pia.mockImplementation(delayed([makeEvent({ id: 'p1', platform: 'Ticket Pia' })], 5));
    h.ticketdive.mockImplementation(delayed([], 30));

    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ['eplus', 'Ticket Pia', 'TicketDive'], c.onSource);

    assert.deepEqual(c.order(), ['Ticket Pia', 'TicketDive', 'eplus']);
  });

  it('一个源报错不拖累其他源', async () => {
    h.eplus.mockRejectedValue(new Error('eplus 挂了'));
    h.pia.mockResolvedValue([makeEvent({ id: 'p1', platform: 'Ticket Pia' })]);

    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ['eplus', 'Ticket Pia'], c.onSource);

    const byPlatform = Object.fromEntries(c.calls.map((x) => [x.platform, x]));
    assert.equal(byPlatform['eplus'].status, 'error');
    assert.equal(byPlatform['Ticket Pia'].status, 'ok');
  });

  it('零结果 → empty；有结果 → ok（别把「没票」报成失败）', async () => {
    h.eplus.mockResolvedValue([]);
    h.pia.mockResolvedValue([makeEvent({ id: 'p1', platform: 'Ticket Pia' })]);

    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ['eplus', 'Ticket Pia'], c.onSource);

    const byPlatform = Object.fromEntries(c.calls.map((x) => [x.platform, x]));
    assert.equal(byPlatform['eplus'].status, 'empty');
    assert.equal(byPlatform['eplus'].count, 0);
    assert.equal(byPlatform['Ticket Pia'].status, 'ok');
    assert.equal(byPlatform['Ticket Pia'].count, 1);
  });

  it('报错时保留原因,并仍给出官方跳转 URL', async () => {
    h.eplus.mockRejectedValue(new Error('反爬页'));

    let report: TicketSearchReport | undefined;
    await searchPlatformsStreaming('倉木麻衣', ['eplus'], (r) => { report = r; });

    assert.equal(report?.status, 'error');
    assert.match(report?.error ?? '', /反爬页/);
    // 抓取失败时用户唯一的出路就是这个跳转,不能只在成功路径上给。
    assert.match(report?.handoffUrl ?? '', /eplus\.jp\/sf\/search\?keyword=/);
    assert.equal(report?.runtime, 'client');
  });

  it('成功路径也带 handoffUrl 与 elapsedMs', async () => {
    h.eplus.mockImplementation(delayed([makeEvent({ id: 'e1' })], 20));

    let report: TicketSearchReport | undefined;
    await searchPlatformsStreaming('倉木麻衣', ['eplus'], (r) => { report = r; });

    assert.match(report?.handoffUrl ?? '', /eplus\.jp/);
    assert.ok((report?.elapsedMs ?? -1) >= 0, 'elapsedMs 缺失 → UI 的耗时列永远空');
  });

  it('查询词按平台各自编码进跳转 URL', async () => {
    let report: TicketSearchReport | undefined;
    await searchPlatformsStreaming('倉木麻衣', ['Lawson Ticket'], (r) => { report = r; });
    assert.equal(report?.handoffUrl, `https://l-tike.com/search/?keyword=${encodeURIComponent('倉木麻衣')}`);
  });
});

describe('searchPlatformsStreaming：取消', () => {
  it('中途 abort → 不再有新的回调', async () => {
    const controller = new AbortController();
    h.eplus.mockImplementation(delayed([makeEvent({ id: 'e1' })], 50));
    h.pia.mockImplementation(async () => {
      controller.abort();
      return [makeEvent({ id: 'p1', platform: 'Ticket Pia' })];
    });

    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ['eplus', 'Ticket Pia'], c.onSource, { signal: controller.signal });

    assert.equal(c.calls.length, 0, 'abort 之后到达的结果不该再灌进 UI');
  });

  it('一开始就是 aborted → 一条都不回调', async () => {
    const controller = new AbortController();
    controller.abort();
    h.eplus.mockResolvedValue([makeEvent({ id: 'e1' })]);

    const c = collector();
    await searchPlatformsStreaming('倉木麻衣', ['eplus'], c.onSource, { signal: controller.signal });

    assert.equal(c.calls.length, 0);
  });
});

describe('searchClientPlatforms：聚合入口的兜底', () => {
  it('一个源失败不影响其他源的结果落地', async () => {
    h.eplus.mockRejectedValue(new Error('eplus 挂了'));
    h.pia.mockResolvedValue([makeEvent({ id: 'p1', platform: 'Ticket Pia' })]);

    const result = await searchClientPlatforms('倉木麻衣', ['eplus', 'Ticket Pia']);

    assert.equal(result.events.length, 1);
    const byPlatform = Object.fromEntries(result.reports.map((r) => [r.platform, r]));
    assert.equal(byPlatform['eplus'].status, 'error');
    assert.match(byPlatform['eplus'].error ?? '', /eplus 挂了/);
    assert.equal(byPlatform['Ticket Pia'].status, 'ok');
  });

  it('跨源同 id 事件去重', async () => {
    h.eplus.mockResolvedValue([makeEvent({ id: 'same' })]);
    h.pia.mockResolvedValue([makeEvent({ id: 'same', platform: 'Ticket Pia' })]);

    const result = await searchClientPlatforms('倉木麻衣', ['eplus', 'Ticket Pia']);

    assert.equal(result.events.length, 1);
    // reports 仍是各平台**原始**命中数,去重只影响展示用的 events。
    assert.equal(result.reports.reduce((n, r) => n + r.count, 0), 2);
  });

  it('标记 servedBy:client,并给每个平台一份 perPlatform', async () => {
    h.eplus.mockResolvedValue([makeEvent({ id: 'e1' })]);

    const result = await searchClientPlatforms('倉木麻衣', ['eplus']);

    assert.equal(result.servedBy, 'client');
    assert.equal(result.reports[0].runtime, 'client');
    assert.deepEqual(result.perPlatform.map((p) => p.platform), ['eplus']);
    assert.match(result.perPlatform[0].handoffUrl ?? '', /eplus\.jp/);
  });

  it('空 query → 空结果,不打任何源', async () => {
    const result = await searchClientPlatforms('  ', ALL);
    assert.deepEqual(result, { events: [], reports: [], perPlatform: [] });
    assert.equal(h.eplus.mock.calls.length, 0);
  });
});

describe('searchAllPlatforms：默认入口', () => {
  it('跨平台同场合并成一张卡,但 reports 保留各平台原始命中数', async () => {
    // 同艺人 + 同日期 + 同会场 → aggregateConcerts 认作同一场真实演出。
    const same = { artistName: '倉木麻衣', date: '2030-08-10', venueName: '大阪国際会議場' };
    h.eplus.mockResolvedValue([makeEvent({ id: 'e1', platform: 'eplus', ...same })]);
    h.pia.mockResolvedValue([makeEvent({ id: 'p1', platform: 'Ticket Pia', ...same })]);

    const result = await searchAllPlatforms('倉木麻衣', ['eplus', 'Ticket Pia']);

    assert.equal(result.events.length, 1, '同一场演出在两平台都有 → 合并成一张卡');
    assert.equal(result.reports.length, 2);
    assert.equal(result.reports.reduce((n, r) => n + r.count, 0), 2, '聚合只影响 events,不该改写 reports');
    assert.deepEqual(result.perPlatform.map((p) => p.platform).sort(), ['Ticket Pia', 'eplus']);
  });

  it('不同场次不合并', async () => {
    h.eplus.mockResolvedValue([makeEvent({ id: 'e1', date: '2030-08-10' })]);
    h.pia.mockResolvedValue([makeEvent({ id: 'p1', platform: 'Ticket Pia', date: '2030-09-01' })]);

    const result = await searchAllPlatforms('倉木麻衣', ['eplus', 'Ticket Pia']);

    assert.equal(result.events.length, 2);
  });
});

describe('hasPlugin', () => {
  it('只认已注册的五个平台', () => {
    for (const p of ['eplus', 'Ticket Pia', 'TicketDive', 'LivePocket', 'Lawson Ticket']) {
      assert.equal(hasPlugin(p), true, `${p} 应已注册`);
    }
    assert.equal(hasPlugin('All'), false, "'All' 是通配符不是平台,别当插件");
    assert.equal(hasPlugin('ぴあ'), false);
  });
});

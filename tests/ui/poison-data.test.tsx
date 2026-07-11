// @vitest-environment jsdom
// 毒性数据全家桶：把抓取层真实出现过的「脏形态」系统性喂给每个渲染面与 ICS 构建面。
// 背景：日历页 Invalid-Date 崩溃(#65)暴露的方法论洞——我们早知道 date='' 这种毒性输入存在
// (ICS 层一个月前就修过)，但从未把它注入所有消费方。此套件保证以后新增视图/构建器时，
// 任何一处对脏字段的裸消费都会在 CI 被抓住，而不是等真机白屏。
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../../src/native', () => ({
  openPurchaseUrl: vi.fn(async () => {}),
  deliverIcs: vi.fn(async () => {}),
}));

import { renderWithI18n, makeEvent, cleanup } from './_helpers';
import type { ComponentProps } from 'react';
import type { ActivityEvent, ExtensionSource } from '../../src/types';
import { favoriteKey } from '../../src/favorites';
import { DiscoverView } from '../../src/components/DiscoverView';
import { CalendarView } from '../../src/components/CalendarView';
import { MyOshiView } from '../../src/components/MyOshiView';
import { EventDetailModal } from '../../src/components/EventDetailModal';
import { buildEventIcs, buildAllFollowedEventsIcs, normalizeIcsTime, foldIcsLine, sortByActionability, primaryDeadline } from '../../src/utils';
import { buildReminderTargets } from '../../src/notifications';
import { upcomingTicketDeadlines } from '../../src/followed';
import { aggregateConcerts } from '../../src/sources/aggregate';

afterEach(cleanup);

// ---- 毒性事件集（每一条都对应真实抓取层出现过/可能出现的形态） ----
const POISON_EVENTS: ActivityEvent[] = [
  // LivePocket/TicketDive 偶发抓不到日期（#65 真机崩溃的元凶）
  makeEvent({ id: 'poison-nodate', artistId: 'art-poison', date: '', time: '', title: '日程未定の公演' }),
  // 一位小时时间（eplus kaien_time 异形）→ 曾产出非法 DTSTART T00
  makeEvent({ id: 'poison-badtime', artistId: 'art-poison', date: '2030-09-12', time: '0:00', venueId: 'v-b' }),
  // 空会场/空地区/空图/空价格
  makeEvent({ id: 'poison-empty', artistId: 'art-poison', date: '2030-10-01', venueName: '', region: '', imageUrl: '', price: '', venueId: 'v-c' }),
  // 超长标题 + ICS 特殊字符（逗号/分号/换行）
  makeEvent({ id: 'poison-long', artistId: 'art-poison', date: '2030-11-01', venueId: 'v-d',
    title: 'ライブ; 超長いタイトル, 改行\nすら入っている'.repeat(6) }),
  // 窗口字段全空/垃圾日期
  makeEvent({ id: 'poison-wingarbage', artistId: 'art-poison', date: '2030-12-01', venueId: 'v-e', ticketWindows: [
    { id: 'pw1', platform: 'eplus', roundType: '', applyStart: 'not-a-date', applyEnd: 'also-garbage' },
    { id: 'pw2', platform: 'eplus', roundType: '先行', applyStart: null, applyEnd: null },
  ] }),
];

const eplusExt: ExtensionSource = {
  id: 'ext-eplus', name: 'eplus', platform: 'eplus', version: '1.0', author: 't',
  isEnabled: true, isInstalled: true, rating: 5, iconType: 'eplus', description: '',
};

describe('毒性数据 × 渲染面（不崩即胜）', () => {
  it('DiscoverView：毒性事件做收藏回退列表渲染', () => {
    const props = {
      events: POISON_EVENTS, searchResults: [], searchReports: [], recentSearches: [],
      searching: false, searchDegraded: false, searchFetchedAt: null, searchIsLive: false,
      extensions: [eplusExt], artists: [], venues: [],
      onSelectEvent: vi.fn(), favorites: POISON_EVENTS.map(favoriteKey),
      onToggleFavorite: vi.fn(), onRunPlatformSearch: vi.fn().mockResolvedValue({ events: [], reports: [] }),
      onClearSearchResults: vi.fn(), oshiColor: '#ec4899',
    };
    const { container } = renderWithI18n(<DiscoverView {...(props as unknown as ComponentProps<typeof DiscoverView>)} />);
    expect(container.querySelector('#discover-view-root')).not.toBeNull();
  });

  it('CalendarView：毒性事件全量进追踪看板（#65 场景泛化）', () => {
    const props = {
      events: POISON_EVENTS, favorites: POISON_EVENTS.map(favoriteKey),
      followedArtists: ['art-poison'], followedVenues: [], activeAlerts: [],
      onSelectEvent: vi.fn(), oshiColor: '#ec4899',
    };
    const { container } = renderWithI18n(<CalendarView {...(props as unknown as ComponentProps<typeof CalendarView>)} />);
    expect(container.querySelector('#calendar-view-root')).not.toBeNull();
  });

  it('MyOshiView：毒性事件艺人被关注（派生记录 + 下一受付）', () => {
    const props = {
      artists: [], venues: [], events: POISON_EVENTS,
      followedArtists: ['art-poison'], followedVenues: [],
      onToggleFollowArtist: vi.fn(), onToggleFollowVenue: vi.fn(), onSelectEvent: vi.fn(),
      onSearchEntity: vi.fn().mockResolvedValue(undefined), lastViewed: {}, onViewEntity: vi.fn(),
      oshiColor: '#ec4899',
    };
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);
    expect(container.querySelector('#oshi-view-root')).not.toBeNull();
  });

  it.each(POISON_EVENTS.map((e) => [e.id, e] as const))('EventDetailModal：毒性事件 %s 直接打开', (_id, event) => {
    const props = {
      event, artists: [], venues: [], onClose: vi.fn(),
      isFavorited: false, onToggleFavorite: vi.fn(),
      isArtistFollowed: false, onToggleFollowArtist: vi.fn(),
      isVenueFollowed: false, onToggleFollowVenue: vi.fn(),
      activeAlerts: [], onToggleAlert: vi.fn(), onEnrichEvent: vi.fn(), oshiColor: '#ec4899',
    };
    const { container } = renderWithI18n(<EventDetailModal {...(props as unknown as ComponentProps<typeof EventDetailModal>)} />);
    expect(container.querySelector('#bottom-sheet-container')).not.toBeNull();
    cleanup();
  });
});

describe('毒性数据 × 纯函数面', () => {
  it('聚合 / 排序 / 雷达 / 提醒目标：全家桶不抛', () => {
    expect(() => aggregateConcerts(POISON_EVENTS)).not.toThrow();
    expect(() => sortByActionability(POISON_EVENTS, '2030-01-01')).not.toThrow();
    expect(() => upcomingTicketDeadlines(POISON_EVENTS, 14, new Date('2030-01-01T00:00:00+09:00'))).not.toThrow();
    for (const e of POISON_EVENTS) {
      expect(() => buildReminderTargets(e)).not.toThrow();
      expect(() => primaryDeadline(e, '2030-01-01')).not.toThrow();
    }
  });
});

describe('毒性数据 × ICS 构建（导出到日历质量）', () => {
  const DT_RE = /^DTSTART(;[^:]+)?:(\d{8}T\d{6}|\d{8})$/;

  it('全量导出：每条 DTSTART 合法 6 位时间、每个 VEVENT 带 VALARM、无日期跳过', () => {
    const ics = buildAllFollowedEventsIcs(POISON_EVENTS);
    expect(ics).toContain('BEGIN:VCALENDAR');
    // 折行还原后逐行校验（续行 = CRLF + 空格）
    const unfolded = ics.replace(/\r\n[ ]/g, '');
    const lines = unfolded.split('\r\n');
    const dtstarts = lines.filter((l) => l.startsWith('DTSTART') && !l.startsWith('DTSTART:19700101'));
    expect(dtstarts.length).toBeGreaterThan(0);
    for (const line of dtstarts) expect(line).toMatch(DT_RE);
    // 无日期事件不产出 concert VEVENT
    expect(unfolded).not.toContain('poison-nodate-concert');
    // '0:00' 规范化为 000000
    expect(unfolded).toContain('DTSTART;TZID=Asia/Tokyo:20300912T000000');
    // VALARM 数量 = VEVENT 数量
    expect((unfolded.match(/BEGIN:VALARM/g) || []).length).toBe((unfolded.match(/BEGIN:VEVENT/g) || []).length);
    // RFC 5545：物理行都 ≤75 字节
    for (const physical of ics.split('\r\n')) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }
  });

  it('单事件导出：毒性集要么空串要么合法', () => {
    for (const e of POISON_EVENTS) {
      const ics = buildEventIcs(e, 'concert', new Date('2030-01-01T00:00:00Z'));
      if (!ics) continue; // 无日期 → 正确地拒绝产出
      const unfolded = ics.replace(/\r\n[ ]/g, '');
      const dt = unfolded.split('\r\n').find((l) => l.startsWith('DTSTART;'));
      expect(dt).toMatch(DT_RE);
      expect(unfolded).toContain('BEGIN:VALARM');
    }
  });

  it('normalizeIcsTime 表驱动', () => {
    expect(normalizeIcsTime('')).toBe('00:00');
    expect(normalizeIcsTime(undefined)).toBe('00:00');
    expect(normalizeIcsTime('0:00')).toBe('00:00');
    expect(normalizeIcsTime('9:05')).toBe('09:05');
    expect(normalizeIcsTime('18:00')).toBe('18:00');
    expect(normalizeIcsTime('99:99')).toBe('23:59'); // 钳制
    expect(normalizeIcsTime('garbage')).toBe('00:00');
  });

  it('foldIcsLine：长日文行折后每行 ≤75 字节且可无损还原', () => {
    const line = `SUMMARY:${'超長いタイトルのライブ公演、'.repeat(12)}`;
    const folded = foldIcsLine(line);
    for (const physical of folded.split('\r\n')) {
      expect(new TextEncoder().encode(physical).length).toBeLessThanOrEqual(75);
    }
    expect(folded.replace(/\r\n[ ]/g, '')).toBe(line);
    // 短行原样返回
    expect(foldIcsLine('VERSION:2.0')).toBe('VERSION:2.0');
  });
});

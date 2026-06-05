// 纯 TS 测试夹具（无 React/RTL 依赖），node 与 jsdom 测试都可用。
import type { ActivityEvent, TicketWindow } from '../src/types';

export function makeEvent(overrides: Partial<ActivityEvent> = {}): ActivityEvent {
  return {
    id: 'eplus-1',
    title: 'FRUITS ZIPPER LIVE',
    artistId: 'art-fz',
    artistName: 'FRUITS ZIPPER',
    venueId: 'ven-gt',
    venueName: '東京ガーデンシアター',
    date: '2030-08-10',
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

export function makeWindow(overrides: Partial<TicketWindow> = {}): TicketWindow {
  return {
    id: 'w-1',
    platform: 'eplus',
    roundType: '一般',
    applyStart: '2030-05-01T10:00:00+09:00',
    applyEnd: '2030-05-20T23:59:00+09:00',
    ...overrides,
  };
}

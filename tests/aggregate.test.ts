import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import type { ActivityEvent, TicketPlatform, TicketWindow } from '../src/types';
import { aggregateConcerts, eventPlatforms, venueCore } from '../src/sources/aggregate';

let seq = 0;
function ev(over: Partial<ActivityEvent> & { platform: TicketPlatform }): ActivityEvent {
  seq += 1;
  const id = over.id || `${over.platform}-${seq}`;
  const windows: TicketWindow[] = over.ticketWindows || [{
    id: `${id}-w0`,
    platform: over.platform,
    roundType: '先行',
    applyStart: null,
    applyEnd: null,
  }];
  return {
    id,
    title: over.title || 'LIVE',
    artistId: 'a',
    artistName: over.artistName || 'いきものがかり',
    venueId: 'v',
    venueName: over.venueName ?? '東京ドーム',
    date: over.date ?? '2026-07-18',
    time: over.time ?? '',
    region: over.region ?? '',
    platform: over.platform,
    price: '—',
    imageUrl: over.imageUrl || 'https://images.unsplash.com/placeholder.jpg',
    timeline: {},
    ticketWindows: windows,
    originalUrl: over.originalUrl || `https://example.com/${id}`,
    description: '',
    category: 'J-Pop',
    tags: over.tags || [],
    sourceKind: over.sourceKind || 'live',
    lastFetchedAt: over.lastFetchedAt || '2026-05-29T00:00:00.000Z',
  };
}

describe('venueCore', () => {
  it('strips parenthetical area and punctuation', () => {
    assert.equal(venueCore('東京ドーム (東京都)'), '東京ドーム');
    assert.equal(venueCore('東京ドーム（東京都）'), '東京ドーム');
    assert.equal(venueCore('Zepp Haneda・TOKYO'), 'zepphanedatokyo');
  });
});

describe('eventPlatforms', () => {
  it('lists platforms from event + windows, ordered by priority', () => {
    const platforms = eventPlatforms({
      platform: 'Ticket Pia',
      ticketWindows: [
        { id: '1', platform: 'Ticket Pia', roundType: '先行', applyStart: null, applyEnd: null },
        { id: '2', platform: 'eplus', roundType: '抽選', applyStart: null, applyEnd: null },
      ],
    });
    assert.deepEqual(platforms, ['eplus', 'Ticket Pia']);
  });
});

describe('aggregateConcerts', () => {
  it('merges same artist+date+venue across platforms into one event, unioning windows', () => {
    const eplus = ev({ platform: 'eplus', venueName: '東京ドーム', title: 'いきものがかり LIVE TOUR 2026' });
    const pia = ev({ platform: 'Ticket Pia', venueName: '東京ドーム（東京都）', title: '東京ドーム公演' });

    const result = aggregateConcerts([eplus, pia]);

    assert.equal(result.length, 1);
    const [merged] = result;
    assert.ok(merged.id.startsWith('agg-'), `expected agg- id, got ${merged.id}`);
    assert.equal(merged.ticketWindows?.length, 2);
    assert.deepEqual(eventPlatforms(merged), ['eplus', 'Ticket Pia']);
    // primary = eplus (higher priority); longest title wins
    assert.equal(merged.platform, 'eplus');
    assert.equal(merged.title, 'いきものがかり LIVE TOUR 2026');
  });

  it('does NOT merge same artist+date at different venues', () => {
    const tokyo = ev({ platform: 'eplus', venueName: '東京ドーム' });
    const osaka = ev({ platform: 'Ticket Pia', venueName: '大阪城ホール' });
    const result = aggregateConcerts([tokyo, osaka]);
    assert.equal(result.length, 2);
  });

  it('does NOT merge when the date is missing (cannot be confident)', () => {
    const a = ev({ platform: 'eplus', venueName: '東京ドーム', date: '' });
    const b = ev({ platform: 'Ticket Pia', venueName: '東京ドーム', date: '' });
    const result = aggregateConcerts([a, b]);
    assert.equal(result.length, 2);
  });

  it('does NOT merge on a too-generic venue (prefecture only)', () => {
    const a = ev({ platform: 'eplus', venueName: '東京' });
    const b = ev({ platform: 'Ticket Pia', venueName: '東京' });
    const result = aggregateConcerts([a, b]);
    assert.equal(result.length, 2);
  });

  it('keeps a single-platform event with its native id (no agg- prefix)', () => {
    const only = ev({ platform: 'eplus', id: 'eplus-solo', venueName: '東京ドーム' });
    const [result] = aggregateConcerts([only]);
    assert.equal(result.id, 'eplus-solo');
  });

  it('passes through non-aggregatable (no-date) events untouched', () => {
    const dateless = ev({ platform: 'eplus', id: 'lp-x', date: '', venueName: '東京ドーム' });
    const live = ev({ platform: 'Ticket Pia', venueName: '東京ドーム' });
    const result = aggregateConcerts([dateless, live]);
    assert.equal(result.length, 2);
    assert.ok(result.some((e) => e.id === 'lp-x'));
  });

  it('is idempotent (re-aggregating an aggregated list is stable)', () => {
    const eplus = ev({ platform: 'eplus', venueName: '東京ドーム' });
    const pia = ev({ platform: 'Ticket Pia', venueName: '東京ドーム' });
    const once = aggregateConcerts([eplus, pia]);
    const twice = aggregateConcerts(once);
    assert.equal(twice.length, 1);
    assert.equal(twice[0].id, once[0].id);
    assert.equal(twice[0].ticketWindows?.length, once[0].ticketWindows?.length);
  });
});

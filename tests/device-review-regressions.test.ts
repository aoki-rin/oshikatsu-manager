import { describe, expect, it } from 'vitest';
import { makeEvent } from './_fixtures';
import { aggregateConcerts } from '../src/sources/aggregate';
import { favoriteAliases, isFavorited, migrateFavorites, legacyFavoriteKey } from '../src/favorites';

const live = (id: string, time: string, platform: 'LivePocket' | 'Ticket Pia' | 'eplus' = 'LivePocket') => makeEvent({
  id, time, platform, artistName: '闇雲', date: '2026-09-23', venueName: '池袋SOUND PEACE',
  ticketWindows: [],
});

describe('device review: separate performances', () => {
  it('keeps the real LivePocket 12:50 and 16:50 shows separate, including favorites', () => {
    const a = live('lp-rggm4', '12:50'), b = live('lp-cw4vm', '16:50');
    expect(aggregateConcerts([a, b])).toHaveLength(2);
    expect(isFavorited(b, favoriteAliases(a))).toBe(false);
  });
  it('does not merge different same-platform performances even if times are unknown', () => {
    expect(aggregateConcerts([live('lp-a', ''), live('lp-b', '')])).toHaveLength(2);
  });
  it('unknown cross-platform time cannot bridge two known performances regardless of order', () => {
    const a = live('lp-a', '12:50'), b = live('lp-b', '16:50'), c = live('pia-c', '', 'Ticket Pia');
    for (const xs of [[a,b,c],[c,a,b],[b,c,a]]) {
      const out = aggregateConcerts(xs);
      expect(out).toHaveLength(3);
    }
  });
  it('retains cross-platform merging, unique aggregate ids and favorite aliases for separate shows', () => {
    const a = live('lp-a', '12:50'), b = live('lp-b', '16:50');
    const out = aggregateConcerts([a,b,live('pia-a','12:50','Ticket Pia'),live('pia-b','16:50','Ticket Pia')]);
    expect(out).toHaveLength(2);
    expect(new Set(out.map(e=>e.id)).size).toBe(2);
    expect(out.filter(e=>isFavorited(e,favoriteAliases(a)))).toHaveLength(1);
    expect(aggregateConcerts([...out,a,b])).toHaveLength(2);
  });
});

it('migrates legacy broad favorites using the exact cached id, without favoriting the evening show', () => {
  const a = live('lp-rggm4','12:50'), b = live('lp-cw4vm','16:50');
  const favorites = migrateFavorites([a,b], [legacyFavoriteKey(a), a.id]);
  expect(isFavorited(a,favorites)).toBe(true);
  expect(isFavorited(b,favorites)).toBe(false);
  expect(favorites.some(k=>k.startsWith('fav:'))).toBe(false);
});

import evidence from '../docs/reviews/2026-09-13-device-live/evidence.json';
import { parseEplusSearch } from '../src/sources/eplus';
import { dedupeEvents } from '../src/sources/shared';

it('keeps both real MARQUEE Vol.344 and Vol.345 through eplus parsing and deduplication', () => {
  const html = `<script type="application/json">${JSON.stringify({data:{record_list:evidence.eplusIdentityCollision.map(record=>({...record,kanren_uketsuke_koen_list:[{uketsuke_name_pc:"受付",uketsuke_end_datetime:"20260911180000"}]}))}})}</script>`;
  const parsed = parseEplusSearch(html, 'アイドル');
  expect(new Set(parsed.map(e=>e.eventId)).size).toBe(2);
  const events = parsed.map(e=>makeEvent({id:e.eventId,time:e.time,title:e.title,ticketWindows:e.ticketWindows}));
  expect(dedupeEvents(events)).toHaveLength(2);
  expect(new Set(parsed.flatMap(e=>e.ticketWindows.map(w=>w.id))).size).toBe(parsed.flatMap(e=>e.ticketWindows).length);
});

import { migrateEplusEvent } from '../src/sources/eplus';
it('migrates the cached eplus performance by its exact URL, retaining its favorite and old reminder ids', () => {
  const old = makeEvent({id:'eplus-202963-20260912-1500320',platform:'eplus',date:'2026-09-12',time:'11:00',
    originalUrl:'https://eplus.jp/sf/detail/2029630001-P0030558P021001',
    ticketWindows:[{id:'old-window',platform:'eplus',roundType:'受付',applyStart:null,applyEnd:null}]});
  const migrated = migrateEplusEvent(old);
  expect(migrated.id).not.toBe(old.id);
  expect(isFavorited(migrated,favoriteAliases(old))).toBe(true);
  expect(migrated.ticketWindows![0].previousIds).toContain('old-window');
  expect(migrateEplusEvent(migrated)).toBe(migrated);
});

import { buildAllFollowedEventsIcs, buildEventIcs } from '../src/utils';
import { makeWindow } from './_fixtures';
it('exports the real 18:00 deadline rather than 23:59, in batch and single exports', () => {
  const event = makeEvent({ticketWindows:[evidence.calendarDeadline.sourceWindow],timeline:{lotteryEndDate:'2026-09-30'}});
  for (const ics of [buildAllFollowedEventsIcs([event]),buildEventIcs(event,'lottery_end')]) {
    expect(ics).toContain('DTSTART;TZID=Asia/Tokyo:20260930T180000');
    expect(ics).not.toContain('20260930T235900');
  }
});
it('exports every round and result/payment timestamp, including UTC and midnight boundaries', () => {
  const event=makeEvent({date:'',ticketWindows:[makeWindow({id:'a',applyStart:'2030-09-01T01:00:00Z',applyEnd:'2030-09-02T23:59:00+09:00',resultStart:'2030-09-04T15:00:00+09:00',resultEnd:'2030-09-05T18:00:00+09:00'}),makeWindow({id:'b',applyEnd:'2030-09-08T17:00:00+09:00'})]});
  const ics=buildAllFollowedEventsIcs([event]);
  for(const ts of ['20300901T100000','20300902T235900','20300904T150000','20300905T180000','20300908T170000'])expect(ics).toContain('DTSTART;TZID=Asia/Tokyo:'+ts);
  expect(ics).toContain('DTEND;TZID=Asia/Tokyo:20300903T001400');
});
it('exports a date with unknown concert time as all-day, without inventing midnight or 18:00', () => {
  const event=makeEvent({date:'2030-12-31',time:'',ticketWindows:[],timeline:{}});
  for(const ics of [buildAllFollowedEventsIcs([event]),buildEventIcs(event)]) {
    expect(ics).toContain('DTSTART;VALUE=DATE:20301231');
    expect(ics).toContain('DTEND;VALUE=DATE:20310101');
    expect(ics).not.toContain('20301231T');
  }
});

import { parseLawsonSearch } from '../src/sources/lawsonParser';
import { buildReminderTargets } from '../src/notifications';
it('expands explicit Lawson performance dates and does not invent a midnight concert reminder', () => {
  const html = `<div class="ResultBox prfSummaryItem"><h3 class="ResultBox__title">あいみょん</h3>
  <a href="/artist/000000000608246/">artist</a>
  <dl class="ResultBox__informations" data-prfdate="20261130,20261201" data-lcode="70896">
  <dt>公演日：</dt><dt>2026/11/30(月) ～ 2026/12/1(火)</dt><dt>会場：</dt><dt>日本武道館（東京都）</dt></dl></div>`;
  const events=parseLawsonSearch(html,'あいみょん');
  expect(events.map(e=>e.date)).toEqual(['2026-11-30','2026-12-01']);
  expect(new Set(events.map(e=>e.id)).size).toBe(2);
  for(const e of events){expect(e.time).toBe('');expect(buildReminderTargets(e).some(t=>t.type==='concert')).toBe(false);}
});

import { findActiveReminder } from '../src/notifications';
it('separate daytime and evening concerts have separate system notification ids', () => {
  const a=buildReminderTargets(live('lp-a','12:50')).find(t=>t.type==='concert')!;
  const b=buildReminderTargets(live('lp-b','16:50')).find(t=>t.type==='concert')!;
  expect(a.notificationId).not.toBe(b.notificationId);
  expect(findActiveReminder(b,[{eventId:a.eventId,type:a.type,scheduleAt:a.scheduleAt,notificationId:a.notificationId} as any])).toBeUndefined();
  expect(findActiveReminder(a,[{eventId:a.eventId,type:a.type,scheduleAt:a.scheduleAt,notificationId:123} as any])?.notificationId).toBe(123);
});

import { migrateLawsonEvent } from '../src/sources/lawsonParser';
it('expands saved Lawson multi-date records without introducing a shared favorite alias', () => {
  const events=migrateLawsonEvent(evidence.lawsonEvent as any);
  expect(events.map(e=>e.date)).toEqual(['2026-11-30','2026-12-01']);
  expect(isFavorited(events[1],favoriteAliases(events[0]))).toBe(false);
  expect(events[0].ticketWindows![0].previousIds).toContain(evidence.lawsonEvent.ticketWindows[0].id);
});

import { refreshSearchCache, refreshFavorites } from '../src/sources/cache';
it('fresh search repairs a saved mismerged card and keeps precise favorites independent', () => {
  const a=live('lp-rggm4','12:50'),b=live('lp-cw4vm','16:50');
  const old=makeEvent({...a,id:'agg-old',memberIds:[a.id,b.id]});
  const refreshed=refreshSearchCache([a,b],[old]);
  expect(refreshed.events.map(e=>e.id).sort()).toEqual([a.id,b.id].sort());
  const favorites=refreshFavorites([a.id],refreshed.replacements);
  expect(isFavorited(b,favorites)).toBe(false);
  expect(refreshFavorites(['agg-old'],refreshed.replacements)).toEqual([a.id,b.id]);
});
it('repeated streamed searches preserve separate show ids and enriched windows', () => {
  const a=live('lp-a','12:50'),b=live('lp-b','16:50'),p=live('pia-a','12:50','Ticket Pia');
  const first=refreshSearchCache([a,b,p],[]).events;
  const second=refreshSearchCache([a,b,p],first).events;
  expect(second.map(e=>e.id)).toEqual(first.map(e=>e.id));
  expect(second).toHaveLength(2);
});

it('cached cross-platform grouping still returns ids of cards present in the current search', () => {
  const cached=live('pia-a','12:50','Ticket Pia'), fresh=live('lp-a','12:50');
  const result=refreshSearchCache([fresh],[cached]);
  expect(result.searchIds).toEqual(result.events.map(e=>e.id));
  expect(result.searchIds).toHaveLength(1);
});

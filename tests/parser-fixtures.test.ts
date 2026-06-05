import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { parseEplusSearch } from '../src/sources/eplus';
import { parsePiaArtistCd, parsePiaRlsInfo } from '../src/sources/pia';
import { parseTicketDiveSearch, parseTicketDiveDetailWindow } from '../src/sources/ticketdive';
import { parseLawsonSearch } from '../src/sources/lawson';
import { parseLivePocketSearch, parseLivePocketDetailWindow } from '../src/sources/livepocket';
import { canonicalArtistId, canonicalVenueId } from '../src/sources/shared';

// These fixtures mirror the real structure of each platform's response so that a
// silent parser break (platform redesign, or a refactor) is caught immediately.

describe('eplus search parser', () => {
  // eplus embeds a single <script type="application/json"> whose data.record_list
  // holds events, each with kanren_uketsuke_koen_list = the receive (受付) rounds.
  const html = `
    <html><head><meta name="robots" content="all"></head><body>
    <script type="application/json">${JSON.stringify({
      data: {
        so_kensu: 1,
        record_list: [
          {
            kogyo_code: 'KG1',
            koen_code: 'KO1',
            koenbi_term: '20260718',
            kaien_time: '1800',
            kanren_kogyo_sub: { kogyo_name_1: 'いきものがかり', kogyo_name_2: 'ツアー2026' },
            kanren_venue: { venue_name: '福岡サンパレス', todofuken_name: '福岡県', venue_code: 'V1' },
            koen_detail_url_pc: '/sf/detail/abc',
            kanren_uketsuke_koen_list: [
              {
                uketsuke_name_pc: '先行抽選',
                hambai_hoho_label: '抽選',
                uketsuke_start_datetime: '20260520120000',
                uketsuke_end_datetime: '20260603235900',
                info_kokai_start_datetime: '20260605150000',
                info_kokai_end_datetime: '20260606230000',
              },
            ],
          },
        ],
      },
    })}</script>
    <footer class="footer__bottom">© eplus</footer>
    </body></html>`;

  it('parses embedded JSON into events with receive windows (JST)', () => {
    const events = parseEplusSearch(html, 'いきものがかり');
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.eventId, 'eplus-KG1-20260718-V1');
    assert.equal(e.title, 'いきものがかり ツアー2026');
    assert.equal(e.date, '2026-07-18');
    assert.equal(e.time, '18:00');
    assert.equal(e.venue, '福岡サンパレス');
    assert.equal(e.prefecture, '福岡県');
    assert.equal(e.ticketWindows.length, 1);
    assert.equal(e.ticketWindows[0].applyStart, '2026-05-20T12:00:00+09:00');
    assert.equal(e.ticketWindows[0].applyEnd, '2026-06-03T23:59:00+09:00');
    assert.equal(e.ticketWindows[0].resultStart, '2026-06-05T15:00:00+09:00');
    // eplus gives relative detail paths; they MUST be absolutized or the device
    // opens http://localhost/sf/... instead of the real ticket page.
    assert.equal(e.detailUrl, 'https://eplus.jp/sf/detail/abc');
    assert.equal(e.ticketWindows[0].applyUrl, 'https://eplus.jp/sf/detail/abc');
  });

  it('returns [] for an empty result page (so_kensu 0)', () => {
    const empty = `<script type="application/json">${JSON.stringify({ data: { so_kensu: 0, record_list: [] }, error: null })}</script>`;
    assert.deepEqual(parseEplusSearch(empty, 'no-one'), []);
  });
});

describe('Ticket Pia search parser', () => {
  it('extracts artistCd from the search_all inline script', () => {
    const searchHtml = 'var artistArray = "[score: 9, artistcd: 49240081, artistnm: いきものがかり]";';
    assert.equal(parsePiaArtistCd(searchHtml), '49240081');
    assert.equal(parsePiaArtistCd('<html>no artist here</html>'), null);
  });

  it('parses rlsInfo sales_data sections into events with rounds', () => {
    const rls = `
      <section class="sales_data">
        <h3 class="sales_data_title">いきものがかり 超いきものまつり</h3>
        <div class="event_link">
          <ul>
            <li class="is_title">「チケットぴあ」プレリザーブ先行</li>
            <li class="is_status">受付中</li>
          </ul>
          <a href="https://t.pia.jp/pia/event/event.do?eventBundleCd=BUNDLE1" itemprop="url">申込</a>
          <span itemprop="startDate" datetime="2026-07-18T18:00:00">公演</span>
          <div class="is_place"><span itemprop="name">福岡サンパレス</span></div>
        </div>
      </section>`;
    const events = parsePiaRlsInfo(rls, 'いきものがかり');
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.id, 'pia-BUNDLE1');
    assert.equal(e.title, 'いきものがかり 超いきものまつり');
    assert.equal(e.date, '2026-07-18');
    assert.equal(e.venueName, '福岡サンパレス');
    assert.equal(e.platform, 'Ticket Pia');
    assert.equal(e.ticketWindows?.length, 1);
    assert.equal(e.ticketWindows?.[0].roundType, 'プレリザーブ先行');
    assert.equal(e.ticketWindows?.[0].statusText, '受付中');
    // purchaseUrl 必须是 Pia app 能深链的 /pia/event/event.do（而非浏览器-only 的 ticketInformation/search 页）
    assert.equal(e.purchaseUrl, 'https://t.pia.jp/pia/event/event.do?eventBundleCd=BUNDLE1');
  });
});

describe('TicketDive search parser', () => {
  it('parses __NEXT_DATA__ eventList and converts UTC to JST', () => {
    const nextData = {
      props: { pageProps: { __superjsonProps: { json: { eventList: [
        {
          id: 'E1',
          url: 'event-slug',
          title: '地下アイドル定期公演',
          venueName: '新宿LOFT',
          salesStatus: 'applied',
          startEventDate: '2026-07-17T09:00:00.000Z',
          imageSource: 'https://img.example/x.jpg',
        },
      ] } } } },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const events = parseTicketDiveSearch(html, '地下アイドル');
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.id, 'td-E1');
    assert.equal(e.title, '地下アイドル定期公演');
    assert.equal(e.venueName, '新宿LOFT');
    assert.equal(e.date, '2026-07-17');
    assert.equal(e.time, '18:00');
    assert.equal(e.platform, 'TicketDive');
    assert.equal(e.ticketWindows?.[0].statusText, '受付中');
    assert.equal(e.originalUrl, 'https://ticketdive.com/event/event-slug');
  });
});

describe('Lawson search parser (fixture)', () => {
  // 真实结构：<section class="search-result-item"> 内含 公演日 / 会場 / 販売方法 / 受付期間 / 申込.
  const html = `
    <section class="search-result-item">
      <h3><a href="/event/mevent/?mid=12345">YOASOBI ARENA TOUR 2026</a></h3>
      <dl>
        <dt>公演日：</dt><dd>2026/8/15(土)</dd>
        <dt>会場：</dt><dd>さいたまスーパーアリーナ（埼玉県）</dd>
      </dl>
      <h4>販売方法</h4>
      <ul><li>抽選</li></ul>
      <h4>受付期間</h4>
      <p>2026/6/20(土) 12:00 ～ 2026/7/2(木) 23:59</p>
      <h4>申込/詳細</h4>
      <a href="/order/?gLcode=98765">お申し込みはこちら</a>
    </section>`;

  it('parses a result section into a live event with one receive window (JST)', () => {
    const events = parseLawsonSearch(html, 'YOASOBI', '2026-06-04T00:00:00.000Z');
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.id, 'lawson-12345');
    assert.equal(e.title, 'YOASOBI ARENA TOUR 2026');
    assert.equal(e.date, '2026-08-15');
    assert.equal(e.venueName, 'さいたまスーパーアリーナ（埼玉県）');
    assert.equal(e.ticketWindows?.[0].id, 'lawson-12345-0');
    assert.equal(e.ticketWindows?.[0].applyStart, '2026-06-20T12:00:00+09:00');
    assert.equal(e.ticketWindows?.[0].applyEnd, '2026-07-02T23:59:00+09:00');
    // 申込链接必须被绝对化（否则真机会打开 http://localhost/order...）
    assert.equal(e.purchaseUrl, 'https://l-tike.com/order/?gLcode=98765');
  });

  it('returns [] for a zero-result page', () => {
    assert.deepEqual(parseLawsonSearch('<p>検索結果：0件</p>', 'no-one'), []);
  });
});

describe('LivePocket search parser (fixture)', () => {
  const html = `
    <li class="item">
      <a href="https://t.livepocket.jp/e/yoa-arena">
        <img class="thumb-vertical" src="https://img.example/yoa.jpg">
        <span class="title-inner">YOASOBI SPECIAL LIVE</span>
      </a>
      <ul class="status-on_sale"><li>受付中</li><li>12/25</li></ul>
      <div class="info">東京都・Zepp Tokyo</div>
    </li>`;

  it('parses an item card into a live event (M/D inferred, year-agnostic check)', () => {
    const events = parseLivePocketSearch(html, 'YOASOBI');
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.id, 'lp-yoa-arena');
    assert.equal(e.title, 'YOASOBI SPECIAL LIVE');
    assert.equal(e.artistName, 'YOASOBI');
    assert.match(e.venueName, /東京都/);
    assert.equal(e.date.slice(5), '12-25'); // 年份按今年/明年推断，仅校验月日，避免随运行日期漂移
    assert.equal(e.ticketWindows?.[0].id, 'lp-yoa-arena-0');
    assert.equal(e.ticketWindows?.[0].statusText, '受付中');
  });

  it('drops cards that do not match the queried artist (no relabeling)', () => {
    const other = html.replace('YOASOBI SPECIAL LIVE', '別アーティストの公演');
    assert.deepEqual(parseLivePocketSearch(other, 'YOASOBI'), []);
  });
});

describe('ticket id 稳定性 (issue #5)', () => {
  // 旧 bug：id 把 CJK 名剥成空（如 iki-TicketPia-）。#24 归一 id 后 CJK 名应原样保留。
  it('CJK 艺人 / 会场名不再被剥成空 id', () => {
    assert.equal(canonicalArtistId('いきものがかり'), 'artist-いきものがかり');
    assert.equal(canonicalVenueId('福岡サンパレス'), 'venue-福岡サンパレス');
  });

  it('ticket_window id 确定且非空（同输入重复解析一致）', () => {
    const lawson = `
      <section class="search-result-item">
        <h3><a href="/event/mevent/?mid=12345">X</a></h3>
        <dl><dt>公演日：</dt><dd>2026/8/15(土)</dd><dt>会場：</dt><dd>会場A</dd></dl>
        <h4>受付期間</h4><p>2026/6/20(土) 12:00 ～ 2026/7/2(木) 23:59</p>
        <h4>申込/詳細</h4><a href="/order/?gLcode=1">申込</a>
      </section>`;
    const a = parseLawsonSearch(lawson, 'X', '2026-06-04T00:00:00.000Z');
    const b = parseLawsonSearch(lawson, 'X', '2026-06-04T00:00:00.000Z');
    assert.match(a[0].ticketWindows?.[0].id ?? '', /^lawson-12345-0$/);
    assert.equal(a[0].ticketWindows?.[0].id, b[0].ticketWindows?.[0].id);
  });
});

describe('LivePocket detail window (fixture, issue A1)', () => {
  // 详情页内嵌实体编码 JSON：group_starttime/endtime + 各 plan starttime/endtime（JST）。
  it('parses earliest start / latest end across plans (JST)', () => {
    const html = `<script>x = &quot;a&quot;</script>
      &quot;group_starttime&quot;:&quot;2026-04-18 12:00:00&quot;,&quot;group_endtime&quot;:&quot;2026-06-13 18:00:59&quot;
      ,&quot;price&quot;:4950,&quot;starttime&quot;:&quot;2026-04-20 10:00:00&quot;,&quot;endtime&quot;:&quot;2026-06-10 23:59:00&quot;`;
    const w = parseLivePocketDetailWindow(html);
    assert.equal(w.applyStart, '2026-04-18T12:00:00+09:00');
    assert.equal(w.applyEnd, '2026-06-13T18:00:59+09:00');
  });

  it('returns nulls when no sale window present', () => {
    assert.deepEqual(parseLivePocketDetailWindow('<html>no json here</html>'), { applyStart: null, applyEnd: null });
  });
});

describe('TicketDive detail window (fixture, issue A1)', () => {
  // 详情页 __NEXT_DATA__ 的 eventDetail.ticketInfoList[].startApply/endApply（UTC → JST）。
  it('parses earliest startApply / latest endApply (UTC→JST)', () => {
    const nextData = { props: { pageProps: { __superjsonProps: { json: { eventDetail: { ticketInfoList: [
      { startApply: '2026-05-30T13:00:00.000Z', endApply: '2026-06-05T14:59:59.000Z' },
      { startApply: '2026-05-28T10:00:00.000Z', endApply: '2026-06-04T10:00:00.000Z' },
    ] } } } } } };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const w = parseTicketDiveDetailWindow(html);
    assert.equal(w.applyStart, '2026-05-28T19:00:00+09:00'); // 2026-05-28T10:00Z + 9h
    assert.equal(w.applyEnd, '2026-06-05T23:59:59+09:00');   // 2026-06-05T14:59:59Z + 9h
  });

  it('returns nulls when __NEXT_DATA__ missing', () => {
    assert.deepEqual(parseTicketDiveDetailWindow('<html>nope</html>'), { applyStart: null, applyEnd: null });
  });
});

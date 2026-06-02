import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseEplusSearch } from '../src/sources/eplus';
import { parsePiaArtistCd, parsePiaRlsInfo } from '../src/sources/pia';
import { parseTicketDiveSearch } from '../src/sources/ticketdive';

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

import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { parseEplusSearch } from '../src/sources/eplus';
import { parsePiaArtistCd, parsePiaArtistInfo, parsePiaRlsInfo } from '../src/sources/pia';
import { parseTicketDiveSearch, parseTicketDiveDetailWindow } from '../src/sources/ticketdive';
import { parseLawsonSearch } from '../src/sources/lawson';
import { parseLivePocketSearch, parseLivePocketDetailWindow, parseLivePocketDetailRounds, toNewLivePocketUrl } from '../src/sources/livepocket';
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

  it('extracts alphanumeric artistCd + real artist name (NFKC-normalized)', () => {
    // 实测：cd 可带字母前缀（M4140001），artistnm 为全角。旧正则 \d+ 会漏配 → 该艺人「无结果」。
    const searchHtml =
      'var artistArray = "[score: 2.08, artistcd: M4140001, artistnm: ＦＲＵＩＴＳ ＺＩＰＰＥＲ, artistkn: フルーツジッパー, title: null]";';
    const info = parsePiaArtistInfo(searchHtml);
    assert.equal(info?.cd, 'M4140001');
    assert.equal(info?.name, 'FRUITS ZIPPER');
    assert.equal(parsePiaArtistCd(searchHtml), 'M4140001');
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

describe('LivePocket search parser (fixture, 2026-07 新版站点)', () => {
  // 按 livepocket.jp/event/search 真实结构裁剪：结果卡 = event-card-list__item；
  // 页面下方「ピックアップ/新着」轮播用别的 item 类 + --sp-column 修饰，必须整体排除。
  const resultCard = (slug: string, title: string, cast: string) => `
    <li class="event-card-list__item">
      <a class="event-card" data-turbo="false" href="/e/${slug}">
        <div class="event-card__image-box">
          <span class="tag-normal-primary event-card__tag">販売中</span>
          <div class="event-card__image"><img alt="" src="https://livepocket.jp/public/event_image/${slug}.webp" /></div>
        </div>
        <div class="event-card__info">
          <h3 class="event-card__title">${title}</h3>
          <p class="event-card__text event-card__text--date"><span class="event-card__date">日程</span> 2026年3月28日(土)</p>
          <p class="event-card__text"><span class="event-card__time">時間</span> 18:00〜</p>
          <p class="event-card__text"><span class="event-card__place">会場</span> オンラインイベント（東京都）</p>
          <p class="event-card__text event-card__text--cast"><span class="event-card__cast">出演者</span> ${cast}</p>
        </div>
      </a>
    </li>`;
  const html = `
    <ul class="event-card-list">
      ${resultCard('oi4sy', '松本かれん生誕2026 オンラインカンパ', '松本かれん / FRUITS ZIPPER')}
      ${resultCard('other1', 'ぱっちわーく コピーダンス単独公演', 'りん / りこ / ぱっちわーく')}
    </ul>
    <section class="event-list-pickup"><ul><li class="event-list-pickup__item">
      <a class="event-card event-card event-card--sp-column" href="/e/pickup-noise">
        <h3 class="event-card__title">FRUITS ZIPPER PICKUP（轮播噪音，不得入结果）</h3>
      </a>
    </li></ul></section>`;

  it('解析结果卡：完整年份日期/時間/会場+地区/出演者→平台真实艺人名/状态 tag/相对链接补全', () => {
    const events = parseLivePocketSearch(html, 'FRUITS ZIPPER');
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.id, 'lp-oi4sy');
    assert.equal(e.title, '松本かれん生誕2026 オンラインカンパ');
    assert.equal(e.date, '2026-03-28'); // 新站带年份，不再推断
    assert.equal(e.time, '18:00');
    assert.equal(e.venueName, 'オンラインイベント');
    assert.equal(e.region, '東京都');
    assert.equal(e.artistName, 'FRUITS ZIPPER'); // 出演者列表里匹配查询的真实名
    assert.equal(e.artistSource, 'platform');
    assert.equal(e.originalUrl, 'https://livepocket.jp/e/oi4sy'); // 相对 href 补全到新域名
    assert.equal(e.ticketWindows?.[0].id, 'lp-oi4sy-0');
    assert.equal(e.ticketWindows?.[0].statusText, '販売中');
  });

  it('出演者不含查询词的卡被过滤（不冒名顶替）；轮播卡结构性排除', () => {
    const events = parseLivePocketSearch(html, 'FRUITS ZIPPER');
    assert.ok(!events.some((e) => e.id === 'lp-other1'), '翻跳团卡应被相关性过滤');
    assert.ok(!events.some((e) => e.id === 'lp-pickup-noise'), '轮播噪音卡应被容器范围排除');
  });

  it('toNewLivePocketUrl：旧域名链接改写到新站', () => {
    assert.equal(toNewLivePocketUrl('https://t.livepocket.jp/e/abc'), 'https://livepocket.jp/e/abc');
    assert.equal(toNewLivePocketUrl('https://livepocket.jp/e/abc'), 'https://livepocket.jp/e/abc');
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

describe('LivePocket detail rounds (fixture, 2026-07 新版 #ticket 区)', () => {
  // 新版详情页每轮一个 event-detail-ticket__item：轮次名 + 状态 tag + 販売受付期間 起〜止。
  // 按真实页面（/e/vpkyj）裁剪。
  const html = `
    <ul class="event-detail-ticket">
      <li class="event-detail-ticket__item js-toggle is-open">
        <a href="" class="event-detail-ticket-head js-toggle-trigger">
          <div class="event-detail-ticket-head__status"> <span class="tag-primary">販売中</span> </div>
          <h3 class="event-detail-ticket-head__title"> <span class="label-order">先着</span> 先着販売受付 </h3>
          <dl class="event-detail-ticket-head__list">
            <dt class="event-detail-ticket-head__list-title">販売受付期間</dt>
            <dd class="event-detail-ticket-head__list-data"> 2026年5月10日(日) 19:00<br class="only-sp" />〜2026年7月4日(土) 23:59 </dd>
          </dl>
        </a>
      </li>
      <li class="event-detail-ticket__item js-toggle">
        <a href="" class="event-detail-ticket-head js-toggle-trigger">
          <div class="event-detail-ticket-head__status"> <span class="tag-primary">販売前</span> </div>
          <h3 class="event-detail-ticket-head__title"> <span class="label-order">先着</span> 当日販売受付 </h3>
          <dl class="event-detail-ticket-head__list">
            <dt class="event-detail-ticket-head__list-title">販売受付期間</dt>
            <dd class="event-detail-ticket-head__list-data"> 2026年7月5日(日) 00:00〜2026年7月5日(日) 20:00 </dd>
          </dl>
        </a>
      </li>
    </ul>`;

  it('逐轮解析：轮次名/状态/販売受付期間起止（JST ISO）', () => {
    const rounds = parseLivePocketDetailRounds(html);
    assert.equal(rounds.length, 2);
    assert.deepEqual(rounds[0], {
      roundType: '先着販売受付',
      statusText: '販売中',
      applyStart: '2026-05-10T19:00:00+09:00',
      applyEnd: '2026-07-04T23:59:00+09:00',
    });
    assert.equal(rounds[1].roundType, '当日販売受付');
    assert.equal(rounds[1].statusText, '販売前');
    assert.equal(rounds[1].applyStart, '2026-07-05T00:00:00+09:00');
    assert.equal(rounds[1].applyEnd, '2026-07-05T20:00:00+09:00');
  });

  it('无 #ticket 区 → 空数组（enrich 退回 legacy JSON 兜底）', () => {
    assert.deepEqual(parseLivePocketDetailRounds('<html>nothing</html>'), []);
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

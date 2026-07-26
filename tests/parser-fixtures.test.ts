import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEplusSearch } from '../src/sources/eplus';
import { buildPiaArtistRlsInfoUrl, buildPiaKeywordRlsInfoUrl, parsePiaArtistCd, parsePiaArtistInfo, parsePiaRlsInfo, toTPiaUrl } from '../src/sources/pia';
import { parseTicketDiveSearch, parseTicketDiveDetailWindow } from '../src/sources/ticketdive';
import { parseLawsonSearch } from '../src/sources/lawson';
import { parseLivePocketSearch, parseLivePocketDetailWindow, parseLivePocketDetailRounds, toNewLivePocketUrl } from '../src/sources/livepocket';
import { canonicalArtistId, canonicalVenueId, dedupeEvents } from '../src/sources/shared';

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

  it('rlsInfo 两种模式的 URL builder 形状', () => {
    const artistUrl = buildPiaArtistRlsInfoUrl('M4140001');
    assert.ok(artistUrl.includes('/pia/artist/rlsInfo.do'));
    assert.ok(artistUrl.includes('M4140001'));
    const kwUrl = buildPiaKeywordRlsInfoUrl('PERSONA LIVE TOUR 2026');
    assert.ok(kwUrl.includes('/pia/rlsInfo.do'));
    assert.ok(!kwUrl.includes('/artist/'));
    assert.ok(kwUrl.includes('searchMode=1'), '公演名直搜模式的关键参数');
    assert.ok(kwUrl.includes('kw=PERSONA'));
  });

  it('轮次链接的 ticket.pia.jp 域名归一到 t.pia.jp（该域名 301，存储即规范化）', () => {
    const rls = `
      <section class="sales_data">
        <h3 class="sales_data_title">X 公演</h3>
        <div class="event_link">
          <ul><li class="is_title">先行</li><li class="is_status">受付中</li></ul>
          <a href="https://ticket.pia.jp/pia/ticketInformation.do?eventCd=999&lotRlsCd=1" itemprop="url">申込</a>
          <span itemprop="startDate" datetime="2026-08-01T18:00:00">公演</span>
        </div>
      </section>`;
    const [e] = parsePiaRlsInfo(rls, 'X');
    assert.equal(e.ticketWindows?.[0].applyUrl, 'https://t.pia.jp/pia/ticketInformation.do?eventCd=999&lotRlsCd=1');
    assert.equal(toTPiaUrl('https://t.pia.jp/pia/x'), 'https://t.pia.jp/pia/x');
  });

  // 实测 artistCd=E3130018（あいみょん）：音乐节类节（ＳＷＥＥＴ ＬＯＶＥ ＳＨＯＷＥＲ）的链接
  // 只有 event.do?eventCd=2628194 / ticketInformation.do?eventCd=…&rlsCd=001，全节无 eventBundleCd。
  const festivalSection = `
      <section class="sales_data">
        <h3 class="sales_data_title"><a href="https://t.pia.jp/pia/event/event.do?eventCd=2628194">ＳＷＥＥＴ ＬＯＶＥ ＳＨＯＷＥＲ 2026</a></h3>
        <div class="event_link">
          <ul><li class="is_title">オフィシャル先行</li><li class="is_status">抽選受付中</li></ul>
          <a href="https://t.pia.jp/pia/ticketInformation.do?eventCd=2628194&amp;rlsCd=001" itemprop="url">申込</a>
          <span itemprop="startDate" datetime="2026-08-28T12:00:00">公演</span>
          <div class="is_place"><span itemprop="name">山中湖交流プラザきらら</span></div>
        </div>
      </section>`;

  it('无 eventBundleCd 的音乐节节：id 回退到 eventCd 而非位置序号，购票链接拼 eventCd 形态', () => {
    const [e] = parsePiaRlsInfo(festivalSection, 'あいみょん');
    assert.equal(e.id, 'pia-2628194');
    assert.equal(e.purchaseUrl, 'https://t.pia.jp/pia/event/event.do?eventCd=2628194');
    assert.equal(e.originalUrl, 'https://t.pia.jp/pia/event/event.do?eventCd=2628194');
    assert.equal(e.ticketWindows?.[0].id, 'pia-2628194-0');
  });

  it('节内横幅先出现别的 eventCd 时，id 仍取标题锚点的 cd（作用域优先）', () => {
    // 首个全节匹配会被推荐位/横幅锚点劫持 → id/购票链接绑到不相干公演。标题锚点的 cd 最稳。
    const withBanner = festivalSection.replace(
      '<section class="sales_data">',
      '<section class="sales_data"><a href="https://t.pia.jp/pia/event/event.do?eventCd=9999999">banner</a>',
    );
    const [e] = parsePiaRlsInfo(withBanner, 'あいみょん');
    assert.equal(e.id, 'pia-2628194');
    assert.equal(e.purchaseUrl, 'https://t.pia.jp/pia/event/event.do?eventCd=2628194');
  });

  it('无任何 cd 的节：位置 id 兜底，但不得伪造 eventBundleCd=b0 死链', () => {
    const noCd = `
      <section class="sales_data">
        <h3 class="sales_data_title">CD無し公演</h3>
        <div class="event_link">
          <ul><li class="is_title">先行</li><li class="is_status">受付中</li></ul>
          <a href="https://t.pia.jp/pia/somewhere.do?x=1" itemprop="url">申込</a>
          <span itemprop="startDate" datetime="2026-09-01T18:00:00">公演</span>
        </div>
      </section>`;
    const [e] = parsePiaRlsInfo(noCd, 'X');
    assert.equal(e.id, 'pia-b0');
    assert.notEqual(e.purchaseUrl, 'https://t.pia.jp/pia/event/event.do?eventBundleCd=b0');
    assert.equal(e.purchaseUrl, 'https://t.pia.jp/pia/somewhere.do?x=1');
  });

  it('无 cd 且无可用申込链接：回退官方搜索页，不产出死链', () => {
    const bare = `
      <section class="sales_data">
        <h3 class="sales_data_title">リンク無し公演</h3>
        <div class="event_link">
          <ul><li class="is_title">先行</li><li class="is_status">受付中</li></ul>
          <span itemprop="startDate" datetime="2026-09-01T18:00:00">公演</span>
        </div>
      </section>`;
    const [e] = parsePiaRlsInfo(bare, 'あいみょん');
    assert.equal(e.purchaseUrl, 'https://t.pia.jp/pia/search_all.do?kw=%E3%81%82%E3%81%84%E3%81%BF%E3%82%87%E3%82%93');
  });

  it('eventCd 回退 id 与节的排序位置无关，两次解析一致（收藏/提醒不失联）', () => {
    // 此前回退 b${bi} 是位置序号：同一事件排前排后 id 不同 → localStorage 收藏/提醒错绑。
    const withOther = `
      <section class="sales_data">
        <h3 class="sales_data_title">あいみょんホールツアー</h3>
        <div class="event_link">
          <ul><li class="is_title">先行</li><li class="is_status">受付中</li></ul>
          <a href="https://t.pia.jp/pia/event/event.do?eventBundleCd=BUNDLEX" itemprop="url">申込</a>
          <span itemprop="startDate" datetime="2026-09-01T18:00:00">公演</span>
        </div>
      </section>` + festivalSection;
    const again = parsePiaRlsInfo(withOther, 'あいみょん');
    assert.equal(again.length, 2);
    assert.equal(again[0].id, 'pia-BUNDLEX', '有 eventBundleCd 的节不受影响');
    assert.equal(again[1].id, 'pia-2628194', '排在第二位时 id 不得漂移');
    assert.equal(
      parsePiaRlsInfo(festivalSection, 'あいみょん')[0].id,
      again[1].id,
      '两次解析（不同排序）id 一致',
    );
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
    // 无 artists 匹配信息 → 搜索词回显，诚实标 'query'
    assert.equal(e.artistName, '地下アイドル');
    assert.equal(e.artistSource, 'query');
  });

  it('artists 唯一命中 → 平台真实艺人名（artistSource platform）', () => {
    // 真实响应形态（藍井エイル 实测）：json.artists=[{name:...}] + eventList
    const nextData = {
      props: { pageProps: { __superjsonProps: { json: {
        artists: [{ id: 'A1', name: '藍井エイル' }],
        eventList: [{ id: 'E9', url: 'popcul', title: 'ぽっかるシンフォニー', venueName: '三越劇場', salesStatus: 'applied', startEventDate: '2026-07-12T03:30:00.000Z' }],
      } } } },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const [e] = parseTicketDiveSearch(html, 'あおいえいる');
    assert.equal(e.artistName, '藍井エイル');
    assert.equal(e.artistSource, 'platform');
    assert.equal(e.artistId, 'artist-藍井エイル');
  });

  it('artists 多命中 → 不敢断言归属，回退搜索词', () => {
    const nextData = {
      props: { pageProps: { __superjsonProps: { json: {
        artists: [{ name: 'A' }, { name: 'B' }],
        eventList: [{ id: 'E2', url: 'x', title: 'T', salesStatus: 'coming' }],
      } } } },
    };
    const html = `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(nextData)}</script>`;
    const [e] = parseTicketDiveSearch(html, 'クエリ');
    assert.equal(e.artistName, 'クエリ');
    assert.equal(e.artistSource, 'query');
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

describe('Lawson search parser (ResultBox 结构, 2026-07 真实页面裁剪)', () => {
  // 现行搜索页：一个兴行一个 ResultBox(prfSummaryItem)，内部「公演数分」ResultBox__informations
  // + 每轮受付一个 prfItem 表格。夹具含两个真实陷阱：
  //   ① 筛选面板有 9 个 <h3>（含「受付日 / 公演日」字样）——按 h3 切块会把整组并成一块；
  //   ② 页脚注释里有不相干的 news/mevent 链接（mid=444647）——宽扫 mevent 会把它当详情页。
  const html = readFileSync(fileURLToPath(new URL('./fixtures/lawson-search-resultbox.html', import.meta.url)), 'utf8');
  const events = parseLawsonSearch(html, '倉木麻衣', '2026-07-26T09:00:00.000Z');

  it('每公演一个事件：3 场不再坍缩成 1 场', () => {
    assert.equal(events.length, 3);
    assert.deepEqual(events.map((e) => e.date), ['2026-11-29', '2026-12-04', '2026-12-12']);
    // stripTags 按既有约定把连续空白（含全角空格）折叠成半角空格
    assert.deepEqual(events.map((e) => e.venueName), [
      '大阪国際会議場グランキューブ大阪メインホール（大阪府）',
      'Ｎｉｔｅｒｒａ日本特殊陶業市民会館 フォレストホール（愛知県）',
      '東京国際フォーラム ホールＡ（東京都）',
    ]);
    assert.equal(events[0].title, '倉木麻衣');
    assert.equal(events[0].region, '大阪府');
    assert.equal(events[0].artistName, '倉木麻衣');
    assert.equal(events[0].artistSource, 'query');
  });

  it('每轮受付一个窗口：轮次 / 状态 / 期间齐全（JST）', () => {
    for (const e of events) {
      assert.equal(e.ticketWindows?.length, 3, `${e.id} 应有 3 轮受付`);
      const [le, prereq1, prereq2] = e.ticketWindows!;
      assert.equal(le.roundType, '抽選 LE限定');
      assert.equal(le.statusText, '受付中');
      assert.equal(le.applyStart, '2026-07-13T12:00:00+09:00');
      assert.equal(le.applyEnd, '2026-07-26T23:59:00+09:00');
      assert.equal(prereq1.roundType, '抽選 プレリク');
      assert.equal(prereq1.statusText, '受付中');
      assert.equal(prereq2.roundType, '抽選 プレリク');
      assert.equal(prereq2.statusText, '受付前');
      assert.equal(prereq2.applyStart, '2026-07-27T12:00:00+09:00');
      assert.equal(prereq2.applyEnd, '2026-08-05T23:59:00+09:00');
    }
    assert.equal(events[0].timeline.lotteryEndDate, '2026-07-26');
  });

  it('id 稳定且互不相同：事件=Lコード+公演日，窗口=schduleNo；dedupe 不再吞场次', () => {
    assert.deepEqual(events.map((e) => e.id), [
      'lawson-90040-20261129',
      'lawson-90040-20261204',
      'lawson-90040-20261212',
    ]);
    assert.deepEqual(events[0].ticketWindows?.map((w) => w.id), [
      'lawson-90040-20261129-3',
      'lawson-90040-20261129-4',
      'lawson-90040-20261129-5',
    ]);
    assert.equal(dedupeEvents(events).length, 3);
    const again = parseLawsonSearch(html, '倉木麻衣', '2026-07-26T09:00:00.000Z');
    assert.deepEqual(again.map((e) => e.id), events.map((e) => e.id));
  });

  it('详情跳转取组内出演者页，不再命中页脚注释里的新闻 mevent 链接', () => {
    assert.equal(events[0].originalUrl, 'https://l-tike.com/artist/000000000151342/');
    assert.equal(events[0].purchaseUrl, 'https://l-tike.com/artist/000000000151342/');
    assert.ok(!JSON.stringify(events).includes('444647'), '不得引用页脚新闻链接 mid=444647');
  });

  it('组内 ResultBlock 的真实艺人头图替代占位图', () => {
    assert.equal(events[0].imageUrl, 'https://img.hmv.co.jp//image/artist/190/0000/0000/0151/000000000151342-1.jpg');
  });

  // 复用的合成组：A 有 Lコード按钮；B 无任何按钮（无 Lコード → 回退 id 路径）
  const groupA = `
      <div class="ResultBox boxContents prfSummaryItem">
        <h3 class="ResultBox__title">ARTIST A TOUR</h3>
        <dl class="ResultBox__informations">
          <div class="ResultBox__information">
            <dt class="ResultBox__informationTitle">公演日：</dt>
            <dt class="ResultBox__informationText">2026/8/15(土)</dt>
          </div>
          <div class="ResultBox__information">
            <dt class="ResultBox__informationTitle">会場：</dt>
            <dt class="ResultBox__informationText">会場X（東京都）</dt>
          </div>
        </dl>
        <div class="ResultBox__table prfItem" data-prfIdx="0" data-salesIdx="0">
          <div class="ResultBox__tableBody">
            <span id="reception_typename" class="ticketChusen"> 抽選 </span>
            <p class="ResultBox__text -bold"><span id="sale_name" class="caution">FC先行</span></p>
            <p class="orderAccepting ResultBox__status textSStat">受付中</p>
            <p class="ResultBox__date orderEndDate">2026/6/20(土) 12:00 ～ 2026/7/2(木) 23:59</p>
            <a href="javascript:void(0)" class="Button trigger entryBtn" data-lcode="11111" data-schduleNo="1" data-prfDate="20260815">お申し込みはこちら</a>
          </div>
        </div>
      </div>`;
  const groupB = `
      <div class="ResultBox boxContents prfSummaryItem">
        <h3 class="ResultBox__title">ARTIST B LIVE</h3>
        <dl class="ResultBox__informations">
          <div class="ResultBox__information">
            <dt class="ResultBox__informationTitle">公演日：</dt>
            <dt class="ResultBox__informationText">2026/9/1(火)</dt>
          </div>
          <div class="ResultBox__information">
            <dt class="ResultBox__informationTitle">会場：</dt>
            <dt class="ResultBox__informationText">会場Y（大阪府）</dt>
          </div>
        </dl>
        <div class="ResultBox__table prfItem" data-prfIdx="0" data-salesIdx="0">
          <div class="ResultBox__tableBody">
            <span id="reception_typename" class="ticketSenchaku"> 先着 </span>
            <p class="ResultBox__text -bold"><span id="sale_name" class="caution">一般発売</span></p>
            <p class="orderAccepting ResultBox__status textSStat">受付前</p>
            <p class="ResultBox__date orderEndDate">2026/8/1(土) 10:00 ～ 2026/8/31(月) 23:59</p>
          </div>
        </div>
      </div>`;

  it('多个兴行组各自成事件；无按钮轮次 / 无 Lコード也有稳定回退 id', () => {
    const parsed = parseLawsonSearch(groupA + groupB, 'テスト', '2026-07-26T09:00:00.000Z');
    assert.equal(parsed.length, 2);
    assert.deepEqual(parsed.map((e) => e.title), ['ARTIST A TOUR', 'ARTIST B LIVE']);
    assert.equal(parsed[0].id, 'lawson-11111-20260815');
    assert.equal(parsed[0].ticketWindows?.[0].id, 'lawson-11111-20260815-1');
    // javascript: 占位链接不得进入 applyUrl/purchaseUrl；无组内链接时回退官方搜索页
    assert.equal(parsed[0].ticketWindows?.[0].applyUrl, undefined);
    assert.ok(parsed[0].purchaseUrl.startsWith('https://l-tike.com/search/?keyword='));
    // 无按钮轮次：仍产出窗口
    assert.equal(parsed[1].ticketWindows?.length, 1);
    assert.equal(parsed[1].ticketWindows?.[0].roundType, '先着 一般発売');
    assert.equal(parsed[1].ticketWindows?.[0].statusText, '受付前');
    assert.ok(parsed[1].id.startsWith('lawson-'));
    assert.notEqual(parsed[1].id, parsed[0].id);
  });

  it('无 Lコード回退 id 由内容派生：组乱序后不漂移（收藏/提醒不失联）', () => {
    // 位置序号 g${groupIdx} 会随排序漂移——与本 diff 修的 Pia b${bi} 同病。回退 id 须内容派生。
    const ab = parseLawsonSearch(groupA + groupB, 'テスト', '2026-07-26T09:00:00.000Z');
    const ba = parseLawsonSearch(groupB + groupA, 'テスト', '2026-07-26T09:00:00.000Z');
    const idOf = (events: typeof ab, title: string) => events.find((e) => e.title === title)?.id;
    assert.equal(idOf(ba, 'ARTIST B LIVE'), idOf(ab, 'ARTIST B LIVE'), '乱序后 id 不得漂移');
    assert.equal(idOf(ba, 'ARTIST A TOUR'), idOf(ab, 'ARTIST A TOUR'));
  });

  it('结果上方有分页条时，末组不得吞进页脚（mid=444647 回归守卫）', () => {
    // RESULTBOX_END_RE 若取全文第一个匹配，顶部 Pagination 会让边界落在组前 → 末组切到文末，
    // 页脚注释里的新闻 mevent 链接重新污染 originalUrl/purchaseUrl——正是本次修掉的原 bug。
    const html = `<div class="Pagination">1 2 3</div>${groupA}<footer class="Footer"><!-- <a href="https://l-tike.com/news/mevent/?mid=444647">news</a> --></footer>`;
    const parsed = parseLawsonSearch(html, 'テスト', '2026-07-26T09:00:00.000Z');
    assert.equal(parsed.length, 1);
    assert.ok(!JSON.stringify(parsed).includes('444647'), '页脚新闻链接不得混入');
  });

  it('空 data-schduleNo 不得让窗口 id 撞车（提醒 id 依赖窗口 id 互异）', () => {
    const emptySch = groupA.replace(
      '</div>\n      </div>',
      `</div>
        <div class="ResultBox__table prfItem" data-prfIdx="0" data-salesIdx="1">
          <div class="ResultBox__tableBody">
            <p class="orderAccepting ResultBox__status textSStat">受付中</p>
            <p class="ResultBox__date orderEndDate">2026/7/3(金) 12:00 ～ 2026/7/10(金) 23:59</p>
            <a href="javascript:void(0)" class="entryBtn" data-lcode="11111" data-schduleNo="" data-prfDate="20260815">お申し込みはこちら</a>
          </div>
        </div>
      </div>`,
    ).replace('data-schduleNo="1"', 'data-schduleNo=""');
    const [e] = parseLawsonSearch(emptySch, 'テスト', '2026-07-26T09:00:00.000Z');
    const ids = e.ticketWindows!.map((w) => w.id);
    assert.equal(new Set(ids).size, ids.length, `空 schduleNo 导致窗口 id 撞车: ${ids.join(',')}`);
  });

  it('同日昼夜二部：同 prfDate 两场不得被 dedupe 吞并', () => {
    const matinee = `
        <dl class="ResultBox__informations">
          <div class="ResultBox__information">
            <dt class="ResultBox__informationTitle">公演日：</dt>
            <dt class="ResultBox__informationText">2026/9/1(火)</dt>
          </div>
        </dl>
        <div class="ResultBox__table prfItem" data-prfIdx="0" data-salesIdx="0">
          <p class="ResultBox__status">受付中</p>
          <p class="ResultBox__date">2026/8/1(土) 10:00 ～ 2026/8/10(月) 23:59</p>
          <a href="javascript:void(0)" class="entryBtn" data-lcode="33333" data-schduleNo="1" data-prfDate="20260901" data-pfKeys="20260901AAA111">申込</a>
        </div>`;
    const soiree = matinee
      .replace('data-prfIdx="0"', 'data-prfIdx="1"')
      .replace('data-pfKeys="20260901AAA111"', 'data-pfKeys="20260901BBB222"');
    const html = `
      <div class="ResultBox boxContents prfSummaryItem">
        <h3 class="ResultBox__title">二部制 LIVE</h3>${matinee}${soiree}
      </div>`;
    const parsed = parseLawsonSearch(html, '二部', '2026-07-26T09:00:00.000Z');
    assert.equal(parsed.length, 2, '昼夜二部应各成一事件');
    assert.equal(dedupeEvents(parsed).length, 2, '同 id 会被 dedupe 吞并——id 必须消歧');
  });

  it('组外域名与纯锚点链接不得进入 applyUrl / 详情跳转', () => {
    const hostile = groupA
      .replace(
        '<a href="javascript:void(0)"',
        '<a href="#entryModal">modal</a><a href="https://evil.example/order/x">ev</a><a href="javascript:void(0)"',
      )
      .replace(
        '<h3 class="ResultBox__title">ARTIST A TOUR</h3>',
        '<h3 class="ResultBox__title">ARTIST A TOUR</h3><a href="https://evil.example/mevent-x">bad</a><a href="/artist/000000000151342/">出演者</a>',
      );
    const [e] = parseLawsonSearch(hostile, 'テスト', '2026-07-26T09:00:00.000Z');
    // #entryModal 解析为 https://l-tike.com/#entryModal（合法 http）→ 必须显式跳过；
    // evil.example 过了 scheme 门 → 必须被域名钉死拦下
    assert.equal(e.ticketWindows?.[0].applyUrl, undefined);
    assert.equal(e.originalUrl, 'https://l-tike.com/artist/000000000151342/');
  });

  it('真实夹具：末场窗口 applyUrl 不得泄漏为出演者页（ResultBlock 边界守卫）', () => {
    const last = events[events.length - 1];
    for (const w of last.ticketWindows!) {
      assert.equal(w.applyUrl, undefined, `${w.id} 的 applyUrl 泄漏: ${w.applyUrl}`);
    }
  });

  it('超大页面按上限截断，不把回溯拖成秒级', () => {
    // 第三方 HTML 不保证善意：构造的无 > 长串曾让新正则在 200KB 上跑到秒级。
    const bloat = `<div ${'x'.repeat(600_000)}`;
    const started = Date.now();
    const parsed = parseLawsonSearch(bloat + groupA, 'テスト', '2026-07-26T09:00:00.000Z');
    assert.ok(Date.now() - started < 1000, '解析超时——输入上限/回溯上限失效');
    assert.equal(parsed.length, 0, '截断后无完整组');
  });

  it('仅状态无期间的轮次保留窗口；状态期间全无则不产窗口', () => {
    const statusOnly = groupA.replace(/<p class="ResultBox__date orderEndDate">[^<]*<\/p>/, '');
    const [e1] = parseLawsonSearch(statusOnly, 'テスト', '2026-07-26T09:00:00.000Z');
    assert.equal(e1.ticketWindows?.length, 1);
    assert.equal(e1.ticketWindows?.[0].statusText, '受付中');
    assert.equal(e1.ticketWindows?.[0].applyStart, null);
    const bare = statusOnly.replace(/<p class="orderAccepting ResultBox__status textSStat">[^<]*<\/p>/, '');
    const [e2] = parseLawsonSearch(bare, 'テスト', '2026-07-26T09:00:00.000Z');
    assert.equal(e2.ticketWindows?.length, 0, '无状态无期间的轮次不应产出窗口');
  });
});

describe('Pia is_status 行受付期間解析', () => {
  // 真实形态：<li class="is_status"><span>状态词</span> ～2026/8/12(水) 23:59</li>
  // 状态词进 statusText（短徽标），~ 前后的日期分别是受付開始/締切 → applyStart/applyEnd。
  const seg = (statusLine: string) => `
    <section class="sales_data">
      <h3 class="sales_data_title">X TOUR</h3>
      <div class="event_link"><a href="https://t.pia.jp/pia/ticketInformation.do?eventBundleCd=Z9&rlsCd=001" itemprop="url">申込</a>
        <li class="is_title">先行抽選</li>
        <li class="is_status">${statusLine}</li>
        <time itemprop="startDate" datetime="2026-10-01T00:00:00+09:00"></time>
      </div>
    </section>`;

  it('「～締切」形态：applyEnd 落地、applyStart 留空、statusText 保持短状态词', () => {
    const [e] = parsePiaRlsInfo(seg('<span class="is_red">販売期間中</span> ～2026/8/12(水) 23:59'), 'X');
    const [w] = e.ticketWindows!;
    assert.equal(w.statusText, '販売期間中');
    assert.equal(w.applyStart, null);
    assert.equal(w.applyEnd, '2026-08-12T23:59:00+09:00');
  });

  it('「開始～締切」形态：两端都落地', () => {
    const [e] = parsePiaRlsInfo(seg('<span class="is_blue">受付前</span> 2026/8/1(土) 10:00～2026/8/12(水) 23:59'), 'X');
    const [w] = e.ticketWindows!;
    assert.equal(w.applyStart, '2026-08-01T10:00:00+09:00');
    assert.equal(w.applyEnd, '2026-08-12T23:59:00+09:00');
  });

  it('状态行含 昼/夜 标记仍可解析（与详情页 PIA_D 同等容忍）', () => {
    // 详情页正则 PIA_D 专门写了 (?:昼|夜|朝|午前|午後)? —— Pia 实际会用这种标注，状态行解析不得掉队。
    const [e] = parsePiaRlsInfo(seg('<span class="is_blue">受付前</span> 2026/8/1(土) 昼 10:00～2026/8/12(水) 23:59'), 'X');
    const [w] = e.ticketWindows!;
    assert.equal(w.applyStart, '2026-08-01T10:00:00+09:00');
    assert.equal(w.applyEnd, '2026-08-12T23:59:00+09:00');
  });

  it('无日期状态行：applyStart/applyEnd 保持 null 不误报', () => {
    const [e] = parsePiaRlsInfo(seg('<span class="is_blue">予定枚数終了</span>'), 'X');
    const [w] = e.ticketWindows!;
    assert.equal(w.statusText, '予定枚数終了');
    assert.equal(w.applyStart, null);
    assert.equal(w.applyEnd, null);
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

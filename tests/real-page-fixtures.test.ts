import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEplusSearch } from '../src/sources/eplus';
import { parsePiaRlsInfo } from '../src/sources/pia';
import { parseLivePocketSearch } from '../src/sources/livepocket';
import { parseTicketDiveSearch } from '../src/sources/ticketdive';

// 真实页面裁剪夹具（结构漂移金丝雀）。
// 教训来自 Lawson（2026-07）：手写夹具按「想象中的结构」编写，站点改版后测试照绿、
// 线上解析悄悄退化（3 公演×3 轮坍缩成 1 卡）。这里的夹具全部裁自真实抓取的页面，
// 期望值取自原始载荷（内嵌 JSON 字段 / 原始 HTML 标记），不是解析器自身的输出。
// 站点改版 → 这些测试先红，比用户先发现。
// Lawson 的真实夹具在 parser-fixtures.test.ts（ResultBox describe）。

const fx = (name: string): string =>
  readFileSync(fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url)), 'utf8');

describe('eplus 真实搜索页（あいみょん, 2026-07-26）', () => {
  // 原始 JSON：so_kensu=3；同一巡演(kogyo 043020)两场不同日期 → 必须拆成两个事件。
  const events = parseEplusSearch(fx('eplus-search-aimyon.html'), 'あいみょん');

  it('record_list 全量成事件：同巡演分日期、id=kogyo+日期+场馆码', () => {
    assert.deepEqual(events.map((e) => e.eventId), [
      'eplus-005318-20260828-4010110',
      'eplus-043020-20260829-9820080',
      'eplus-043020-20260830-9820080',
    ]);
    assert.deepEqual(events.map((e) => e.date), ['2026-08-28', '2026-08-29', '2026-08-30']);
    // 载荷标题里是 NBSP（U+00A0）分隔——用显式转义，肉眼不可见的字面量迟早被格式化器弄丢
    assert.ok(events[0].title.replace(/\u00A0/g, ' ').startsWith('SWEET LOVE SHOWER'));
    assert.ok(events.every((e) => e.venue && e.venue !== '—'));
    assert.equal(events[0].detailUrl, 'https://eplus.jp/sf/detail/0053180001-P0030045P021001');
  });

  it('多轮受付窗口齐全：轮次名实体解码、JST 起止精确', () => {
    assert.deepEqual(events.map((e) => e.ticketWindows.length), [1, 2, 2]);
    const [w] = events[0].ticketWindows;
    assert.equal(w.id, 'eplus-005318-20260828-4010110-0');
    assert.equal(w.roundType, '★<8/28公演>一般発売');
    assert.equal(w.applyStart, '2026-07-18T10:00:00+09:00');
    assert.equal(w.applyEnd, '2026-08-27T23:59:00+09:00');
    const [general, preorder] = events[1].ticketWindows;
    assert.equal(general.roundType, '☆★一般発売');
    assert.equal(general.applyStart, '2026-07-25T10:00:00+09:00');
    assert.equal(general.applyEnd, '2026-08-27T18:00:00+09:00');
    assert.equal(preorder.roundType, '☆プレオーダー受付');
    assert.equal(preorder.applyStart, '2026-07-02T12:00:00+09:00');
    assert.equal(preorder.applyEnd, '2026-07-14T23:59:00+09:00');
  });
});

describe('Pia 真实 rlsInfo 片段（あいみょん→ロックのほそ道, 2026-07-26）', () => {
  // 夹具只裁带 eventBundleCd 的 sales_data 节；无 bundleCd 的 eventCd 回退分支
  // 由 parser-fixtures.test.ts 的音乐节合成夹具覆盖。
  const events = parsePiaRlsInfo(fx('pia-rlsinfo-rockhosomichi.html'), 'あいみょん', 'platform');

  it('sales_data 节成事件：id=eventBundleCd、日期/会场/轮次/状态齐全', () => {
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.id, 'pia-b2668741');
    assert.equal(e.date, '2026-08-29');
    assert.equal(e.venueName, 'ゼビオアリーナ仙台');
    assert.equal(e.artistName, 'あいみょん');
    assert.equal(e.artistSource, 'platform');
    assert.equal(e.ticketWindows?.length, 1);
    const [w] = e.ticketWindows!;
    assert.equal(w.id, 'pia-b2668741-0');
    assert.equal(w.roundType, '一般発売／ロックのほそ道２０２６ ～１５ｔｈ Ａｎｎｉｖｅｒｓａｒｙ Ｓｐｅｃｉａｌ～');
    // statusText 保持短状态词（卡片徽标用）；状态行尾的「～2026/8/13(木) 23:59」
    // 是受付締切 → 搜索阶段直接落 applyEnd，不必等详情页懒加载。
    assert.equal(w.statusText, '予定枚数終了');
    assert.equal(w.applyStart, null);
    assert.equal(w.applyEnd, '2026-08-13T23:59:00+09:00');
    // ticket.pia.jp 域名必须归一到 t.pia.jp（详情页 301）
    assert.equal(w.applyUrl, 'https://t.pia.jp/pia/ticketInformation.do?eventCd=2618449&rlsCd=001&lotRlsCd=');
    assert.equal(e.purchaseUrl, 'https://t.pia.jp/pia/event/event.do?eventBundleCd=b2668741');
  });
});

describe('LivePocket 真实搜索页（闇雲, 2026-07-26）', () => {
  // 夹具含前 4 张结果卡 + 一段 pickup 轮播（event-card--sp-column，带 /e/ 链接的排除陷阱）。
  const events = parseLivePocketSearch(fx('livepocket-search-yamikumo.html'), '闇雲');

  it('每卡一事件、pickup 轮播不混入；出演者取平台真实名', () => {
    assert.deepEqual(events.map((e) => e.id), ['lp-x3n-y', 'lp-itqaq', 'lp-0difp', 'lp-cracf']);
    assert.deepEqual(events.map((e) => e.date), ['2026-09-06', '2026-09-06', '2026-09-05', '2026-09-05']);
    assert.deepEqual(events.map((e) => e.time), ['16:00', '18:20', '18:35', '16:15']);
    assert.deepEqual(events.map((e) => e.venueName), ['RADHALL', 'RADHALL', '梅田ODYSSEY', '梅田ODYSSEY']);
    assert.deepEqual(events.map((e) => e.region), ['愛知県', '愛知県', '大阪府', '大阪府']);
    for (const e of events) {
      assert.equal(e.artistName, '闇雲');
      assert.equal(e.artistSource, 'platform');
      assert.equal(e.ticketWindows?.[0].statusText, '販売中');
      assert.ok(e.title.startsWith('◆闇雲presents'));
    }
    assert.equal(events[0].ticketWindows?.[0].id, 'lp-x3n-y-0');
    assert.equal(events[0].originalUrl, 'https://livepocket.jp/e/x3n-y');
  });
});

describe('TicketDive 真实搜索页（HEROINES, 2026-07-26）', () => {
  // 原始 superjson：eventList=1；artists 多命中（24 个同名系）→ 不得冒充平台真实艺人。
  const events = parseTicketDiveSearch(fx('ticketdive-search-heroines.html'), 'HEROINES');

  it('eventList 成事件：UTC→JST 日期、状态映射、多命中回退检索词', () => {
    assert.equal(events.length, 1);
    const [e] = events;
    assert.equal(e.id, 'td-t4I8P3b0P9IY6mHh9BUc');
    assert.equal(e.date, '2026-08-16');
    assert.equal(e.venueName, 'EX THEATER ROPPONGI');
    assert.equal(e.artistName, 'HEROINES');
    assert.equal(e.artistSource, 'query');
    assert.equal(e.ticketWindows?.[0].id, 'td-t4I8P3b0P9IY6mHh9BUc-0');
    assert.equal(e.ticketWindows?.[0].statusText, '受付中');
    assert.equal(e.originalUrl, 'https://ticketdive.com/event/heroines_summer0816');
  });
});

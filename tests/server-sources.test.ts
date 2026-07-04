// 服务端 adapter 与客户端解析器的「对齐守卫」（插件体检 2026-07 发现的回归面）：
// 代理路径产出的事件必须带与客户端一致的 artistSource / 真实艺人名，
// 否则同一次搜索走代理和走直连会得到不同的 UI 语义（⭐ vs 🔍）。
import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import { eplusSource } from '../server/sources/eplus';
import { piaSource } from '../server/sources/pia';
import type { SourceSearchContext } from '../server/types';

function ctxWith(pages: Record<string, string>): SourceSearchContext {
  return {
    fetchedAt: '2026-07-04T00:00:00.000Z',
    async fetchText(url: string) {
      const hit = Object.entries(pages).find(([key]) => url.includes(key));
      if (!hit) throw new Error(`unexpected fetch: ${url}`);
      return hit[1];
    },
  };
}

describe('server adapters 与客户端语义对齐', () => {
  it('eplus 代理结果标 artistSource=query（搜索词回显不冒充艺人）', async () => {
    const html = `<script type="application/json">${JSON.stringify({
      data: { record_list: [{
        kogyo_code: 'KG1', koenbi_term: '20260718', kaien_time: '1800',
        kanren_kogyo_sub: { kogyo_name_1: 'LIVE' },
        kanren_venue: { venue_name: 'Zepp', todofuken_name: '東京都', venue_code: 'V1' },
        koen_detail_url_pc: '/sf/detail/x',
        kanren_uketsuke_koen_list: [{ uketsuke_name_pc: '先行', uketsuke_start_datetime: '20260520120000', uketsuke_end_datetime: '20260603235900' }],
      }] },
    })}</script>`;
    const events = await eplusSource.search('FRUITS', ctxWith({ 'eplus.jp': html }));
    assert.equal(events.length, 1);
    assert.equal(events[0].artistName, 'FRUITS');
    assert.equal(events[0].artistSource, 'query');
  });

  it('pia 代理结果用 artistnm 真实艺人名（字母 artistCd 也可用）', async () => {
    const searchHtml = 'var artistArray = "[score: 2, artistcd: M4140001, artistnm: ＦＲＵＩＴＳ ＺＩＰＰＥＲ, artistkn: フルーツジッパー]";';
    const rlsHtml = `
      <section class="sales_data">
        <h3 class="sales_data_title">KAWAII LAB. SESSION</h3>
        <div class="event_link">
          <ul><li class="is_title">先行</li><li class="is_status">受付中</li></ul>
          <a href="https://ticket.pia.jp/pia/ticketInformation.do?eventCd=1" itemprop="url">申込</a>
          <span itemprop="startDate" datetime="2026-07-10T18:00:00">公演</span>
        </div>
      </section>`;
    const events = await piaSource.search('fruits zipper', ctxWith({ 'search_all.do': searchHtml, 'rlsInfo.do': rlsHtml }));
    assert.equal(events.length, 1);
    assert.equal(events[0].artistName, 'FRUITS ZIPPER'); // NFKC 归一后的平台真名
    assert.equal(events[0].artistSource, 'platform');
    // rlsInfo 请求必须带解析出的 artistCd
    assert.equal(events[0].ticketWindows?.[0].applyUrl?.includes('t.pia.jp'), true);
  });
});

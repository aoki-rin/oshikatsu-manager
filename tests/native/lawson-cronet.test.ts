import { describe, it, expect, vi, beforeEach } from 'vitest';
import assert from 'node:assert/strict';

// Cronet 是原生插件，测试里只能替身。这里 mock 的是 Capacitor 的插件注册与平台判定，
// 解析/校验/错误分类都跑真实现——否则等于只在测 mock。
const h = vi.hoisted(() => ({
  getPlatform: vi.fn(() => 'android'),
  isPluginAvailable: vi.fn(() => true),
  cronetGet: vi.fn(),
  capacitorGet: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: h.getPlatform, isPluginAvailable: h.isPluginAvailable, isNativePlatform: () => true },
  CapacitorHttp: { get: h.capacitorGet },
  registerPlugin: () => ({ get: h.cronetGet }),
}));

import { searchLawson, interpretLawsonHtml } from '../../src/sources/lawson';
import { CHROME_NAV_HEADERS, CHROME_UA, CHROME_VERSION, describeCronetFailure, isCronetAvailable } from '../../src/sources/cronetHttp';

const RESULT_HTML = `
  <div class="ResultBox boxContents prfSummaryItem">
    <h3 class="ResultBox__title">倉木麻衣</h3>
    <dl class="ResultBox__informations">
      <div class="ResultBox__information">
        <dt class="ResultBox__informationTitle">公演日：</dt>
        <dt class="ResultBox__informationText">2026/11/29(日)</dt>
      </div>
      <div class="ResultBox__information">
        <dt class="ResultBox__informationTitle">会場：</dt>
        <dt class="ResultBox__informationText">大阪国際会議場（大阪府）</dt>
      </div>
    </dl>
    <div class="ResultBox__table prfItem" data-prfIdx="0" data-salesIdx="0">
      <span id="reception_typename">抽選</span>
      <p class="ResultBox__text -bold"><span id="sale_name">プレリク</span></p>
      <p class="orderAccepting ResultBox__status">受付中</p>
      <p class="ResultBox__date orderEndDate">2026/7/27(月) 12:00 ～ 2026/8/5(水) 23:59</p>
      <a href="javascript:void(0)" class="entryBtn" data-lcode="90040" data-schduleNo="5" data-prfDate="20261129">お申し込みはこちら</a>
    </div>
  </div>`;

// looksLikeAntiBot 把 <200 字符的响应判为「异常短内容」(截断/空 body 的指纹)，
// 所以夹具必须够长,否则测的是短内容守卫而不是零结果/结构漂移判定。
const PAD = '<div class="filler">' + 'あ'.repeat(300) + '</div>';
const ZERO_RESULT_HTML = `<html><body><p>検索結果：0件</p><p>条件に一致するチケットは見つかりませんでした。</p>${PAD}</body></html>`;
const UNKNOWN_HTML = `<html><body><main>完全陌生的结构</main>${PAD}</body></html>`;

beforeEach(() => {
  vi.clearAllMocks();
  h.getPlatform.mockReturnValue('android');
  h.isPluginAvailable.mockReturnValue(true);
});

describe('Cronet 可用性门控', () => {
  it('Android + 插件在 → 可用', () => {
    assert.equal(isCronetAvailable(), true);
  });

  // iOS 没有这个原生插件；不先问就调用会拿到 Capacitor 的「插件不存在」异常，
  // 被上层当成网络故障误报（ADR-0005 的平台门控）。
  it('iOS → 不可用（插件不存在）', () => {
    h.getPlatform.mockReturnValue('ios');
    assert.equal(isCronetAvailable(), false);
  });

  it('web/dev → 不可用', () => {
    h.getPlatform.mockReturnValue('web');
    assert.equal(isCronetAvailable(), false);
  });

  it('Android 但旧包未含插件 → 不可用', () => {
    h.isPluginAvailable.mockReturnValue(false);
    assert.equal(isCronetAvailable(), false);
  });
});

describe('Chrome 头集与 UA 的一致性（ADR-0005 的核心约束）', () => {
  // 只改 UA 不改 client hints 反而是「假 Chrome」的明确信号——实测裸 UA 会被 h2 层
  // 直接重置。两者必须同版本，这条用例就是那个联动的锁。
  it('sec-ch-ua 的版本号与 UA 里的版本号一致', () => {
    assert.ok(CHROME_UA.includes(`Chrome/${CHROME_VERSION}.`));
    assert.ok(CHROME_NAV_HEADERS['sec-ch-ua'].includes(`"Google Chrome";v="${CHROME_VERSION}"`));
    assert.ok(CHROME_NAV_HEADERS['sec-ch-ua'].includes(`"Chromium";v="${CHROME_VERSION}"`));
  });

  it('导航请求必需的 sec-* 头一个都不缺', () => {
    for (const key of ['sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform',
      'sec-fetch-site', 'sec-fetch-mode', 'sec-fetch-user', 'sec-fetch-dest',
      'upgrade-insecure-requests', 'accept', 'accept-language', 'user-agent']) {
      assert.ok(CHROME_NAV_HEADERS[key], `缺少 ${key}`);
    }
  });
});

describe('searchLawson 走 Cronet', () => {
  it('Android：用 Cronet 抓取并解析出逐场事件,请求带全套 Chrome 头', async () => {
    h.cronetGet.mockResolvedValue({ status: 200, url: 'https://l-tike.com/search/', negotiatedProtocol: 'h2', data: RESULT_HTML });

    const events = await searchLawson('倉木麻衣');

    assert.equal(events.length, 1);
    assert.equal(events[0].id, 'lawson-90040-20261129');
    assert.equal(events[0].ticketWindows?.[0].id, 'lawson-90040-20261129-5');
    assert.equal(h.capacitorGet.mock.calls.length, 0, 'Cronet 可用时不该退回 CapacitorHttp');
    const sent = h.cronetGet.mock.calls[0][0];
    assert.equal(sent.headers['user-agent'], CHROME_UA);
    assert.equal(sent.headers['sec-fetch-dest'], 'document');
  });

  it('零结果页 → 返回空数组而非报错（该艺人无票是正常结局）', async () => {
    h.cronetGet.mockResolvedValue({ status: 200, url: 'x', negotiatedProtocol: 'h2', data: ZERO_RESULT_HTML });
    assert.deepEqual(await searchLawson('无人'), []);
  });

  it('非零结果页却解析不出 → 报结构漂移（金丝雀,别静默返回空）', async () => {
    h.cronetGet.mockResolvedValue({ status: 200, url: 'x', negotiatedProtocol: 'h2', data: UNKNOWN_HTML });
    await assert.rejects(() => searchLawson('X'), /结构无法识别/);
  });

  it('反爬页 → 明确报反爬,不当成结构漂移', async () => {
    h.cronetGet.mockResolvedValue({ status: 403, url: 'x', negotiatedProtocol: 'h2', data: '<html>' + 'x'.repeat(300) + '</html>' });
    await assert.rejects(() => searchLawson('X'), /反爬/);
  });
});

describe('失败原因分类', () => {
  // h2 协议错误不是网络故障,而是 Akamai 识破了客户端(多半头集随 Chrome 版本过期)。
  // 文案必须指向真正该修的地方,否则下一个人会去查网络。
  it('ERR_HTTP2_PROTOCOL_ERROR → 指向头集/指纹过期,并给出要改的文件', () => {
    const msg = describeCronetFailure(new Error('cronet failed: net::ERR_HTTP2_PROTOCOL_ERROR, ErrorCode=11'));
    assert.match(msg, /指纹可能已过期/);
    assert.match(msg, /cronetHttp\.ts/);
  });

  it('超时 → 指向网络,并给官方跳转兜底', () => {
    assert.match(describeCronetFailure(new Error('cronet timeout')), /超时/);
    assert.match(describeCronetFailure(new Error('net::ERR_CONNECTION_REFUSED')), /打开ローチケ/);
  });

  it('未知错误 → 原样带出摘要,不吞信息', () => {
    assert.match(describeCronetFailure(new Error('something odd')), /something odd/);
  });

  it('searchLawson 把 Cronet 的 h2 错误转成可行动文案', async () => {
    h.cronetGet.mockRejectedValue(new Error('cronet failed: net::ERR_HTTP2_PROTOCOL_ERROR'));
    await assert.rejects(() => searchLawson('X'), /指纹可能已过期/);
  });
});

describe('无 Cronet 环境的兜底路径', () => {
  it('iOS/web：退回 CapacitorHttp,并复用同一套解析校验', async () => {
    h.getPlatform.mockReturnValue('web');
    h.capacitorGet.mockResolvedValue({ status: 200, data: RESULT_HTML });

    const events = await searchLawson('倉木麻衣');

    assert.equal(events.length, 1);
    assert.equal(h.cronetGet.mock.calls.length, 0);
  });

  it('直连抛异常 → 明确文案而非静默空结果', async () => {
    h.getPlatform.mockReturnValue('web');
    h.capacitorGet.mockRejectedValue(new Error('timeout'));
    await assert.rejects(() => searchLawson('X'), /超时\/受限/);
  });
});

describe('interpretLawsonHtml 被两条路径共用', () => {
  // 抽出来就是为了防「换了传输层却漏掉反爬/零结果判定」——这条锁住两路同源。
  it('同一份 HTML,无论来自哪条路径,判定一致', () => {
    const viaCronet = interpretLawsonHtml(RESULT_HTML, '倉木麻衣', 200);
    const viaCapacitor = interpretLawsonHtml(RESULT_HTML, '倉木麻衣', 200);
    assert.deepEqual(viaCronet.map(e => e.id), viaCapacitor.map(e => e.id));
  });
});

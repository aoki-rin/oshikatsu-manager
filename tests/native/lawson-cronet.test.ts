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

import { searchLawson, describeDirectFailure, CAPACITOR_TIMEOUT_MS } from '../../src/sources/lawson';
import { CHROME_NAV_HEADERS, CHROME_UA, CHROME_VERSION, SAFARI_IOS_UA, describeCronetFailure, isCronetAvailable } from '../../src/sources/cronetHttp';
import { buildPlatformSearchUrl, platformSearchTimeoutMs } from '../../src/sources/shared';

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

// ADR-0006 之后这条不再是「反正会失败的降级」,而是 iOS 上的主路径。
// 之前这里只断言「解析出 1 条」+「没走 Cronet」,于是删掉 iOS 的 UA 分支、
// 让 URL 变陈旧、完全不发 UA、绕过反爬判定——四种改法都能通过全部 306 条测试。
describe('CapacitorHttp 路径（iOS 主路径 / web 兜底）', () => {
  // 平台 → 期望 UA。ADR-0006 决定「UA 按平台给自洽的那个」,此前零覆盖。
  for (const [platform, expectedUa, label] of [
    ['ios', SAFARI_IOS_UA, 'Safari'],
    ['web', CHROME_UA, 'Chrome'],
  ] as const) {
    it(`${platform}：发 ${label} UA,URL 与 Cronet 路径同源`, async () => {
      h.getPlatform.mockReturnValue(platform);
      h.isPluginAvailable.mockReturnValue(false);
      h.capacitorGet.mockResolvedValue({ status: 200, data: RESULT_HTML });

      const events = await searchLawson('倉木麻衣');

      assert.equal(events.length, 1);
      assert.equal(events[0].id, 'lawson-90040-20261129');
      assert.equal(h.cronetGet.mock.calls.length, 0);

      const sent = h.capacitorGet.mock.calls[0][0];
      assert.equal(sent.headers['User-Agent'], expectedUa);
      // 两条传输必须打同一个地址。曾经这里是硬编码的第二份,Cronet 那份改了它不会跟。
      assert.equal(sent.url, buildPlatformSearchUrl('Lawson Ticket', '倉木麻衣'));
      assert.equal(sent.params, undefined, 'URL 已带 query,再传 params 会重复编码');
    });
  }

  // Capacitor 的 iOS 实现只认 connectTimeout(HttpRequestHandler.swift 取
  // `connectTimeout ?? readTimeout ?? 600000` 塞进 URLRequest.timeoutInterval),
  // readTimeout 在 iOS 上是死参数 → 值必须由 connectTimeout 承担。
  it('超时值由 connectTimeout 承担,且留在外层平台超时之内', async () => {
    h.getPlatform.mockReturnValue('ios');
    h.isPluginAvailable.mockReturnValue(false);
    h.capacitorGet.mockResolvedValue({ status: 200, data: RESULT_HTML });
    await searchLawson('倉木麻衣');

    assert.equal(h.capacitorGet.mock.calls[0][0].connectTimeout, CAPACITOR_TIMEOUT_MS);
    // 下界:6s 是 ADR-0005 时期给「实测必失败的路径」定的快速放弃值,
    // 现在这条要在移动网络上取完 ~190KB 搜索页,不能再照抄。
    assert.ok(CAPACITOR_TIMEOUT_MS >= 10000, `内层超时 ${CAPACITOR_TIMEOUT_MS}ms 对主路径过短`);
    // 上界:必须先于外层触发,否则拿不到失败分类,只剩一句 "search timed out"。
    assert.ok(CAPACITOR_TIMEOUT_MS < platformSearchTimeoutMs('Lawson Ticket'),
      '内层超时不早于外层 → 失败分类拿不到执行机会');
  });
});

describe('CapacitorHttp 路径的失败分类', () => {
  // 以前一律报「超时/受限」并丢掉原始异常。iOS 上这是主路径,Akamai 收紧、DNS 失败、
  // TLS 问题被同一句话掩盖,会把排查引向网络。
  it('超时 → 说超时,并给官方跳转', () => {
    const msg = describeDirectFailure(new Error('The request timed out.'));
    assert.match(msg, /超时/);
    assert.match(msg, /打开ローチケ/);
  });

  it('DNS/离线 → 说连不上,不说超时', () => {
    const msg = describeDirectFailure(new Error('A server with the specified hostname could not be found.'));
    assert.match(msg, /连不上/);
    assert.doesNotMatch(msg, /超时/);
  });

  it('任何原因都保留原始异常摘要,不吞信息', () => {
    assert.match(describeDirectFailure(new Error('some unexpected native error')), /some unexpected native error/);
    assert.match(describeDirectFailure(new Error('An SSL error has occurred')), /SSL/);
  });

  it('searchLawson 把直连异常转成带因文案而非静默空结果', async () => {
    h.getPlatform.mockReturnValue('ios');
    h.isPluginAvailable.mockReturnValue(false);
    h.capacitorGet.mockRejectedValue(new Error('A server with the specified hostname could not be found.'));
    await assert.rejects(() => searchLawson('X'), /连不上/);
  });
});

describe('两条传输路径的行为必须一致', () => {
  // ⚠️ 这里曾经是「同一个函数用同一份参数调用两次再比较」,结构上不可能失败:
  // 把兜底路径改成直接 parseLawsonSearch(绕过反爬 + 结构漂移判定)时全量测试仍全绿。
  // 现在改为真的把同一份 HTML 分别灌进两条传输,断言 searchLawson 的最终行为一致。
  const viaCronet = (html: string, status = 200) => {
    h.getPlatform.mockReturnValue('android');
    h.isPluginAvailable.mockReturnValue(true);
    h.cronetGet.mockResolvedValue({ status, url: 'x', negotiatedProtocol: 'h2', data: html });
    return searchLawson('倉木麻衣');
  };
  const viaCapacitor = (html: string, status = 200) => {
    h.getPlatform.mockReturnValue('ios');
    h.isPluginAvailable.mockReturnValue(false);
    h.capacitorGet.mockResolvedValue({ status, data: html });
    return searchLawson('倉木麻衣');
  };

  it('正常页：两条路径解析出同一批事件', async () => {
    const a = await viaCronet(RESULT_HTML);
    const b = await viaCapacitor(RESULT_HTML);
    assert.equal(a.length, 1);
    assert.deepEqual(a.map(e => e.id), b.map(e => e.id));
  });

  it('反爬页：两条路径都必须抛,不能有一条静默返回空', async () => {
    const blocked = '<html>' + 'x'.repeat(300) + '</html>';
    await assert.rejects(() => viaCronet(blocked, 403), /反爬/);
    await assert.rejects(() => viaCapacitor(blocked, 403), /反爬/);
  });

  it('结构漂移：两条路径都必须抛,不能有一条报「无票」', async () => {
    await assert.rejects(() => viaCronet(UNKNOWN_HTML), /结构无法识别/);
    await assert.rejects(() => viaCapacitor(UNKNOWN_HTML), /结构无法识别/);
  });

  it('零结果页：两条路径都返回空数组（无票是正常结局）', async () => {
    assert.deepEqual(await viaCronet(ZERO_RESULT_HTML), []);
    assert.deepEqual(await viaCapacitor(ZERO_RESULT_HTML), []);
  });
});

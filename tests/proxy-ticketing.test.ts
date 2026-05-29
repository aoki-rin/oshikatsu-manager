import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActivityEvent } from '../src/types';
import { buildPlatformSearchUrl } from '../src/sources/shared';
import { classifyPlatformHtml, createPlatformHttpClient } from '../server/network';
import { createSearchService } from '../server/searchService';
import { searchViaProxy, searchWithProxyFallback } from '../src/sources/proxy';

const sampleEvent: ActivityEvent = {
  id: 'lawson-123456',
  title: 'YOASOBI ARENA TOUR',
  artistId: 'lawson-artist-YOASOBI',
  artistName: 'YOASOBI',
  venueId: 'lawson-venue-123456',
  venueName: '東京ドーム',
  date: '2026-08-01',
  time: '18:00',
  region: '東京都',
  platform: 'Lawson Ticket',
  price: '—',
  imageUrl: 'https://example.com/live.jpg',
  timeline: {},
  ticketWindows: [],
  originalUrl: 'https://l-tike.com/event/mevent/?mid=123456',
  description: 'fixture',
  category: 'J-Pop',
  tags: ['Lawson Ticket'],
  sourceKind: 'live',
  sourcePlatformId: 'lawson',
  lastFetchedAt: '2026-05-25T00:00:00.000Z',
  purchaseUrl: 'https://l-tike.com/order/?gLcode=12345',
};

describe('proxy network policy', () => {
  it('classifies anti-bot and abnormal platform responses as blocked', () => {
    assert.deepEqual(classifyPlatformHtml('<html>Access Denied captcha</html>', 403), {
      status: 'blocked',
      reason: '平台返回反爬/验证码页面',
    });

    assert.deepEqual(classifyPlatformHtml('<html>short</html>', 200), {
      status: 'blocked',
      reason: '平台返回异常短内容',
    });
  });

  it('does NOT flag a normal page that merely contains "robots"/"bottom" as blocked', () => {
    // Regression: the old bare /bot/ matched <meta name="robots"> and footer__bottom,
    // so every real 200 page was wrongly classified blocked -> all searches returned 0.
    const normalPage =
      '<html><head><meta name="robots" content="all"></head><body>' +
      '<main class="search-results">' + '結果'.repeat(120) + '</main>' +
      '<footer class="footer__bottom footer__bot">© eplus</footer>' +
      '</body></html>';

    assert.equal(normalPage.length > 200, true);
    assert.deepEqual(classifyPlatformHtml(normalPage, 200), { status: 'ok' });
  });

  it('does NOT flag a normal page that mentions captcha/recaptcha in i18n strings', () => {
    // Regression: TicketDive returns HTTP 200 + valid __NEXT_DATA__, but its i18n bundle
    // contains "recaptchaExpired"; bare captcha/recaptcha matching wrongly flagged it blocked.
    const page =
      '<html><body><script id="__NEXT_DATA__" type="application/json">' +
      '{"i18n":{"recaptchaExpired":"reCAPTCHAの有効期限が切れました","captcha":"認証"}}' +
      '</script>' + '内容'.repeat(120) + '</body></html>';
    assert.equal(classifyPlatformHtml(page, 200).status, 'ok');
  });

  it('still flags a real Cloudflare challenge page as blocked', () => {
    const challenge =
      '<html><head><title>Just a moment...</title></head><body>' +
      '<div class="cf-browser-verification"></div>' + 'x'.repeat(300) +
      '</body></html>';
    assert.equal(classifyPlatformHtml(challenge, 200).status, 'blocked');
  });

  it('caches repeated platform text fetches within the TTL', async () => {
    let calls = 0;
    const client = createPlatformHttpClient({
      cacheTtlMs: 1000,
      minIntervalMs: 0,
      fetchImpl: async () => {
        calls += 1;
        return new Response('<html>' + 'a'.repeat(600) + '</html>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        });
      },
    });

    const first = await client.fetchText('https://l-tike.com/search/?keyword=YOASOBI');
    const second = await client.fetchText('https://l-tike.com/search/?keyword=YOASOBI');

    assert.equal(first, second);
    assert.equal(calls, 1);
  });
});

describe('ticket proxy search service', () => {
  it('returns a report for each requested source and keeps searching after one source fails', async () => {
    const service = createSearchService({
      sources: [
        {
          id: 'lawson',
          platform: 'Lawson Ticket',
          parserVersion: 'lawson-test',
          buildSearchUrl: (query) => buildPlatformSearchUrl('Lawson Ticket', query),
          search: async () => [sampleEvent],
        },
        {
          id: 'eplus',
          platform: 'eplus',
          parserVersion: 'eplus-test',
          buildSearchUrl: (query) => buildPlatformSearchUrl('eplus', query),
          search: async () => {
            throw new Error('fixture failure');
          },
        },
      ],
    });

    const result = await service.search('YOASOBI', ['lawson', 'eplus']);

    assert.equal(result.servedBy, 'proxy');
    assert.equal(result.events.length, 1);
    assert.deepEqual(
      result.reports.map((report) => ({
        platform: report.platform,
        status: report.status,
        runtime: report.runtime,
        parserVersion: report.parserVersion,
      })),
      [
        { platform: 'Lawson Ticket', status: 'ok', runtime: 'proxy', parserVersion: 'lawson-test' },
        { platform: 'eplus', status: 'error', runtime: 'proxy', parserVersion: 'eplus-test' },
      ],
    );
    assert.match(result.reports[1].error || '', /fixture failure/);
  });
});

describe('frontend proxy source', () => {
  it('uses proxy search results when the proxy responds successfully', async () => {
    const fetchImpl = async (url: string | URL | Request) => {
      assert.match(String(url), /\/api\/search\?q=YOASOBI&sources=lawson/);
      return new Response(JSON.stringify({
        events: [sampleEvent],
        reports: [{
          platform: 'Lawson Ticket',
          status: 'ok',
          count: 1,
          runtime: 'proxy',
          handoffUrl: buildPlatformSearchUrl('Lawson Ticket', 'YOASOBI'),
        }],
        fetchedAt: '2026-05-25T00:00:00.000Z',
        servedBy: 'proxy',
      }), { status: 200, headers: { 'content-type': 'application/json' } });
    };

    const result = await searchViaProxy('YOASOBI', ['Lawson Ticket'], {
      baseUrl: 'http://127.0.0.1:8787',
      fetchImpl,
    });

    assert.equal(result?.events.length, 1);
    assert.equal(result?.reports[0].runtime, 'proxy');
  });

  it('uses native HTTP for proxy search on native platforms', async () => {
    const result = await searchViaProxy('YOASOBI', ['Lawson Ticket'], {
      baseUrl: 'http://127.0.0.1:8787',
      nativePlatform: true,
      nativeHttpGet: async ({ url }) => {
        assert.match(url, /\/api\/search\?q=YOASOBI&sources=lawson/);
        return {
          status: 200,
          data: {
            events: [sampleEvent],
            reports: [{
              platform: 'Lawson Ticket',
              status: 'ok',
              count: 1,
              runtime: 'proxy',
              handoffUrl: buildPlatformSearchUrl('Lawson Ticket', 'YOASOBI'),
            }],
            fetchedAt: '2026-05-25T00:00:00.000Z',
            servedBy: 'proxy',
          },
        };
      },
    });

    assert.equal(result?.events.length, 1);
    assert.equal(result?.servedBy, 'proxy');
  });

  it('falls back to client search when the proxy is unavailable', async () => {
    const result = await searchWithProxyFallback(
      'YOASOBI',
      ['Lawson Ticket'],
      async () => ({
        events: [sampleEvent],
        reports: [{
          platform: 'Lawson Ticket',
          status: 'ok',
          count: 1,
          runtime: 'client',
          handoffUrl: buildPlatformSearchUrl('Lawson Ticket', 'YOASOBI'),
        }],
      }),
      {
        baseUrl: 'http://127.0.0.1:8787',
        fetchImpl: async () => {
          throw new Error('proxy offline');
        },
      },
    );

    assert.equal(result.events.length, 1);
    assert.equal(result.reports[0].runtime, 'client');
  });
});

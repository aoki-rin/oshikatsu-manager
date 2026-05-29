import type { TicketSearchStatus } from '../src/types';
import { looksLikeAntiBot } from '../src/sources/shared';
import { PlatformSearchError } from './types';

const DEFAULT_UA =
  'Mozilla/5.0 (Linux; Android 15; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36';

export interface PlatformHtmlClassification {
  status: Extract<TicketSearchStatus, 'ok' | 'blocked'>;
  reason?: string;
}

export interface PlatformHttpClientOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  cacheTtlMs?: number;
  minIntervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry {
  html: string;
  expiresAt: number;
}

export function classifyPlatformHtml(html: string, statusCode = 200): PlatformHtmlClassification {
  const check = looksLikeAntiBot(html, statusCode);
  return check.blocked ? { status: 'blocked', reason: check.reason } : { status: 'ok' };
}

export function createPlatformHttpClient(options: PlatformHttpClientOptions = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = options.timeoutMs ?? 20000;
  const cacheTtlMs = options.cacheTtlMs ?? 60_000;
  const minIntervalMs = options.minIntervalMs ?? 800;
  const now = options.now || (() => Date.now());
  const sleep = options.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const cache = new Map<string, CacheEntry>();
  const lastRequestAtByHost = new Map<string, number>();

  async function waitForHost(url: string): Promise<void> {
    if (minIntervalMs <= 0) return;
    const host = new URL(url).host;
    const last = lastRequestAtByHost.get(host) || 0;
    const waitMs = Math.max(0, minIntervalMs - (now() - last));
    if (waitMs > 0) await sleep(waitMs);
    lastRequestAtByHost.set(host, now());
  }

  async function fetchText(url: string, init: RequestInit = {}): Promise<string> {
    const cached = cache.get(url);
    if (cached && cached.expiresAt > now()) return cached.html;

    await waitForHost(url);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        ...init,
        signal: controller.signal,
        headers: {
          'User-Agent': DEFAULT_UA,
          'Accept-Language': 'ja,en-US;q=0.8,en;q=0.6',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          ...(init.headers || {}),
        },
      });
      const html = await response.text();
      const classification = classifyPlatformHtml(html, response.status);
      if (classification.status === 'blocked') {
        throw new PlatformSearchError('blocked', classification.reason || '平台返回反爬/验证码页面');
      }
      if (!response.ok) {
        throw new PlatformSearchError('error', `平台 HTTP ${response.status}`);
      }
      cache.set(url, { html, expiresAt: now() + cacheTtlMs });
      return html;
    } catch (error: any) {
      if (error instanceof PlatformSearchError) throw error;
      if (error?.name === 'AbortError') {
        throw new PlatformSearchError('error', `平台请求超时 ${timeoutMs}ms`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  return { fetchText };
}

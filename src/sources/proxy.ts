import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';
import type { TicketSearchResult } from '../types';

// 代理连不上（Mac 关机 / 不在同一 Tailscale）时快速失败，回退到客户端直连，避免每次搜索干等。
const PROXY_CONNECT_TIMEOUT_MS = 3000;
const PROXY_READ_TIMEOUT_MS = 20000;

interface ProxyOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  nativePlatform?: boolean;
  nativeHttpGet?: (options: { url: string; headers?: Record<string, string>; connectTimeout?: number; readTimeout?: number }) => Promise<{ status: number; data: unknown }>;
}

function configuredProxyBaseUrl(): string | null {
  const env = (import.meta as { env?: { VITE_TICKET_PROXY_BASE_URL?: string; DEV?: boolean } }).env;
  const configured = String(env?.VITE_TICKET_PROXY_BASE_URL || '').trim();
  if (configured) return configured;
  if (!Capacitor.isNativePlatform() && env?.DEV) return '';
  return null;
}

function platformToSourceId(platform: string): string {
  switch (platform) {
    case 'Ticket Pia':
      return 'pia';
    case 'Lawson Ticket':
      return 'lawson';
    case 'LivePocket':
      return 'livepocket';
    case 'TicketDive':
      return 'ticketdive';
    case 'eplus':
      return 'eplus';
    case 'All':
      return 'All';
    default:
      return platform;
  }
}

function buildProxyUrl(baseUrl: string, query: string, activePlatforms: string[]): string {
  const base = baseUrl || window.location.origin;
  const url = new URL('/api/search', base);
  url.searchParams.set('q', query.trim());
  url.searchParams.set('sources', activePlatforms.map(platformToSourceId).join(','));
  return url.toString();
}

export async function searchViaProxy(
  query: string,
  activePlatforms: string[],
  options: ProxyOptions = {},
): Promise<TicketSearchResult | null> {
  const baseUrl = options.baseUrl ?? configuredProxyBaseUrl();
  if (baseUrl === null) return null;
  const url = buildProxyUrl(baseUrl, query, activePlatforms);
  const isNative = options.nativePlatform ?? Capacitor.isNativePlatform();
  if (isNative) {
    const nativeGet = options.nativeHttpGet || CapacitorHttp.get;
    const response = await nativeGet({
      url,
      headers: { Accept: 'application/json' },
      connectTimeout: PROXY_CONNECT_TIMEOUT_MS,
      readTimeout: PROXY_READ_TIMEOUT_MS,
    });
    if (response.status < 200 || response.status >= 300) {
      throw new Error(`代理搜索失败 HTTP ${response.status}`);
    }
    const nativeResult = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
    return normalizeProxyResult(nativeResult);
  }
  const fetchImpl = options.fetchImpl || fetch;
  const response = await fetchImpl(url, {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`代理搜索失败 HTTP ${response.status}`);
  }
  const result = await response.json() as TicketSearchResult;
  return normalizeProxyResult(result);
}

function normalizeProxyResult(result: unknown): TicketSearchResult {
  const value = result as TicketSearchResult;
  return {
    events: Array.isArray(value.events) ? value.events : [],
    reports: Array.isArray(value.reports) ? value.reports : [],
    fetchedAt: value.fetchedAt,
    servedBy: 'proxy',
  };
}

export async function searchWithProxyFallback(
  query: string,
  activePlatforms: string[],
  clientSearch: (query: string, activePlatforms: string[]) => Promise<TicketSearchResult>,
  options: ProxyOptions = {},
): Promise<TicketSearchResult> {
  try {
    const proxyResult = await searchViaProxy(query, activePlatforms, options);
    if (proxyResult) return proxyResult;
  } catch {
    // Client-side CapacitorHttp search remains the Android/offline fallback.
  }
  const clientResult = await clientSearch(query, activePlatforms);
  return {
    ...clientResult,
    servedBy: clientResult.servedBy || 'client',
    reports: clientResult.reports.map((report) => ({
      ...report,
      runtime: report.runtime || 'client',
    })),
  };
}

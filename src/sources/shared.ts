import type {
  ActivityEvent,
  TicketPlatform,
  TicketTimeline,
  TicketWindow,
} from '../types';

// 反爬/验证码指纹（client + server 共用）。
// ⚠️ 不要用裸 'bot'：会误命中 <meta name="robots"> 的 "robots" 和 CSS "footer__bottom"，
// 从而把每个正常页面都判成 blocked（曾导致所有搜索返回 0 结果）。只用精确指纹。
const ANTI_BOT_SIGNATURES =
  /captcha|recaptcha|access denied|cf-browser-verification|cloudflare|不正なアクセス|are you a robot|unusual traffic/i;
const ANTI_BOT_STATUS = new Set([403, 429, 503]);
// 真正异常的页面通常极短（空 body / 截断 / 错误占位）。合法的搜索页/JSON 片段都远大于此。
const MIN_HTML_LENGTH = 200;

export interface AntiBotCheck {
  blocked: boolean;
  reason?: string;
}

// 判定平台响应是否疑似反爬/验证码/异常。仅凭异常状态码 + 精确指纹 + 极短内容判定。
// 解析结果为空（艺人无在售）应在各 source 里走「empty」，不要在这里判 blocked。
export function looksLikeAntiBot(html: string, statusCode = 200): AntiBotCheck {
  if (ANTI_BOT_STATUS.has(statusCode)) {
    return { blocked: true, reason: '平台返回反爬/验证码页面' };
  }
  if (ANTI_BOT_SIGNATURES.test(html)) {
    return { blocked: true, reason: '平台返回反爬/验证码页面' };
  }
  if (html.trim().length < MIN_HTML_LENGTH) {
    return { blocked: true, reason: '平台返回异常短内容' };
  }
  return { blocked: false };
}

export const PLATFORM_IDS: Record<TicketPlatform, string> = {
  'Ticket Pia': 'pia',
  eplus: 'eplus',
  LivePocket: 'livepocket',
  'Lawson Ticket': 'lawson',
  TicketDive: 'ticketdive',
};

export const PLATFORM_SEARCH_TIMEOUT_MS = 25000;

export function withPlatformTimeout<T>(promise: Promise<T>, timeoutMs: number, platform: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${platform} search timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function stripTags(value: string): string {
  return value.replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)));
}

export function absoluteUrl(url: string | null | undefined, base = 'https://l-tike.com'): string | null {
  if (!url) return null;
  try {
    return new URL(url, base).toString();
  } catch {
    return null;
  }
}

const datePart = (iso?: string | null): string | undefined => iso ? iso.slice(0, 10) : undefined;

function isGeneralWindow(window: TicketWindow): boolean {
  return /一般|先着|発売/.test(`${window.roundType} ${window.labelRaw || ''}`);
}

export function deriveTimelineFromWindows(windows: TicketWindow[] = [], now: Date = new Date()): TicketTimeline {
  if (windows.length === 0) return {};
  const nowMs = now.getTime();
  const sorted = [...windows].sort((a, b) => {
    const aEnd = a.applyEnd ? new Date(a.applyEnd).getTime() : Number.MAX_SAFE_INTEGER;
    const bEnd = b.applyEnd ? new Date(b.applyEnd).getTime() : Number.MAX_SAFE_INTEGER;
    return aEnd - bEnd;
  });
  const currentOrNext = sorted.find((window) => !window.applyEnd || new Date(window.applyEnd).getTime() >= nowMs) || sorted[0];
  const general = sorted.find(isGeneralWindow);
  const lottery = sorted.find((window) => !isGeneralWindow(window)) || currentOrNext;
  const paymentWindow = sorted.find((window) => window.resultEnd) || currentOrNext;

  const timeline: TicketTimeline = {};
  if (lottery) {
    timeline.lotteryStartDate = datePart(lottery.applyStart);
    timeline.lotteryEndDate = datePart(lottery.applyEnd);
  }
  if (general) {
    timeline.generalStartDate = datePart(general.applyStart);
    timeline.generalEndDate = datePart(general.applyEnd);
  }
  timeline.paymentDeadlineDate = datePart(paymentWindow?.resultEnd);
  return Object.fromEntries(Object.entries(timeline).filter(([, value]) => Boolean(value))) as TicketTimeline;
}

export function primaryPurchaseUrl(event: Pick<ActivityEvent, 'purchaseUrl' | 'ticketWindows' | 'originalUrl'>): string {
  return event.purchaseUrl
    || event.ticketWindows?.find((window) => window.applyUrl)?.applyUrl
    || event.ticketWindows?.find((window) => window.sourceUrl)?.sourceUrl
    || event.originalUrl;
}

export function normalizeLiveEvent(event: ActivityEvent, platformId: string, fetchedAt = new Date().toISOString()): ActivityEvent {
  const ticketWindows = event.ticketWindows || [];
  const purchaseUrl = primaryPurchaseUrl(event);
  return {
    ...event,
    timeline: Object.keys(event.timeline || {}).length > 0 ? event.timeline : deriveTimelineFromWindows(ticketWindows),
    sourceKind: 'live',
    sourcePlatformId: platformId,
    lastFetchedAt: fetchedAt,
    purchaseUrl,
    originalUrl: event.originalUrl || purchaseUrl,
  };
}

export function dedupeEvents(events: ActivityEvent[]): ActivityEvent[] {
  const map = new Map<string, ActivityEvent>();
  for (const event of events) {
    const existing = map.get(event.id);
    if (!existing) {
      map.set(event.id, event);
      continue;
    }
    const existingTime = existing.lastFetchedAt ? Date.parse(existing.lastFetchedAt) : 0;
    const nextTime = event.lastFetchedAt ? Date.parse(event.lastFetchedAt) : 0;
    map.set(event.id, nextTime >= existingTime ? { ...existing, ...event } : { ...event, ...existing });
  }
  return [...map.values()].sort((a, b) => {
    const aTime = a.lastFetchedAt ? Date.parse(a.lastFetchedAt) : 0;
    const bTime = b.lastFetchedAt ? Date.parse(b.lastFetchedAt) : 0;
    return bTime - aTime;
  });
}

export function buildPlatformSearchUrl(platform: TicketPlatform, query: string): string {
  const q = encodeURIComponent(query.trim());
  switch (platform) {
    case 'Ticket Pia':
      return `https://t.pia.jp/pia/search_all.do?kw=${q}`;
    case 'eplus':
      return `https://eplus.jp/sf/search?keyword=${q}`;
    case 'LivePocket':
      return `https://t.livepocket.jp/event/search?word=${q}`;
    case 'TicketDive':
      return `https://ticketdive.com/search?q=${q}`;
    case 'Lawson Ticket':
      return `https://l-tike.com/search/?keyword=${q}`;
  }
}

export interface TicketSource {
  id: string;
  platform: TicketPlatform;
  search(query: string): Promise<ActivityEvent[]>;
  buildSearchUrl(query: string): string;
}

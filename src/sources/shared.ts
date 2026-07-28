import type {
  ActivityEvent,
  TicketPlatform,
  TicketTimeline,
  TicketWindow,
} from '../types';

// 反爬/验证码指纹（client + server 共用）。
// ⚠️ 只匹配「挑战页基础设施」专属串，绝不用宽泛关键词。踩过两次坑：
//   - 裸 'bot' → 误命中 <meta name="robots"> 的 "robots" / CSS "footer__bottom"
//   - 裸 'captcha'/'recaptcha'/'cloudflare' → 误命中正常页面 i18n 文案
//     （如 TicketDive 的 "recaptchaExpired" 翻译串）→ 正常页被判 blocked
// 宁可漏判(当成 empty/普通页)也不要错判(把能用的平台判成受限)。真正的拦截主要靠
// 异常状态码(403/429/503)；内容指纹只取挑战页独有的标记。
const ANTI_BOT_SIGNATURES =
  /cf-browser-verification|\/cdn-cgi\/challenge-platform\/|incapsula incident id|pardon our interruption|unusual traffic from your computer|are you a (robot|human)\?/i;
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

// 每平台超时上限。Lawson 曾被压到 8s：当时直连必被反爬拖死（ADR-0002），压低只为快速失败。
// ADR-0005 之后 Cronet 成了能用的主路径（实测 300-500ms），8s 反而会在弱信号下误杀一次
// 180KB 的正常抓取 —— 而「人在外面、信号不好」正是本 app 的核心使用场景。回归默认 25s。
const PLATFORM_TIMEOUT_OVERRIDES: Partial<Record<string, number>> = {};
export function platformSearchTimeoutMs(platform: string): number {
  return PLATFORM_TIMEOUT_OVERRIDES[platform] ?? PLATFORM_SEARCH_TIMEOUT_MS;
}

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
    const resolved = new URL(url, base);
    // 只放行 http(s)：搜索页常有 href="javascript:void(0)" 之类占位链接，若当成有效 URL 存进
    // applyUrl/purchaseUrl，点「前往购票」时会被安全拦截而毫无反应（Lawson 踩过这个坑）。
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return null;
    return resolved.toString();
  } catch {
    return null;
  }
}

const datePart = (iso?: string | null): string | undefined => iso ? iso.slice(0, 10) : undefined;

export function isGeneralWindow(window: TicketWindow): boolean {
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

// href 是否是可直接打开的 http(s) 链接（挡掉 javascript:/data: 等占位/危险串）。
export function isHttpUrl(url?: string | null): url is string {
  return !!url && (url.startsWith('http://') || url.startsWith('https://'));
}

// 把名称归一成稳定 slug：用于把「同一艺人 / 会场」跨平台、跨搜索合并成同一 id
// （旧做法 id 含平台前缀 + 查询词/事件码 → 同一会场每场都是不同 id、同一艺人各平台各一份）。
// NFKC 抹平全/半角差异；占位/空名（如 '—'）不参与合并，返回 '' → 调用方回退到 per-event id。
function slugifyName(name: string | null | undefined): string {
  const t = (name || '').normalize('NFKC').trim();
  if (!t || t === '—' || t === '-') return '';
  return t.toLowerCase().replace(/\s+/g, '');
}
export function canonicalArtistId(name: string | null | undefined): string {
  const s = slugifyName(name);
  return s ? `artist-${s}` : '';
}
// 多个平台在会场名后缀「都道府县」标注（如 "GLION ARENA KOBE（兵庫県）" vs "GLION ARENA KOBE"），
// 这是平台注释而非会场名本身。去掉结尾的「（…都/道/府/県）」后缀，让同一会场跨平台合并成同一 id
// （否则关注会场只能命中带后缀那一个平台的场次）。先 NFKC 把全角括号归一成半角再匹配。
function stripVenuePrefecture(name: string): string {
  return name.normalize('NFKC').replace(/\s*\([^()]*[都道府県]\)\s*$/u, '').trim();
}
export function canonicalVenueId(name: string | null | undefined): string {
  const s = slugifyName(stripVenuePrefecture(name || ''));
  return s ? `venue-${s}` : '';
}

export function primaryPurchaseUrl(event: Pick<ActivityEvent, 'purchaseUrl' | 'ticketWindows' | 'originalUrl'>): string {
  const candidates = [
    event.purchaseUrl,
    event.ticketWindows?.find((window) => isHttpUrl(window.applyUrl))?.applyUrl,
    event.ticketWindows?.find((window) => isHttpUrl(window.sourceUrl))?.sourceUrl,
    event.originalUrl,
  ];
  return candidates.find(isHttpUrl) || event.originalUrl;
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
      // 2026-07 改版：新站在裸域名（旧 t.livepocket.jp 只剩【旧サイト】残页）
      return `https://livepocket.jp/event/search?word=${q}`;
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

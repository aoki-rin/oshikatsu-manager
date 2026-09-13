import type { ActivityEvent, TicketWindow } from '../types';
import {
  absoluteUrl,
  buildPlatformSearchUrl,
  canonicalArtistId,
  canonicalVenueId,
  decodeHtml,
  deriveTimelineFromWindows,
  normalizeLiveEvent,
  stripTags,
} from './shared';

const PLACEHOLDER_IMG =
  'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=400&q=80';

const z2 = (value: string | number) => String(value).padStart(2, '0');

function normalizeDigits(value: string): string {
  return value.replace(/[０-９]/g, (char) => String(char.charCodeAt(0) - 0xff10));
}

function lawsonIso(value: string): string | null {
  const normalized = normalizeDigits(value).normalize('NFKC');
  const match = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})(?:\([^)]*\))?\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${z2(match[2])}-${z2(match[3])}T${z2(match[4])}:${match[5]}:00+09:00`;
}

function lawsonDate(value: string): string {
  const normalized = normalizeDigits(value).normalize('NFKC');
  const match = normalized.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  return match ? `${match[1]}-${z2(match[2])}-${z2(match[3])}` : '';
}

export function explicitLawsonDates(attribute: string): string[] {
  if (!/^\d{8}(?:,\d{8})*$/.test(attribute)) return [];
  return [...new Set(attribute.split(','))].map(value => `${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`)
    .filter(value => { const d = new Date(`${value}T00:00:00Z`); return !Number.isNaN(d.getTime()) && d.toISOString().slice(0,10) === value; });
}

function firstMatch(value: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return decodeHtml(stripTags(match[1])).trim();
  }
  return '';
}

function allResultBlocks(html: string): string[] {
  const explicit = [
    ...html.matchAll(/<section[^>]*class="[^"]*search-result-item[^"]*"[^>]*>([\s\S]*?)<\/section>/gi),
  ].map((match) => match[1]);
  if (explicit.length > 0) return explicit;

  return html
    .replace(/<h3/gi, '\n@@LAWSON_H3@@<h3')
    .split('@@LAWSON_H3@@')
    .filter((block) => /公演日|受付期間|申込\/詳細|お申し込みはこちら/.test(block));
}

function extractTitle(block: string, query: string): string {
  return firstMatch(block, [
    /<h3[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>\s*<\/h3>/i,
    /<h3[^>]*>([\s\S]*?)<\/h3>/i,
    /###\s*([^\n]+)/,
  ]) || query;
}

function extractHref(block: string, fallback: RegExp): string | null {
  const anchors = [...block.matchAll(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi)];
  const applyAnchor = anchors.find((anchor) => {
    const href = anchor[1];
    const label = decodeHtml(stripTags(anchor[2]));
    return /お申し込み|申込/.test(label) || /\/(?:order|entry)\//i.test(href);
  });
  const href = applyAnchor?.[1] || block.match(fallback)?.[1];
  return absoluteUrl(href || null);
}

function extractSourceHref(block: string): string | null {
  const h3 = block.match(/<h3[^>]*>\s*<a[^>]+href="([^"]+)"/i)?.[1];
  const href = h3 || block.match(/href="([^"]*mevent[^"]*)"/i)?.[1];
  return absoluteUrl(href || null);
}

const APPLY_RANGE_RE =
  /(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)?\s*\d{1,2}:\d{2})\s*[~～〜]\s*(\d{4}\/\d{1,2}\/\d{1,2}\([^)]*\)?\s*\d{1,2}:\d{2})/;

function extractWindow(block: string, eventId: string): TicketWindow | null {
  const text = decodeHtml(stripTags(block)).normalize('NFKC');
  const range = text.match(APPLY_RANGE_RE);
  if (!range) return null;
  const methodMatch = text.match(/販売方法\s*([^\n]*?)(?:受付期間|発売前|発売中|申込\/詳細)/);
  const statusMatch = text.match(/(発売前|発売中|受付中|予定枚数終了|販売終了)/);
  const roundType = methodMatch?.[1]?.replace(/\s+/g, ' ').trim() || (/先着/.test(text) ? '先着' : '受付');
  const applyUrl = extractHref(block, /href="([^"]*(?:order|entry|ticket|event)[^"]*)"/i);
  const sourceUrl = extractSourceHref(block) || applyUrl || buildPlatformSearchUrl('Lawson Ticket', '');
  return {
    id: `${eventId}-0`,
    platform: 'Lawson Ticket',
    roundType,
    labelRaw: methodMatch?.[1]?.trim(),
    applyStart: lawsonIso(range[1]),
    applyEnd: lawsonIso(range[2]),
    statusText: statusMatch?.[1],
    sourceUrl,
    applyUrl,
  };
}

// ===== 现行搜索页（ResultBox 结构，2026-07 实测）=====
// 一个兴行一个 <div class="ResultBox … prfSummaryItem">：标题在 ResultBox__title（整组唯一的
// h3，按 h3 切块必坍缩）；「同興行の公演数分」生成 ResultBox__informations（公演日+会場），
// 每轮受付一个 prfItem 表格。申込按钮是 javascript:void(0) + data-*（lcode/schduleNo/prfDate…），
// 逐轮无真实链接；组外页脚可能残留不相干 mevent 链接（踩过：注释态新闻链 mid=444647），
// 详情跳转只允许取组内链接。

// 标签内属性区一律加长度上限（{1,400}）：无界 [^>]+ 配上惰性扫描在构造的无 > 输入上是
// 二次方回溯（实测 200KB 走 3-6 秒），这里的输入是第三方 HTML，别赌它永远善意。
const RESULTBOX_START_RE = /<div[^>]{1,400}class="[^"]*\bprfSummaryItem\b[^"]*"/gi;
const RESULTBOX_END_RE = /<footer\b|class="Pagination/i;
// 解析输入上限：真实搜索页 ~200-370KB；超出的一律截断（配合上面的回溯上限做双保险）。
const MAX_PARSE_HTML = 500_000;

function resultBoxGroups(html: string): string[] {
  const starts = [...html.matchAll(RESULTBOX_START_RE)].map((match) => match.index ?? 0);
  if (starts.length === 0) return [];
  // 边界只在末组【之后】找：结果上方的分页条/提前出现的 footer 会把全文首个匹配推到组前，
  // 那样末组会切到文末、重新吞进页脚注释里的 mevent 新闻链（mid=444647 之坑，三路评审同报）。
  const lastStart = starts[starts.length - 1];
  const tailOffset = html.slice(lastStart).search(RESULTBOX_END_RE);
  const end = tailOffset >= 0 ? lastStart + tailOffset : html.length;
  return starts.map((start, i) => html.slice(start, i + 1 < starts.length ? starts[i + 1] : end));
}

// 只信 l-tike 自家域名的链接。scheme 门（absoluteUrl）拦不住 https://evil.example/mevent-x，
// 纯锚点 "#x" 还会被相对解析成合法的 https://l-tike.com/#x——两类都要显式拒绝。
function lawsonSiteUrl(href: string | null | undefined): string | undefined {
  if (!href || href.startsWith('#')) return undefined;
  const abs = absoluteUrl(href);
  if (!abs) return undefined;
  try {
    const host = new URL(abs).hostname;
    return host === 'l-tike.com' || host.endsWith('.l-tike.com') ? abs : undefined;
  } catch {
    return undefined;
  }
}

function dataAttrs(fragment: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const match of fragment.matchAll(/data-([A-Za-z]+)="([^"]*)"/g)) {
    attrs[match[1].toLowerCase()] = attrs[match[1].toLowerCase()] || match[2];
  }
  return attrs;
}

function informationText(chunk: string, label: string): string {
  return firstMatch(chunk, [
    new RegExp(`${label}[:：]\\s*</dt>\\s*<dt[^>]*>([\\s\\S]*?)</dt>`, 'i'),
  ]);
}

function parsePrfWindow(item: string, eventId: string, sourceUrl: string, ordinal: number): TicketWindow | null {
  const attrs = dataAttrs(item);
  const reception = firstMatch(item, [/id="reception_typename"[^>]*>([\s\S]*?)<\/span>/i]);
  const saleName = firstMatch(item, [/id="sale_name"[^>]*>([\s\S]*?)<\/span>/i]);
  const status = firstMatch(item, [/class="[^"]*ResultBox__status[^"]*"[^>]*>([\s\S]*?)<\/p>/i]);
  const range = decodeHtml(stripTags(item)).normalize('NFKC').match(APPLY_RANGE_RE);
  if (!range && !status) return null;
  // 申込链接须过双重门：①形状启发（标签含 申込，或路径含 /order|entry/——沿用旧路径的判据；
  // 轮次块尾部会混进 FC 页签等 l-tike 站内链接，光钉域名不够）②lawsonSiteUrl 钉域 + 拒纯锚点。
  const applyUrl = [...item.matchAll(/<a[^>]{1,400}href="([^"]+)"[^>]*>([\s\S]{0,200}?)<\/a>/gi)]
    .filter((match) => /お申し込み|申込/.test(decodeHtml(stripTags(match[2]))) || /\/(?:order|entry)\//i.test(match[1]))
    .map((match) => lawsonSiteUrl(match[1]))
    .find((url): url is string => Boolean(url));
  return {
    // schduleNo 是平台自身的轮次号（跨公演一致、轮次关闭不漂移），比 salesIdx 顺位更稳。
    // 用 ||（勿用 ??）：data-schduleNo="" 的空串会让多轮撞出同一 id，提醒互相覆盖；"0" 为真值不受影响。
    id: `${eventId}-${attrs.schduleno || attrs.salesidx || ordinal}`,
    platform: 'Lawson Ticket',
    roundType: [reception, saleName].filter(Boolean).join(' ') || '受付',
    labelRaw: saleName || undefined,
    applyStart: range ? lawsonIso(range[1]) : null,
    applyEnd: range ? lawsonIso(range[2]) : null,
    statusText: status || undefined,
    sourceUrl,
    applyUrl,
  };
}

// data 属性值要进持久化 id，只收字母数字下划线；页面给了怪值就当没给。
function safeIdPart(value: string | undefined): string {
  return value && /^\w+$/.test(value) ? value : '';
}

function parseResultBoxGroup(group: string, query: string, groupIdx: number, fetchedAt: string): ActivityEvent[] {
  const title = firstMatch(group, [/<h3[^>]{0,400}class="[^"]*ResultBox__title[^"]*"[^>]*>([\s\S]*?)<\/h3>/i]) || query;
  const meventHref = group.match(/<a[^>]{1,400}href="([^"]*mevent[^"]*)"/i)?.[1];
  const artistHref = group.match(/<a[^>]{1,400}href="((?:https?:\/\/l-tike\.com)?\/artist\/[^"]+)"/i)?.[1];
  // 详情跳转域名钉死 l-tike：mevent 宽匹配曾吃过页脚新闻链的亏，scheme 门拦不住外域。
  const groupUrl = lawsonSiteUrl(meventHref) || lawsonSiteUrl(artistHref) || buildPlatformSearchUrl('Lawson Ticket', query);
  const imageUrl = [...group.matchAll(/<img[^>]{1,400}src="(https?:\/\/[^"]+)"/gi)]
    .map((match) => match[1])
    .find((src) => !/noImage/i.test(src)) || PLACEHOLDER_IMG;
  const groupLcode = safeIdPart(dataAttrs(group).lcode);
  // 无 Lコード时的回退基底：标题 slug（内容派生，乱序不漂移）；位置序号 g${groupIdx} 只作最后手段
  //（会随排序漂移 + 跨搜索撞车——与本仓 Pia 修掉的 b${bi} 同病）。
  const titleSlug = (canonicalArtistId(title) || '').replace(/^artist-/, '').slice(0, 24);

  const chunks = group.split(/(?=<dl[^>]{0,400}class="[^"]*ResultBox__informations)/i).slice(1);
  const events: ActivityEvent[] = [];
  const seenIds = new Set<string>();
  chunks.forEach((chunk, prfIdx) => {
    const venue = informationText(chunk, '会場') || '—';
    const firstDate = lawsonDate(informationText(chunk, '公演日'));
    const prfAttrs = dataAttrs(chunk);
    const explicitDates = explicitLawsonDates(prfAttrs.prfdate || '');
    for (const date of explicitDates.length ? explicitDates : [firstDate]) {
      const prfDate = date.replace(/-/g, '');
      // Lコード优先取本公演自己按钮上的（若平台某天改成逐轮发码，id 至少绑住本场，不随他轮下架漂移）
      const base = safeIdPart(prfAttrs.lcode) || groupLcode || titleSlug || `g${groupIdx}`;
      let eventId = `lawson-${base}-${prfDate || `p${prfIdx}`}`;
      if (seenIds.has(eventId)) {
        // 同日昼夜二部：prfDate 只有日粒度，同 id 会被 dedupeEvents 吞掉一场——
        // 用 pfKeys（平台自身的公演键，跨轮一致）消歧；缺失时才退位置后缀。
        eventId = `${eventId}-${safeIdPart(prfAttrs.pfkeys).slice(-6) || `p${prfIdx}`}`;
      }
      seenIds.add(eventId);
      // 末尾边界含 ResultBlock（组尾出演者模块）：否则最后一轮的切片会吞进出演者链接，
      // applyUrl 误取 /artist/ 页。
      const items = [
        ...chunk.matchAll(/<div[^>]{1,400}class="[^"]*ResultBox__table\s+prfItem[^"]*"[\s\S]*?(?=<div[^>]{1,400}class="[^"]*ResultBox__table\s+prfItem|<div[^>]{1,400}class="[^"]*ResultBlock\b|$)/gi),
      ].map((match) => match[0]);
      const windows = items
        .map((item, i) => parsePrfWindow(item, eventId, groupUrl, i))
        .filter((window): window is TicketWindow => window !== null);
      if (!date && windows.length === 0) continue;
      events.push(normalizeLiveEvent({
        id: eventId,
        title,
        artistId: canonicalArtistId(query) || `lawson-artist-${query}`,
        artistName: query,
        artistSource: 'query',
        venueId: canonicalVenueId(venue) || `lawson-venue-${eventId}`,
        venueName: venue,
        date,
        time: '',
        region: venue.match(/[（(]([^）)]+)[）)]/)?.[1] || '',
        platform: 'Lawson Ticket',
        price: '—',
        imageUrl,
        timeline: deriveTimelineFromWindows(windows),
        ticketWindows: windows,
        originalUrl: groupUrl,
        description: `${title}（Lawson Ticket 平台实时搜索结果）`,
        category: 'J-Pop',
        tags: ['Lawson Ticket', '实时'],
        purchaseUrl: groupUrl,
      }, 'lawson', fetchedAt));
    }
  });
  return events;
}

export function isLawsonZeroResults(html: string): boolean {
  const text = decodeHtml(stripTags(html)).normalize('NFKC');
  return /検索結果[:：]\s*0\s*件|条件に一致する|該当する公演はありません|見つかりませんでした/.test(text);
}

export function parseLawsonSearch(rawHtml: string, query: string, fetchedAt = new Date().toISOString()): ActivityEvent[] {
  const html = rawHtml.length > MAX_PARSE_HTML ? rawHtml.slice(0, MAX_PARSE_HTML) : rawHtml;
  // 现行 ResultBox 结构优先；旧结构（search-result-item / h3 行）走下面的遗留路径。
  const groups = resultBoxGroups(html);
  if (groups.length > 0) {
    return groups.flatMap((group, groupIdx) => parseResultBoxGroup(group, query, groupIdx, fetchedAt));
  }
  const blocks = allResultBlocks(html);
  const events: ActivityEvent[] = [];
  blocks.forEach((block, index) => {
    const title = extractTitle(block, query);
    const text = decodeHtml(stripTags(block));
    const detailUrl = extractSourceHref(block) || buildPlatformSearchUrl('Lawson Ticket', query);
    const code = detailUrl.match(/(?:mid|lcd|gLcode)=?(\d+)/)?.[1] || String(index);
    const eventId = `lawson-${code}`;
    const venue = firstMatch(text, [
      /会場[:：]\s*([\s\S]*?)(?:販売方法|受付期間|申込\/詳細|$)/,
    ]) || '—';
    const date = lawsonDate(firstMatch(text, [/公演日[:：]\s*([\s\S]*?)(?:会場|販売方法|$)/]));
    const window = extractWindow(block, eventId);
    const windows = window ? [window] : [];
    const purchaseUrl = window?.applyUrl || detailUrl;
    if (!title || (!date && windows.length === 0)) return;
    events.push(normalizeLiveEvent({
      id: eventId,
      title,
      artistId: canonicalArtistId(query) || `lawson-artist-${query}`,
      artistName: query,
      artistSource: 'query',
      venueId: canonicalVenueId(venue) || `lawson-venue-${code}`,
      venueName: venue,
      date,
      time: '',
      region: venue.match(/[（(]([^）)]+)[）)]/)?.[1] || '',
      platform: 'Lawson Ticket',
      price: '—',
      imageUrl: PLACEHOLDER_IMG,
      timeline: deriveTimelineFromWindows(windows),
      ticketWindows: windows,
      originalUrl: detailUrl,
      description: `${title}（Lawson Ticket 平台实时搜索结果）`,
      category: 'J-Pop',
      tags: ['Lawson Ticket', '实时'],
      purchaseUrl,
    }, 'lawson', fetchedAt));
  });
  return events;
}

// 旧缓存的明确日期列表可以无网络展开；旧默认午夜不是官方开演时间。
export function migrateLawsonEvent(event: ActivityEvent): ActivityEvent[] {
  if (event.platform !== 'Lawson Ticket' || typeof event.id !== 'string' || event.id.startsWith('agg-') || (event.ticketWindows != null && !Array.isArray(event.ticketWindows))) return [event];
  const match = event.id.match(/^(lawson-.+-)(\d{8}(?:,\d{8})+)(.*)$/);
  const dates = match ? explicitLawsonDates(match[2]) : [event.date];
  return dates.map(date => {
    const id = match ? `${match[1]}${date.replace(/-/g, '')}${match[3]}` : event.id;
    if (id === event.id && event.time !== '00:00') return event;
    return { ...event, id, date, time: event.time === '00:00' ? '' : event.time,
      // 不把一对多的旧 id 写到每一场的收藏别名里（否则新收藏又会串场）。
      memberIds: match ? undefined : event.memberIds,
      ticketWindows: (event.ticketWindows ?? []).map(w => ({ ...w,
        id: w.id.replace(event.id, id),
        previousIds: id === event.id ? w.previousIds : [...new Set([w.id, ...(w.previousIds ?? [])])],
      })),
    };
  });
}

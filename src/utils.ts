import { ActivityEvent, TicketPlatform } from './types';
import { createTranslator, type TFunction } from './i18n/core';
import { deliverIcs } from './native';
import { isGeneralWindow } from './sources/shared';

const JST_TIME_ZONE = 'Asia/Tokyo';
const defaultT = createTranslator('zh-CN');

// 统一的平台展示短名（各平台的常用品牌名）。内部仍用 TicketPlatform 全名做逻辑/存储，
// 仅用于界面展示，保证「卡片徽标 / 筛选 chip / 搜索报告 / 打开按钮 / 详情页」叫法一致。
// 接受任意字符串：抓取来的窗口 platform 可能是 'Fan Club' / 'unknown' 等，原样返回。
const PLATFORM_LABELS: Record<string, string> = {
  'Ticket Pia': 'ぴあ',
  eplus: 'e+',
  LivePocket: 'LivePocket',
  'Lawson Ticket': 'ローチケ',
  TicketDive: 'TicketDive',
};

export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

// 抓取来的 time 形态不可信：''(空串不触发默认参!)/'0:00'(一位小时)/垃圾字符串都出现过，
// 直接拼会产出 T00 之类的非法 DTSTART——单条坏 VEVENT 就能让日历导入器拒收整份文件（真机实测）。
export function normalizeIcsTime(timeStr: string | null | undefined): string {
  const m = (timeStr || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return '00:00';
  const hour = Math.min(23, Number(m[1]));
  const minute = Math.min(59, Number(m[2]));
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

// Convert simple YYYY-MM-DD and HH:MM to ICS-compatible local time string
export function formatToIcsDate(dateStr: string, timeStr: string = '00:00'): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = normalizeIcsTime(timeStr).replace(/:/g, '');
  return `${cleanDate}T${cleanTime}00`;
}

// RFC 5545 3.1：内容行超 75 字节须折行（CRLF + 单个空格续行）。日文 SUMMARY/DESCRIPTION
// 一超就是几十字节，部分导入器会截断或报错。按 UTF-8 字节数折，且不切开多字节字符。
export function foldIcsLine(line: string): string {
  const LIMIT = 75;
  if (Buffer_byteLength(line) <= LIMIT) return line;
  const out: string[] = [];
  let current = '';
  let currentBytes = 0;
  const budget = () => (out.length === 0 ? LIMIT : LIMIT - 1); // 续行行首有空格占 1 字节
  for (const ch of line) {
    const chBytes = Buffer_byteLength(ch);
    if (currentBytes + chBytes > budget()) {
      out.push(current);
      current = ch;
      currentBytes = chBytes;
    } else {
      current += ch;
      currentBytes += chBytes;
    }
  }
  if (current) out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join('\r\n');
}

// 浏览器/WebView 无 Buffer：TextEncoder 计字节。
function Buffer_byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

// 每个 VEVENT 的提前 1 天本地提醒（DISPLAY）。「导出到手机日历」的意义就是到点别错过——
// 没有 VALARM 的日程只是记录，不是提醒。
export function icsAlarmLines(summary: string): string[] {
  return [
    'BEGIN:VALARM',
    'TRIGGER:-P1D',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeIcs(summary)}`,
    'END:VALARM',
  ];
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function utcStamp(date: Date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export function getJstDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function jstParts(date: Date): Record<string, string> {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: JST_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = part.value;
    return acc;
  }, {});
}

function addMinutesAsJstIcs(dateStr: string, timeStr: string, minutes: number): string {
  const source = new Date(`${dateStr}T${normalizeIcsTime(timeStr)}:00+09:00`);
  const shifted = new Date(source.getTime() + minutes * 60000);
  const parts = jstParts(shifted);
  return `${parts.year}${parts.month}${parts.day}T${parts.hour}${parts.minute}00`;
}

function targetDateFor(
  event: ActivityEvent,
  targetDateType: 'concert' | 'lottery_end' | 'payment',
  t: TFunction,
): { summary: string; date: string; time: string; durationMinutes: number; description: string } {
  const url = event.purchaseUrl || event.originalUrl;
  if (targetDateType === 'lottery_end') {
    return {
      summary: t('ics.summary.lotteryEnd', { title: event.title }),
      date: event.timeline.lotteryEndDate || event.date,
      time: '23:59',
      durationMinutes: 15,
      description: t('ics.description.lotteryEnd', { platform: event.platform, url }),
    };
  }
  if (targetDateType === 'payment') {
    return {
      summary: t('ics.summary.payment', { title: event.title }),
      date: event.timeline.paymentDeadlineDate || event.date,
      time: '23:00',
      durationMinutes: 15,
      description: t('ics.description.payment', { platform: event.platform, url }),
    };
  }
  return {
    summary: event.title,
    date: event.date,
    time: event.time || '18:00',
    durationMinutes: 180,
    description: t('ics.description.concert', {
      description: event.description,
      platform: event.platform,
      price: event.price,
      url,
    }),
  };
}

export function buildEventIcs(
  event: ActivityEvent,
  targetDateType: 'concert' | 'lottery_end' | 'payment' = 'concert',
  now: Date = new Date(),
  t: TFunction = defaultT,
): string {
  const target = targetDateFor(event, targetDateType, t);
  // 无有效日期 → 不产出 VEVENT（否则 DTSTART 会是裸时间 T…，导致整份 .ics 无法导入）。
  if (!target.date) return '';
  const startFormatted = formatToIcsDate(target.date, target.time);
  const endFormatted = addMinutesAsJstIcs(target.date, target.time, target.durationMinutes);
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OshikatsuManager//JA_LIVE_AGGREGATOR//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    `TZID:${JST_TIME_ZONE}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'END:STANDARD',
    'END:VTIMEZONE',
    'BEGIN:VEVENT',
    `UID:${event.id}-${targetDateType}@oshikatsu.manager`,
    `DTSTAMP:${utcStamp(now)}`,
    `DTSTART;TZID=${JST_TIME_ZONE}:${startFormatted}`,
    `DTEND;TZID=${JST_TIME_ZONE}:${endFormatted}`,
    `SUMMARY:${escapeIcs(target.summary)}`,
    `DESCRIPTION:${escapeIcs(target.description)}`,
    `LOCATION:${escapeIcs(event.venueName)}`,
    `URL:${event.purchaseUrl || event.originalUrl}`,
    'STATUS:CONFIRMED',
    ...icsAlarmLines(target.summary),
    'END:VEVENT',
    'END:VCALENDAR',
  ].map(foldIcsLine).join('\r\n');
}

// Generate an ICS string and trigger a download for a clean Japanese Live Event
export async function downloadEventIcs(
  event: ActivityEvent,
  targetDateType: 'concert' | 'lottery_end' | 'payment' = 'concert',
  t: TFunction = defaultT,
): Promise<void> {
  const icsString = buildEventIcs(event, targetDateType, new Date(), t);
  if (!icsString) return; // 无有效日期：跳过，避免导出损坏文件。
  await deliverIcs(`${event.artistName}_${targetDateType}_reminder.ics`, icsString);
}

// 纯构建函数（与 deliverIcs 解耦——此前 build/deliver 耦在一起，导出内容从未被完整单测，
// 非法 DTSTART 混进真机导出文件才被发现）。空日程返回 ''（调用方跳过投递）。
export function buildAllFollowedEventsIcs(events: ActivityEvent[], t: TFunction = defaultT): string {
  const icsLines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OshikatsuManager//ALL_FOLLOWED_CALENDAR//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VTIMEZONE',
    `TZID:${JST_TIME_ZONE}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0900',
    'TZOFFSETTO:+0900',
    'TZNAME:JST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  events.forEach((event) => {
    // 1. Live Concert Event（无日期则跳过，避免裸时间 DTSTART 污染整份日历）
    if (event.date) {
      const liveStart = formatToIcsDate(event.date, event.time);
      const liveEnd = addMinutesAsJstIcs(event.date, event.time || '18:00', 180);
      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${event.id}-concert-all@oshikatsu.manager`,
        `DTSTAMP:${utcStamp()}`,
        `DTSTART;TZID=${JST_TIME_ZONE}:${liveStart}`,
        `DTEND;TZID=${JST_TIME_ZONE}:${liveEnd}`,
        `SUMMARY:${escapeIcs(t('ics.summary.allConcert', { title: event.title }))}`,
        `DESCRIPTION:${escapeIcs(event.description.slice(0, 100))}`,
        `LOCATION:${escapeIcs(event.venueName)}`,
        `URL:${event.purchaseUrl || event.originalUrl}`,
        ...icsAlarmLines(t('ics.summary.allConcert', { title: event.title })),
        'END:VEVENT'
      );
    }

    // 2. Lottery End Alert if exists
    if (event.timeline.lotteryEndDate) {
      const lotStart = formatToIcsDate(event.timeline.lotteryEndDate, '23:59');
      const lotEnd = addMinutesAsJstIcs(event.timeline.lotteryEndDate, '23:59', 15);
      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${event.id}-lottery-all@oshikatsu.manager`,
        `DTSTAMP:${utcStamp()}`,
        `DTSTART;TZID=${JST_TIME_ZONE}:${lotStart}`,
        `DTEND;TZID=${JST_TIME_ZONE}:${lotEnd}`,
        `SUMMARY:${escapeIcs(t('ics.summary.allLottery', { artist: event.artistName }))}`,
        `DESCRIPTION:${escapeIcs(t('ics.description.allLottery', { platform: event.platform, url: event.purchaseUrl || event.originalUrl }))}`,
        `LOCATION:${escapeIcs(event.venueName)}`,
        ...icsAlarmLines(t('ics.summary.allLottery', { artist: event.artistName })),
        'END:VEVENT'
      );
    }
  });

  if (!icsLines.some((line) => line === 'BEGIN:VEVENT')) return ''; // 没有任何可导出的日程
  icsLines.push('END:VCALENDAR');
  return icsLines.map(foldIcsLine).join('\r\n');
}

// Generate dynamic ICS Calendar comprising all followed items
export async function downloadAllFollowedEventsIcs(events: ActivityEvent[], t: TFunction = defaultT): Promise<void> {
  const icsString = buildAllFollowedEventsIcs(events, t);
  if (!icsString) return;
  await deliverIcs('oshikatsu_all_schedule.ics', icsString);
}

// Simple localized helper to format display dates
export function formatDisplayDate(dateStr: string): string {
  const [, month, day] = (dateStr || '').split('-');
  if (!month || !day) return dateStr || ''; // 缺日期不显示 "undefined月undefined日"
  return `${month}月${day}日`;
}

// Calculate days remaining to a future date
export function getDaysRemaining(targetDateStr: string, currentDateStr: string = getJstDateKey()): number {
  const target = new Date(`${targetDateStr}T00:00:00+09:00`);
  const current = new Date(`${currentDateStr}T00:00:00+09:00`);
  const diffTime = target.getTime() - current.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

export interface PrimaryDeadline {
  kind: 'lottery' | 'general';
  label?: string; // 轮次名（来自 window.roundType，如「★一般発売」），有则卡片直接显示
  endDate: string; // YYYY-MM-DD (JST)
  daysLeft: number;
  closed: boolean;
}

// 卡片摘要用的「最相关截止」（QA #3 回归）：
// 旧卡片只看 timeline.lotteryEndDate → 先行早截止而一般発売还在受付时错误显示「已截止」。
// 且 deriveTimelineFromWindows 的 general 取「最早结束」的先着/一般轮（多轮时活跃轮被丢，
// 真机实测 GIGA 7 轮数据仍显示已截止）——所以这里【直接读 ticketWindows】选轮：
// 未截止的轮里取截止最早的；全过期取最晚那轮标 closed；无窗口数据的老事件退回 timeline 字段。
export function primaryDeadline(
  event: Pick<ActivityEvent, 'timeline' | 'ticketWindows'>,
  currentDateStr: string = getJstDateKey(),
): PrimaryDeadline | null {
  const candidates: Array<Omit<PrimaryDeadline, 'daysLeft' | 'closed'>> = [];

  for (const window of event.ticketWindows ?? []) {
    if (!window.applyEnd) continue;
    candidates.push({
      kind: isGeneralWindow(window) ? 'general' : 'lottery',
      label: window.roundType || undefined,
      endDate: window.applyEnd.slice(0, 10),
    });
  }
  if (candidates.length === 0) {
    const timeline = event.timeline || {};
    if (timeline.lotteryEndDate) candidates.push({ kind: 'lottery', endDate: timeline.lotteryEndDate });
    if (timeline.generalEndDate) candidates.push({ kind: 'general', endDate: timeline.generalEndDate });
  }
  if (candidates.length === 0) return null;

  const withDays = candidates.map((candidate) => ({
    ...candidate,
    daysLeft: getDaysRemaining(candidate.endDate, currentDateStr),
  }));
  const open = withDays.filter((candidate) => candidate.daysLeft >= 0).sort((a, b) => a.daysLeft - b.daysLeft);
  if (open.length > 0) return { ...open[0], closed: false };
  const latest = [...withDays].sort((a, b) => b.daysLeft - a.daysLeft)[0];
  return { ...latest, closed: true };
}

type ActionSortable = Pick<ActivityEvent, 'timeline' | 'ticketWindows' | 'date'>;

// 列表「可行动性」排序（QA #7）：旧排序按抓取时间，已截止的场次常年霸榜首。
// 新规则：①还能报名的（截止越近越靠前）→ ②无截止信息的（开演日近的在前）→ ③已全截止的（垫底）。
function actionabilityKey(event: ActionSortable, currentDateStr: string): [number, number] {
  const deadline = primaryDeadline(event, currentDateStr);
  const dateMs = event.date ? new Date(`${event.date}T00:00:00+09:00`).getTime() : Number.MAX_SAFE_INTEGER;
  if (deadline && !deadline.closed) return [0, deadline.daysLeft * 1e15 + dateMs / 1e3];
  if (!deadline) return [1, dateMs];
  return [2, dateMs];
}

export function sortByActionability<T extends ActionSortable>(
  list: readonly T[],
  currentDateStr: string = getJstDateKey(),
): T[] {
  return [...list].sort((a, b) => {
    const ka = actionabilityKey(a, currentDateStr);
    const kb = actionabilityKey(b, currentDateStr);
    return ka[0] - kb[0] || ka[1] - kb[1];
  });
}

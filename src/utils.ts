import { ActivityEvent, TicketPlatform } from './types';
import { createTranslator, type TFunction } from './i18n/core';

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

// Convert simple YYYY-MM-DD and HH:MM to ICS-compatible local time string
export function formatToIcsDate(dateStr: string, timeStr: string = '00:00'): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '');
  return `${cleanDate}T${cleanTime}00`;
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
  const source = new Date(`${dateStr}T${timeStr || '00:00'}:00+09:00`);
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
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// Generate an ICS string and trigger a download for a clean Japanese Live Event
export function downloadEventIcs(
  event: ActivityEvent,
  targetDateType: 'concert' | 'lottery_end' | 'payment' = 'concert',
  t: TFunction = defaultT,
) {
  const icsString = buildEventIcs(event, targetDateType, new Date(), t);
  if (!icsString) return; // 无有效日期：跳过，避免下载损坏文件。
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${event.artistName}_${targetDateType}_reminder.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// Generate dynamic ICS Calendar comprising all followed items
export function downloadAllFollowedEventsIcs(events: ActivityEvent[], t: TFunction = defaultT) {
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
        'END:VEVENT'
      );
    }
  });

  icsLines.push('END:VCALENDAR');

  const icsString = icsLines.join('\r\n');
  const blob = new Blob([icsString], { type: 'text/calendar;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `oshikatsu_all_schedule.ics`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
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

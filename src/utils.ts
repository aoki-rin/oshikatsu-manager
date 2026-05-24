import { ActivityEvent, TicketPlatform } from './types';

// Convert simple YYYY-MM-DD and HH:MM to ICS-compatible UTC or Local time string
export function formatToIcsDate(dateStr: string, timeStr: string = '00:00'): string {
  const cleanDate = dateStr.replace(/-/g, '');
  const cleanTime = timeStr.replace(/:/g, '');
  return `${cleanDate}T${cleanTime}00`;
}

// Generate an ICS string and trigger a download for a clean Japanese Live Event
export function downloadEventIcs(event: ActivityEvent, targetDateType: 'concert' | 'lottery_end' | 'payment' = 'concert') {
  let summary = event.title;
  let dateToUse = event.date;
  let timeToUse = event.time;
  let description = `${event.description}\n\n平台 (Platform): ${event.platform}\n票价 (Price): ${event.price}\n购票链接 (Ticket Links): ${event.originalUrl}`;

  if (targetDateType === 'lottery_end') {
    summary = `【抽选截止】${event.title}`;
    dateToUse = event.timeline.lotteryEndDate || event.date;
    timeToUse = '23:59';
    description = `💡 抽选截止提醒！请务必在此时间前完成票源平台申请。\n\n名额抓取平台: ${event.platform}\n原链接: ${event.originalUrl}`;
  } else if (targetDateType === 'payment') {
    summary = `【付款截止】${event.title}`;
    dateToUse = event.timeline.paymentDeadlineDate || event.date;
    timeToUse = '23:00';
    description = `💰 付款倒计时提醒！抽中资格如果不及时付款将作废并可能降低账号信用度。\n\n交易平台: ${event.platform}`;
  }

  const startFormatted = formatToIcsDate(dateToUse, timeToUse);
  
  // End is typically 3 hours later
  const hour = parseInt(timeToUse.split(':')[0]) || 18;
  const minute = parseInt(timeToUse.split(':')[1]) || 0;
  const endHourStr = String((hour + 3) % 24).padStart(2, '0');
  const endFormatted = formatToIcsDate(dateToUse, `${endHourStr}:${String(minute).padStart(2, '0')}`);

  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OshikatsuManager//JA_LIVE_AGGREGATOR//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${event.id}-${targetDateType}@oshikatsu.manager`,
    `DTSTAMP:${formatToIcsDate('2026-05-24', '05:45')}`, // May 24, 2026 context
    `DTSTART:${startFormatted}`,
    `DTEND:${endFormatted}`,
    `SUMMARY:${summary}`,
    `DESCRIPTION:${description.replace(/\n/g, '\\n')}`,
    `LOCATION:${event.venueName}`,
    `URL:${event.originalUrl}`,
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ];

  const icsString = icsLines.join('\r\n');
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
export function downloadAllFollowedEventsIcs(events: ActivityEvent[]) {
  const icsLines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//OshikatsuManager//ALL_FOLLOWED_CALENDAR//EN',
    'CALSCALE:GREGORIAN'
  ];

  events.forEach((event, idx) => {
    // 1. Live Concert Event
    const liveStart = formatToIcsDate(event.date, event.time);
    const liveEnd = formatToIcsDate(event.date, '21:30');
    icsLines.push(
      'BEGIN:VEVENT',
      `UID:${event.id}-concert-all@oshikatsu.manager`,
      `DTSTAMP:${formatToIcsDate('2026-05-24', '05:45')}`,
      `DTSTART:${liveStart}`,
      `DTEND:${liveEnd}`,
      `SUMMARY:【公演】${event.title}`,
      `DESCRIPTION:${event.description.slice(0, 100).replace(/\n/g, '\\n')}`,
      `LOCATION:${event.venueName}`,
      `URL:${event.originalUrl}`,
      'END:VEVENT'
    );

    // 2. Lottery End Alert if exists
    if (event.timeline.lotteryEndDate) {
      const lotStart = formatToIcsDate(event.timeline.lotteryEndDate, '23:59');
      icsLines.push(
        'BEGIN:VEVENT',
        `UID:${event.id}-lottery-all@oshikatsu.manager`,
        `DTSTAMP:${formatToIcsDate('2026-05-24', '05:45')}`,
        `DTSTART:${lotStart}`,
        `DTEND:${lotStart}`,
        `SUMMARY:【推し活】抽选截止: ${event.artistName}`,
        `DESCRIPTION:购票平台: ${event.platform}\\n原链接: ${event.originalUrl}`,
        `LOCATION:${event.venueName}`,
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
  const [year, month, day] = dateStr.split('-');
  return `${month}月${day}日`;
}

// Calculate days remaining to a future date
export function getDaysRemaining(targetDateStr: string, currentDateStr: string = '2026-05-24'): number {
  const target = new Date(targetDateStr);
  const current = new Date(currentDateStr);
  const diffTime = target.getTime() - current.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

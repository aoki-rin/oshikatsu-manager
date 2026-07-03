import type { ActivityEvent } from './types';

// 关注页（MyOshi）仪表盘用的纯函数：算「下一个临期动作」与「新着」。

export type DeadlineKind = 'apply_start' | 'apply_end' | 'event';

export interface NextDeadline {
  eventId: string;
  title: string;
  at: string; // ISO(+09:00)
  date: string; // YYYY-MM-DD (JST)，给倒计时/展示用
  kind: DeadlineKind;
}

type Match = (event: ActivityEvent) => boolean;

function deadlineCandidates(event: ActivityEvent): { at: string; kind: DeadlineKind }[] {
  const out: { at: string; kind: DeadlineKind }[] = [];
  for (const w of event.ticketWindows ?? []) {
    if (w.applyStart) out.push({ at: w.applyStart, kind: 'apply_start' });
    if (w.applyEnd) out.push({ at: w.applyEnd, kind: 'apply_end' });
  }
  if (event.date) out.push({ at: `${event.date}T${event.time || '18:00'}:00+09:00`, kind: 'event' });
  return out;
}

// 关注对象的「下一个临期动作」：受付開始 / 受付締切 / 开演 里**最早的未来**时间点。
// 全在过去 → null（卡片显示「暂无临期受付」）。
export function nextDeadline(events: ActivityEvent[], match: Match, now: Date = new Date()): NextDeadline | null {
  const nowMs = now.getTime();
  let best: NextDeadline | null = null;
  let bestMs = Infinity;
  for (const event of events) {
    if (!match(event)) continue;
    for (const candidate of deadlineCandidates(event)) {
      const ms = new Date(candidate.at).getTime();
      if (Number.isNaN(ms) || ms <= nowMs || ms >= bestMs) continue;
      bestMs = ms;
      best = { eventId: event.id, title: event.title, at: candidate.at, date: candidate.at.slice(0, 10), kind: candidate.kind };
    }
  }
  return best;
}

export function nextDeadlineForArtist(events: ActivityEvent[], artistId: string, now?: Date): NextDeadline | null {
  return nextDeadline(events, (event) => event.artistId === artistId, now);
}

export function nextDeadlineForVenue(events: ActivityEvent[], venueId: string, now?: Date): NextDeadline | null {
  return nextDeadline(events, (event) => event.venueId === venueId, now);
}

// 「新着」：关注对象有「上次查看之后才抓到」的演出。lastViewed 缺失 → 只要有演出即新着。
export function hasNewSince(events: ActivityEvent[], match: Match, lastViewedIso?: string | null): boolean {
  const since = lastViewedIso ? new Date(lastViewedIso).getTime() : 0;
  return events.some((event) => match(event) && !!event.lastFetchedAt && new Date(event.lastFetchedAt).getTime() > since);
}

export type TicketDeadlineKind = 'apply_end' | 'result_end';

export interface UpcomingDeadline {
  event: ActivityEvent;
  kind: TicketDeadlineKind; // 受付締切 / 当落・入金締切
  label: string; // 轮次名（roundType），如「★一般発売」
  at: string; // ISO(+09:00)
  date: string; // YYYY-MM-DD（倒计时/展示用）
}

// 票务日程的「截止雷达」（QA #5）：未来 horizonDays 天内，已追踪演出的所有
// 受付締切(applyEnd) / 当落・入金締切(resultEnd)，按时间升序。
// 旧卡片只在截止=今天/明天时才冒头，7 天纵轴外的截止完全不可见 → 容易错过申込。
// 无窗口数据的老事件退回 timeline 字段（按当日 23:59 JST 计）。
export function upcomingTicketDeadlines(
  events: ActivityEvent[],
  horizonDays = 14,
  now: Date = new Date(),
): UpcomingDeadline[] {
  const nowMs = now.getTime();
  const horizonMs = nowMs + horizonDays * 24 * 60 * 60 * 1000;
  const out: UpcomingDeadline[] = [];

  const push = (event: ActivityEvent, kind: TicketDeadlineKind, label: string, at: string | null | undefined) => {
    if (!at) return;
    const ms = new Date(at).getTime();
    if (Number.isNaN(ms) || ms <= nowMs || ms > horizonMs) return;
    out.push({ event, kind, label, at, date: at.slice(0, 10) });
  };

  for (const event of events) {
    const windows = event.ticketWindows ?? [];
    if (windows.length > 0) {
      for (const window of windows) {
        push(event, 'apply_end', window.roundType || '', window.applyEnd);
        push(event, 'result_end', window.roundType || '', window.resultEnd);
      }
      continue;
    }
    const timeline = event.timeline || {};
    push(event, 'apply_end', '抽選', timeline.lotteryEndDate ? `${timeline.lotteryEndDate}T23:59:00+09:00` : null);
    push(event, 'apply_end', '一般', timeline.generalEndDate ? `${timeline.generalEndDate}T23:59:00+09:00` : null);
    push(event, 'result_end', '入金', timeline.paymentDeadlineDate ? `${timeline.paymentDeadlineDate}T23:59:00+09:00` : null);
  }

  return out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

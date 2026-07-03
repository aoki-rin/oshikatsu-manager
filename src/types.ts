export type TicketPlatform = 'Ticket Pia' | 'eplus' | 'LivePocket' | 'Lawson Ticket' | 'TicketDive';

export interface TicketTimeline {
  lotteryStartDate?: string; // ISO Date YYYY-MM-DD
  lotteryEndDate?: string;
  generalStartDate?: string;
  generalEndDate?: string;
  paymentDeadlineDate?: string;
}

// R3: 多轮抽選/发售 — 一场演出(或一段巡演)对应 N 个 ticket_window。
// 各 source（src/sources/*）解析产出的权威结构。platform 用 string（抓来的边界数据，不收紧成 union）。
// 时间均为带时区的 ISO 字符串，存 JST (+09:00)。
export interface TicketWindow {
  id: string;
  platform: string;          // 'Ticket Pia' | 'eplus' | 'Lawson Ticket' | 'LivePocket' | 'Fan Club' | 'unknown'
  roundType: string;         // 先行 / 2次先行 / 独占先行 / 先着 / FC先行 / 一般 ...
  labelRaw?: string;         // 原始标签，如「チケットぴあ独占2次先行」
  applyStart: string | null; // 申込開始 ISO+09:00
  applyEnd: string | null;   // 申込締切 ISO+09:00
  resultStart?: string | null; // 当落発表・入金 開始
  resultEnd?: string | null;   // 当落発表・入金 締切
  statusText?: string;       // 平台给的状态文案（如 抽選受付中/予定枚数終了），当无精确日期时显示
  sourceUrl?: string;        // 抓取来源页（信任：可点开自验）
  applyUrl?: string | null;  // 申込链接（跳转购票）
  scrapedAt?: string;        // 抓取时间
}

// 巡演单场（best-effort 从官方页解析）
export interface TourPerformance {
  date: string;        // YYYY-MM-DD
  openTime?: string;   // 開場 HH:MM
  startTime?: string;  // 開演 HH:MM
  locationRaw?: string;// 都道府県 + 会場（原始文本，best-effort）
}

export interface ActivityEvent {
  id: string;
  title: string;
  artistId: string;
  artistName: string;
  venueId: string;
  venueName: string;
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
  region: string; // e.g., 'Kanto (Tokyo)', 'Kansai (Osaka)', 'Chubu (Nagoya)', etc.
  platform: TicketPlatform;
  price: string;
  imageUrl: string;
  timeline: TicketTimeline;   // 派生兼容字段（取最近一轮窗口填充，给未迁移的组件用）
  ticketWindows?: TicketWindow[]; // R3 权威多轮数据（来自各 source 解析）
  performances?: TourPerformance[]; // 巡演多场（best-effort）
  originalUrl: string;
  description: string;
  category: 'Idol' | 'Anime/Seiyuu' | 'J-Pop' | 'Rock/Metal' | 'VTuber' | 'Dance/Club' | 'VTuber / Vocaloid' | 'Rock/J-Pop';
  tags: string[];
  sourceKind?: 'live';
  sourcePlatformId?: string;
  lastFetchedAt?: string;
  purchaseUrl?: string;
  // 艺人名来源：'platform' = 平台真实出演者名（如 Pia artistnm）；'query' = 搜索词回显
  // （eplus 等平台搜索结果不含出演者字段）。UI 据此诚实展示（🔍 vs ⭐），避免把关键词当艺人。
  artistSource?: 'platform' | 'query';
  // 跨平台聚合后保留的成员平台事件 id（如 eplus-xxx / pia-yyy）。
  // 收藏用它做「查询无关」的稳定别名：同一场演出换个关键词再搜到，收藏仍命中。
  memberIds?: string[];
}

export interface Artist {
  id: string;
  name: string;
  avatarUrl: string;
  category: string;
  description: string;
  followerCount: number;
  tags: string[];
}

export interface Venue {
  id: string;
  name: string;
  capacity: number;
  region: string;
  address: string;
  accessInfo: string;
  imageUrl: string;
}

export type AlertType = 'lottery_start' | 'lottery_end' | 'general_start' | 'result_start' | 'payment_deadline' | 'concert';

export interface NotificationAlert {
  id: string;
  eventId: string;
  eventTitle: string;
  platform: TicketPlatform;
  type: AlertType;
  alertDate: string; // YYYY-MM-DD
  isTriggered: boolean;
  notes?: string;
  windowId?: string;
  scheduleAt?: string;
  notificationId?: number;
}

export type TicketSearchStatus = 'ok' | 'empty' | 'blocked' | 'error' | 'skipped' | 'pending';

export interface TicketSearchReport {
  platform: TicketPlatform;
  status: TicketSearchStatus;
  count: number;
  error?: string;
  handoffUrl?: string;
  runtime?: 'proxy' | 'client';
  elapsedMs?: number;
  parserVersion?: string;
}

export interface TicketSearchResult {
  events: ActivityEvent[];
  reports: TicketSearchReport[];
  fetchedAt?: string;
  servedBy?: 'proxy' | 'client';
}

export interface ReminderTarget {
  eventId: string;
  eventTitle: string;
  platform: TicketPlatform;
  windowId: string;
  type: AlertType;
  label: string;
  scheduleAt: string;
  notificationId: number;
  title: string;
  body: string;
}

export interface OshiColor {
  id: string;
  name: string;
  jpName: string;
  colorHex: string;
  accentClass: string; // Tailwind class
  bgLightClass: string;
  textColorClass: string;
}

export interface ExtensionSource {
  id: string;
  name: string;
  platform: TicketPlatform | 'All';
  version: string;
  author: string;
  isEnabled: boolean;
  isInstalled: boolean;
  rating: number;
  iconType: 'pia' | 'eplus' | 'livepocket' | 'lawson' | 'all';
  description: string;
}

// 每个源「上次抓取」状态（插件页本地源管理展示）。
export interface SourceStat {
  lastFetchedAt: string; // ISO
  count: number;
  status: string; // 'ok' | 'empty' | 'error'
}

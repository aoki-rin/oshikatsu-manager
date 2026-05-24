export type TicketPlatform = 'Ticket Pia' | 'eplus' | 'LivePocket' | 'Lawson Ticket';

export interface TicketTimeline {
  lotteryStartDate?: string; // ISO Date YYYY-MM-DD
  lotteryEndDate?: string;
  generalStartDate?: string;
  generalEndDate?: string;
  paymentDeadlineDate?: string;
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
  timeline: TicketTimeline;
  originalUrl: string;
  description: string;
  category: 'Idol' | 'Anime/Seiyuu' | 'J-Pop' | 'Rock/Metal' | 'VTuber' | 'Dance/Club' | 'VTuber / Vocaloid' | 'Rock/J-Pop';
  tags: string[];
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

export type AlertType = 'lottery_start' | 'lottery_end' | 'general_start' | 'payment_deadline';

export interface NotificationAlert {
  id: string;
  eventId: string;
  eventTitle: string;
  platform: TicketPlatform;
  type: AlertType;
  alertDate: string; // YYYY-MM-DD
  isTriggered: boolean;
  notes?: string;
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
  updateAvailable: boolean;
  rating: number;
  iconType: 'pia' | 'eplus' | 'livepocket' | 'lawson' | 'all';
  description: string;
  latencyMs: number;
}

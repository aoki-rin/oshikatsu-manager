import type { ActivityEvent, TicketPlatform, TicketSearchStatus } from '../src/types';

export interface SourceSearchContext {
  fetchText(url: string, init?: RequestInit): Promise<string>;
  fetchedAt: string;
}

export interface ServerTicketSource {
  id: string;
  platform: TicketPlatform;
  parserVersion: string;
  buildSearchUrl(query: string): string;
  search(query: string, ctx: SourceSearchContext): Promise<ActivityEvent[]>;
}

export class PlatformSearchError extends Error {
  status: Extract<TicketSearchStatus, 'blocked' | 'error'>;

  constructor(status: Extract<TicketSearchStatus, 'blocked' | 'error'>, message: string) {
    super(message);
    this.name = 'PlatformSearchError';
    this.status = status;
  }
}

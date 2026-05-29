import type { ServerTicketSource } from '../types';
import { eplusSource } from './eplus';
import { lawsonSource } from './lawson';
import { livePocketSource } from './livepocket';
import { piaSource } from './pia';
import { ticketDiveSource } from './ticketdive';

export const defaultSources: ServerTicketSource[] = [
  eplusSource,
  piaSource,
  ticketDiveSource,
  livePocketSource,
  lawsonSource,
];

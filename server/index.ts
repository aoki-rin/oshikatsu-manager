import express from 'express';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createSearchService } from './searchService';
import type { ServerTicketSource } from './types';

interface AppOptions {
  sources?: ServerTicketSource[];
}

function parseSources(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return value.split(',').map((item) => item.trim()).filter(Boolean);
}

export function createTicketProxyApp(options: AppOptions = {}) {
  const app = express();
  const service = createSearchService({ sources: options.sources });

  app.use((_, res, next) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  app.options('*', (_, res) => res.sendStatus(204));

  app.get('/api/health', (_, res) => {
    res.json({
      ok: true,
      servedBy: 'proxy',
      sources: service.sources.map((source) => ({
        id: source.id,
        platform: source.platform,
        parserVersion: source.parserVersion,
      })),
    });
  });

  app.get('/api/search', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const sources = parseSources(req.query.sources);
    if (!q.trim()) {
      res.status(400).json({ error: 'q is required' });
      return;
    }
    const result = await service.search(q, sources);
    res.json(result);
  });

  return app;
}

function isMainModule(): boolean {
  if (!process.argv[1]) return false;
  return fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
}

if (isMainModule()) {
  const port = Number(process.env.PORT || 8787);
  const host = process.env.HOST || '127.0.0.1';
  createTicketProxyApp().listen(port, host, () => {
    console.log(`Ticket proxy listening on http://${host}:${port}`);
  });
}

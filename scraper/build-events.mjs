// Transform: scraper/output/*.json (raw source outputs) -> src/data/events.json (app shape)
// App reads the generated JSON; UI search/filter runs in-memory (thin client).
// Run after the source adapters:  node scraper/build-events.mjs
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const OUT_DIR = new URL('./output/', import.meta.url);
const APP_DATA = new URL('../src/data/events.json', import.meta.url);
const TODAY = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

const dpart = (iso) => (iso ? iso.slice(0, 10) : undefined);
const PLACEHOLDER_IMG = 'https://images.unsplash.com/photo-1470229722913-7c0e2dbbafd3?auto=format&fit=crop&w=600&q=80';
const AVATAR_IMG = 'https://images.unsplash.com/photo-1549417229-aa67d3263c09?auto=format&fit=crop&w=150&q=80';

function buildFromSource(raw) {
  const slug = raw.artistSlug || 'artist';
  const perfs = raw.performances || [];
  const wins = raw.ticketWindows || [];
  const platforms = raw.platformsSeen || [];

  // headline performance: earliest upcoming, prefer not-sold-out; fallback earliest upcoming; fallback last
  const upcoming = perfs.filter((p) => p.date >= TODAY);
  const headline =
    upcoming.find((p) => !/SOLD OUT/i.test(p.locationRaw || '')) ||
    upcoming[0] ||
    perfs[perfs.length - 1] ||
    null;

  // flat timeline (derived shim) from the soonest still-open window
  const openWins = wins
    .filter((w) => w.applyEnd && dpart(w.applyEnd) >= TODAY)
    .sort((a, b) => a.applyEnd.localeCompare(b.applyEnd));
  const nextWin = openWins[0] || wins[0] || null;
  const timeline = nextWin
    ? {
        lotteryStartDate: dpart(nextWin.applyStart),
        lotteryEndDate: dpart(nextWin.applyEnd),
        paymentDeadlineDate: dpart(nextWin.resultEnd),
      }
    : {};

  const artistId = `art-${slug}`;
  const venueId = `ven-${slug}-tour`;
  const eventId = `${slug}-tour`;

  const artist = {
    id: artistId,
    name: raw.artist,
    avatarUrl: AVATAR_IMG,
    category: 'J-Pop',
    description: `${raw.artist} の最新ツアー情報（公式サイトから自動取得）`,
    followerCount: 0,
    tags: ['自動取得'],
  };

  const venue = {
    id: venueId,
    name: '全国ツアー（複数会場）',
    capacity: 0,
    region: '全国',
    address: headline?.locationRaw || '日本全国',
    accessInfo: `全${perfs.length}公演`,
    imageUrl: PLACEHOLDER_IMG,
  };

  const event = {
    id: eventId,
    title: `${raw.artist} 全国ツアー 2026-2027`,
    artistId,
    artistName: raw.artist,
    venueId,
    venueName: venue.name,
    date: headline?.date || dpart(nextWin?.applyEnd) || TODAY,
    time: headline?.startTime || '18:00',
    region: '全国',
    platform: platforms[0] || 'Ticket Pia',
    price: raw.price || '—',
    imageUrl: PLACEHOLDER_IMG,
    timeline,
    ticketWindows: wins,
    performances: perfs,
    originalUrl: raw.sourceUrl,
    description:
      `${raw.artist} の全国ツアー（全${perfs.length}公演）。` +
      `チケット取扱: ${platforms.join(' / ') || '—'}。` +
      `本データは公式サイトから自動取得（${dpart(raw.scrapedAt) || TODAY}）。`,
    category: 'J-Pop',
    tags: ['自動取得', ...platforms],
  };

  return { artist, venue, event };
}

function main() {
  if (!existsSync(OUT_DIR)) {
    console.error('no scraper/output/ — run a source adapter first');
    process.exit(1);
  }
  const files = readdirSync(OUT_DIR).filter((f) => f.endsWith('.json'));
  const events = [];
  const artists = [];
  const venues = [];
  for (const f of files) {
    const raw = JSON.parse(readFileSync(new URL(f, OUT_DIR), 'utf8'));
    const { artist, venue, event } = buildFromSource(raw);
    artists.push(artist);
    venues.push(venue);
    events.push(event);
  }
  const payload = { generatedAt: new Date().toISOString(), events, artists, venues };
  mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true });
  writeFileSync(APP_DATA, JSON.stringify(payload, null, 2));
  console.log(`wrote src/data/events.json: ${events.length} events, ${artists.length} artists from ${files.length} source(s)`);
  for (const e of events) {
    console.log(`  - ${e.id}: ${e.title} | ${e.ticketWindows.length} windows | ${e.performances.length} perfs | date ${e.date}`);
  }
}

main();

// Source adapter: いきものがかり official tour page
// Spike (P1): fetch official artist page -> parse multi-round 抽選/先行 schedule -> structured ticket_window[]
// Pure Node (Node 18+ global fetch), no deps. Regex over tag-stripped + NFKC-normalized text.
// Production upgrade: swap regex for cheerio; add per-source config. Spike proves the concept.

const SOURCE_URL = 'https://ikimonogakari.com/tour2026-2027/';
const ARTIST = 'いきものがかり';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---- helpers ----------------------------------------------------------------

// Strip scripts/styles/tags, fix CJK-compat chars (⽉→月) + fullwidth via NFKC, collapse whitespace.
function toText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim();
}

// "2026年04月28日（火）12:00" -> "2026-04-28T12:00:00+09:00" (JST stored with offset, R2)
function toJstIso(y, mo, d, hm) {
  const [h, m] = hm.split(':');
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${y}-${p(mo)}-${p(d)}T${p(h)}:${p(m)}:00+09:00`;
}

// One date range: "YYYY年MM月DD日(曜)HH:MM ~/～/〜 YYYY年MM月DD日(曜)HH:MM"
// NOTE: after NFKC, fullwidth （）→ () and ～(FF5E)→ ~ . Accept both forms + wave dash 〜(301C).
const DR = '(\\d{4})年(\\d{1,2})月(\\d{1,2})日[(（].[)）]\\s*(\\d{1,2}:\\d{2})[^0-9]{0,8}?[~～〜][^0-9]{0,10}?(\\d{4})年(\\d{1,2})月(\\d{1,2})日[(（].[)）]\\s*(\\d{1,2}:\\d{2})';

function parseRange(m, i) {
  return {
    start: toJstIso(m[i], m[i + 1], m[i + 2], m[i + 3]),
    end: toJstIso(m[i + 4], m[i + 5], m[i + 6], m[i + 7]),
  };
}

// Map a Japanese round label to {platform, roundType}
function classify(label) {
  let platform = 'unknown';
  if (/ぴあ/.test(label)) platform = 'Ticket Pia';
  else if (/e\+|イープラス|eplus/.test(label)) platform = 'eplus';
  else if (/ローソン|ローチケ|l-?tike/i.test(label)) platform = 'Lawson Ticket';
  else if (/LivePocket/i.test(label)) platform = 'LivePocket';
  else if (/FC|ファンクラブ|会員|超1年2組/.test(label)) platform = 'Fan Club';
  const roundType = label
    .replace(/チケットぴあ|ぴあ|イープラス|e\+|ローソンチケット|ローチケ/gi, '')
    .trim() || label.trim();
  return { platform, roundType };
}

// ---- parser -----------------------------------------------------------------

// Performances list: "YYYY.MM.DD (曜) HH:MM / HH:MM 都道府県 会場 ..." (best-effort)
function parsePerformances(text) {
  const re = /(\d{4})\.(\d{2})\.(\d{2})\s*[(（].[)）]\s*(\d{1,2}:\d{2})(?:\s*\/\s*(\d{1,2}:\d{2}))?\s+([^]{2,80}?)(?=(?:\d{4}\.\d{2}\.\d{2}\s*[(（])|指定席|t\s?i\s?c\s?k\s?e\s?t|【|$)/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const [, y, mo, d, t1, t2, loc] = m;
    out.push({
      date: `${y}-${mo}-${d}`,
      openTime: t2 ? t1 : undefined,      // when two times, first is 開場
      startTime: t2 || t1,                // 開演
      locationRaw: loc.trim().slice(0, 60),
    });
  }
  return out;
}

export function parseIkimonogakari(html, sourceUrl = SOURCE_URL) {
  const text = toText(html);

  // price
  const priceM = text.match(/指定席\s*([\d,]+)\s*円(?:\([^)]*\))?/);
  const price = priceM ? `指定席 ${priceM[1]}円` : null;

  // performances (best-effort)
  const performances = parsePerformances(text);

  // apply URLs from raw HTML (text loses hrefs)
  const urls = [...html.matchAll(/https?:\/\/[^"'\s)]*(?:w\.pia\.jp|t\.pia\.jp|eplus\.jp|l-tike\.com)[^"'\s)]*/g)]
    .map((m) => m[0]);
  const piaUrl = urls.find((u) => /pia\.jp/.test(u)) || null;
  const eplusUrl = urls.find((u) => /eplus\.jp/.test(u)) || null;
  const lawsonUrl = urls.find((u) => /l-tike\.com/.test(u)) || null;
  const urlFor = (platform) =>
    platform === 'Ticket Pia' ? piaUrl
    : platform === 'eplus' ? eplusUrl
    : platform === 'Lawson Ticket' ? lawsonUrl
    : null;

  // round blocks: 】 <label> 受付期間 <applyRange> 当落発表・入金期間 <resultRange>
  const blockRe = new RegExp(
    '】\\s*([^【】]{2,40}?)\\s*受付期間\\s*' + DR +
    '(?:[\\s\\S]{0,40}?当落発表・入金期間\\s*' + DR + ')?',
    'g'
  );

  const ticketWindows = [];
  let m;
  while ((m = blockRe.exec(text)) !== null) {
    const label = m[1].trim();
    const { platform, roundType } = classify(label);
    const apply = parseRange(m, 2); // groups 2..9
    const hasResult = m[10] != null;
    const result = hasResult ? parseRange(m, 10) : null; // groups 10..17
    ticketWindows.push({
      id: `iki-${platform.replace(/\s+/g, '')}-${roundType}`.replace(/[^\w\-]/g, ''),
      platform,
      roundType,
      labelRaw: label,
      applyStart: apply.start,
      applyEnd: apply.end,
      resultStart: result?.start ?? null,
      resultEnd: result?.end ?? null,
      sourceUrl,
      applyUrl: urlFor(platform),
      scrapedAt: new Date().toISOString(),
    });
  }

  return {
    artist: ARTIST,
    artistSlug: 'ikimonogakari',
    sourceUrl,
    scrapedAt: new Date().toISOString(),
    price,
    platformsSeen: [...new Set(ticketWindows.map((w) => w.platform))],
    ticketWindows,
    performances,
    discoveredPlatformUrls: { pia: piaUrl, eplus: eplusUrl, lawson: lawsonUrl },
  };
}

// ---- runner -----------------------------------------------------------------

async function main() {
  const res = await fetch(SOURCE_URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status}`);
  const html = await res.text();
  const data = parseIkimonogakari(html);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(new URL('./output/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./output/ikimonogakari.json', import.meta.url), JSON.stringify(data, null, 2));
  console.log(JSON.stringify(data, null, 2));
  console.error(`\nOK: ${data.ticketWindows.length} ticket windows, platforms: ${data.platformsSeen.join(', ')}`);
}

// run only when invoked directly (robust to non-ASCII paths: import.meta.url is %-encoded, argv[1] is not)
if (process.argv[1] && process.argv[1].endsWith('parse-ikimonogakari.mjs')) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}

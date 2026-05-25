// Source plugin: eplus (イープラス) — Mihon-style.
//   searchEplus(artist) -> events[] (each already carries multi-round ticket windows)
//   eplus 的搜索结果页内嵌 application/json，data.record_list 直接含 kanren_uketsuke_koen_list（多轮受付）。
//   所以 search 一次就拿到 事件 + 多轮窗口；getDetails 仅在需要更多细节时用。
// Pure-ish module (Node 18+ fetch). Parse function is pure; fetch wrapper separate.

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const SEARCH_URL = 'https://eplus.jp/sf/search';

// "20260216120000" (JST) -> "2026-02-16T12:00:00+09:00"
function eplusDtToIso(s) {
  if (!s || s.length < 8) return null;
  const y = s.slice(0, 4), mo = s.slice(4, 6), d = s.slice(6, 8);
  const h = s.slice(8, 10) || '00', mi = s.slice(10, 12) || '00', se = s.slice(12, 14) || '00';
  return `${y}-${mo}-${d}T${h}:${mi}:${se}+09:00`;
}
// "20260524" -> "2026-05-24"
function eplusDateToYmd(s) {
  return s && s.length >= 8 ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` : null;
}
// "1800" -> "18:00"
function eplusHm(s) {
  return s && s.length >= 4 ? `${s.slice(0, 2)}:${s.slice(2, 4)}` : undefined;
}
// decode HTML entities that eplus stores in its JSON string values
function dec(s) {
  return typeof s === 'string'
    ? s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'")
    : s;
}

// Pure: parse the search results HTML (which embeds application/json) into events.
export function parseEplusSearch(html, query) {
  const m = html.match(/<script[^>]*type="application\/(?:ld\+)?json"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) return { platform: 'eplus', query, events: [], note: 'no json block' };
  let j;
  try { j = JSON.parse(m[1]); } catch { return { platform: 'eplus', query, events: [], note: 'json parse error' }; }
  const list = (j.data && j.data.record_list) || [];

  const events = list.map((r) => {
    const sub = r.kanren_kogyo_sub || {};
    const venue = r.kanren_venue || {};
    const rounds = r.kanren_uketsuke_koen_list || [];
    const ticketWindows = rounds.map((u) => ({
      platform: 'eplus',
      roundType: dec(u.uketsuke_name_pc || u.uketsuke_name_mobile || u.hambai_hoho_label || '受付'),
      saleMethod: dec(u.hambai_hoho_label) || null,      // プレオーダー / 抽選 / 先着 ...
      applyStart: eplusDtToIso(u.uketsuke_start_datetime),
      applyEnd: eplusDtToIso(u.uketsuke_end_datetime),
      infoOpenStart: eplusDtToIso(u.info_kokai_start_datetime),
      infoOpenEnd: eplusDtToIso(u.info_kokai_end_datetime),
      statusCode: u.uketsuke_status ?? null,
    }));
    return {
      platform: 'eplus',
      eventId: `eplus-${r.kogyo_code}-${r.koen_code || ''}`,
      title: dec(sub.kogyo_name_1 + (sub.kogyo_name_2 ? ` ${sub.kogyo_name_2}` : '')),
      kogyoCode: r.kogyo_code,
      date: eplusDateToYmd(r.koenbi_term),
      time: eplusHm(r.kaien_time),
      venue: dec(venue.venue_name) || null,
      prefecture: dec(venue.todofuken_name) || null,
      detailUrl: r.koen_detail_url_pc || null,
      ticketWindows,
    };
  });

  return { platform: 'eplus', query, events };
}

export async function searchEplus(artist) {
  const url = `${SEARCH_URL}?keyword=${encodeURIComponent(artist)}`;
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`eplus search HTTP ${res.status}`);
  const html = await res.text();
  const out = parseEplusSearch(html, artist);
  out.sourceUrl = url;
  out.scrapedAt = new Date().toISOString();
  return out;
}

// runner
async function main() {
  const artist = process.argv[2] || 'いきものがかり';
  const out = await searchEplus(artist);
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(new URL('../output/', import.meta.url), { recursive: true });
  writeFileSync(new URL('../output/eplus-search.json', import.meta.url), JSON.stringify(out, null, 2));
  console.log(`eplus search "${artist}": ${out.events.length} events`);
  for (const e of out.events.slice(0, 6)) {
    console.log(`\n  ▸ ${e.title} | ${e.date} ${e.time || ''} | ${e.prefecture || ''} ${e.venue || ''}`);
    for (const w of e.ticketWindows) {
      const fmt = (iso) => iso ? new Date(iso).toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }) : '—';
      console.log(`      · [${w.saleMethod || '?'}] ${w.roundType}: ${fmt(w.applyStart)} → ${fmt(w.applyEnd)}`);
    }
  }
  if (out.events.length > 6) console.log(`\n  …(+${out.events.length - 6} more)`);
}

if (process.argv[1] && process.argv[1].endsWith('eplus.mjs')) {
  main().catch((e) => { console.error('ERROR:', e.message); process.exit(1); });
}

import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 1024;
const ROOT = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(ROOT, 'assets');
const ANDROID_RES = join(ROOT, 'android/app/src/main/res');

mkdirSync(ASSETS, { recursive: true });

const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff7aa8"/>
      <stop offset="0.54" stop-color="#ec4899"/>
      <stop offset="1" stop-color="#7c3aed"/>
    </linearGradient>
    <radialGradient id="glow" cx="38%" cy="26%" r="68%">
      <stop offset="0" stop-color="#fff7ed" stop-opacity="0.45"/>
      <stop offset="0.56" stop-color="#fff7ed" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#fff7ed" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sweep" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#22d3ee" stop-opacity="0.32"/>
      <stop offset="1" stop-color="#22d3ee" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#bg)"/>
  <circle cx="194" cy="174" r="406" fill="url(#glow)"/>
  <path d="M-30 742 C162 630 330 620 492 712 C636 794 792 798 1054 650 L1054 1024 L-30 1024 Z" fill="#0f172a" opacity="0.12"/>
  <path d="M720 -90 C892 52 936 228 858 438 C812 564 844 690 1018 830 L1018 -90 Z" fill="url(#sweep)"/>
  <g opacity="0.13" stroke="#ffffff" stroke-width="6">
    <path d="M92 188 L932 188"/>
    <path d="M92 330 L932 330"/>
    <path d="M92 472 L932 472"/>
    <path d="M92 614 L932 614"/>
    <path d="M92 756 L932 756"/>
  </g>
</svg>`;

const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="150%">
      <feDropShadow dx="0" dy="28" stdDeviation="30" flood-color="#701a75" flood-opacity="0.32"/>
    </filter>
    <mask id="ticketMask">
      <rect x="236" y="292" width="552" height="442" rx="64" fill="#ffffff"/>
      <circle cx="236" cy="426" r="43" fill="#000000"/>
      <circle cx="788" cy="600" r="43" fill="#000000"/>
    </mask>
  </defs>

  <g opacity="0.86" fill="none" stroke-linecap="round">
    <circle cx="512" cy="512" r="342" stroke="#22d3ee" stroke-width="36" stroke-dasharray="520 620" transform="rotate(-28 512 512)"/>
    <circle cx="512" cy="512" r="246" stroke="#fde68a" stroke-width="28" stroke-dasharray="260 520" transform="rotate(38 512 512)"/>
  </g>

  <g filter="url(#softShadow)">
    <g mask="url(#ticketMask)">
      <rect x="236" y="292" width="552" height="442" rx="64" fill="#ffffff"/>
      <path d="M292 356 H732" stroke="#fce7f3" stroke-width="22" stroke-linecap="round"/>
      <path d="M292 668 H692" stroke="#fce7f3" stroke-width="20" stroke-linecap="round"/>
      <path d="M392 320 L686 714" stroke="#fbcfe8" stroke-width="14" stroke-linecap="round" stroke-dasharray="18 34"/>
    </g>
    <rect x="236" y="292" width="552" height="442" rx="64" fill="none" stroke="#ffffff" stroke-width="18" opacity="0.55"/>
  </g>

  <path d="M512 604 C470 566 414 536 414 478 C414 438 444 408 484 408 C506 408 526 418 540 438 C554 418 574 408 596 408 C636 408 666 438 666 478 C666 536 610 566 568 604 L540 630 Z" fill="#ec4899"/>
  <circle cx="704" cy="320" r="76" fill="#facc15"/>
  <circle cx="704" cy="320" r="32" fill="#ffffff" opacity="0.96"/>
  <path d="M334 314 C352 350 352 350 388 368 C352 386 352 386 334 422 C316 386 316 386 280 368 C316 350 316 350 334 314 Z" fill="#ffffff" opacity="0.95"/>
</svg>`;

const squircleMaskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="224" fill="#ffffff"/>
</svg>`;

const circleMaskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <circle cx="512" cy="512" r="512" fill="#ffffff"/>
</svg>`;

const background = await sharp(Buffer.from(backgroundSvg)).png().toBuffer();
const foreground = await sharp(Buffer.from(foregroundSvg)).png().toBuffer();
const icon = await sharp(background).composite([{ input: foreground }]).png().toBuffer();

writeFileSync(join(ASSETS, 'icon-source.svg'), `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">${backgroundSvg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}${foregroundSvg.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`);
await sharp(background).png().toFile(join(ASSETS, 'icon-background.png'));
await sharp(foreground).png().toFile(join(ASSETS, 'icon-foreground.png'));
await sharp(icon).png().toFile(join(ASSETS, 'icon-only.png'));

const densities = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];

const squircleMask = await sharp(Buffer.from(squircleMaskSvg)).png().toBuffer();
const circleMask = await sharp(Buffer.from(circleMaskSvg)).png().toBuffer();

async function writeMaskedIcon(source, mask, size, file) {
  const resizedSource = await sharp(source).resize(size, size).png().toBuffer();
  const resizedMask = await sharp(mask).resize(size, size).png().toBuffer();
  await sharp(resizedSource)
    .composite([{ input: resizedMask, blend: 'dest-in' }])
    .png()
    .toFile(file);
}

for (const [density, legacySize, foregroundSize] of densities) {
  const dir = join(ANDROID_RES, `mipmap-${density}`);
  await writeMaskedIcon(icon, squircleMask, legacySize, join(dir, 'ic_launcher.png'));
  await writeMaskedIcon(icon, circleMask, legacySize, join(dir, 'ic_launcher_round.png'));

  await sharp(foreground)
    .resize(foregroundSize, foregroundSize)
    .png()
    .toFile(join(dir, 'ic_launcher_foreground.png'));
}

await writeMaskedIcon(icon, squircleMask, 180, '/tmp/icon-preview-squircle.png');
await writeMaskedIcon(icon, circleMask, 180, '/tmp/icon-preview-circle.png');

console.log('OK: generated app icon source, Android mipmaps, and /tmp icon previews');

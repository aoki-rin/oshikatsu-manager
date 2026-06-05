import sharp from 'sharp';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const S = 1024;
const ROOT = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(ROOT, 'assets');
const ANDROID_RES = join(ROOT, 'android/app/src/main/res');

mkdirSync(ASSETS, { recursive: true });

// oshibeta 风格：深色 #121212 底 + 一点应援色辉光 + 极淡的几何同心环。
const backgroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <radialGradient id="glow" cx="74%" cy="22%" r="62%">
      <stop offset="0" stop-color="#ec4899" stop-opacity="0.30"/>
      <stop offset="0.58" stop-color="#ec4899" stop-opacity="0.06"/>
      <stop offset="1" stop-color="#ec4899" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="#121212"/>
  <circle cx="782" cy="232" r="306" fill="url(#glow)"/>
  <g fill="none" stroke="#ffffff" stroke-opacity="0.05">
    <circle cx="512" cy="512" r="372" stroke-width="44"/>
    <circle cx="512" cy="512" r="250" stroke-width="30"/>
  </g>
</svg>`;

// oshibeta 风格前景：应援色几何环（虚线 + 实线）+ 居中圆角粉块内白色「推」。
// 内容集中在中心安全区（自适应图标会按圆/方圆遮罩裁切边缘的装饰环）。
const foregroundSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <defs>
    <filter id="softShadow" x="-30%" y="-30%" width="160%" height="170%">
      <feDropShadow dx="0" dy="24" stdDeviation="34" flood-color="#000000" flood-opacity="0.45"/>
    </filter>
  </defs>

  <g fill="none" stroke-linecap="round">
    <circle cx="512" cy="512" r="318" stroke="#ec4899" stroke-opacity="0.5" stroke-width="22" stroke-dasharray="40 46" transform="rotate(-18 512 512)"/>
    <circle cx="512" cy="512" r="236" stroke="#ec4899" stroke-width="14"/>
  </g>

  <g filter="url(#softShadow)">
    <rect x="372" y="372" width="280" height="280" rx="74" fill="#ec4899"/>
  </g>
  <text x="512" y="516" font-size="208" font-weight="900" fill="#ffffff" text-anchor="middle" dominant-baseline="central" font-family="PingFang SC, Hiragino Sans, Hiragino Sans GB, Noto Sans CJK SC, sans-serif">推</text>
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

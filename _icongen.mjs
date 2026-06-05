import sharp from 'sharp';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// 应用图标来自用户自定义稿 assets/icon-source.svg（深色底 + 点阵 + 偏心粉环 + 虚线环 + 渐变「推」块）。
// 关键：Android 自适应图标只稳定显示「中心安全区」(约 108dp 中的 72dp ≈ 66%)，边缘会被启动器形状裁掉。
// 所以前景层把整张设计缩进 SAFE 比例、居中铺在纯深色背景上 → 启动器缩放安全区后即可完整呈现设计，
// 不会再把外圈装饰环裁成残缺弧线。
const S = 1024;
const SAFE = 0.7; // 设计占画布中心 70%（≈ 自适应安全区），其余留给深色出血边
const DARK = '#121212';
const DENSITY = 384; // SVG 栅格化精度（512 源 → 高清下采样）

const ROOT = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(ROOT, 'assets');
const ANDROID_RES = join(ROOT, 'android/app/src/main/res');
mkdirSync(ASSETS, { recursive: true });

const sourceSvg = readFileSync(join(ASSETS, 'icon-source.svg'));

const squircleMaskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <rect width="${S}" height="${S}" rx="224" fill="#ffffff"/>
</svg>`;
const circleMaskSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
  <circle cx="512" cy="512" r="512" fill="#ffffff"/>
</svg>`;

// 整张设计（全幅，圆角外为透明）
const designFull = await sharp(sourceSvg, { density: DENSITY }).resize(S, S).png().toBuffer();
// 设计缩进安全区
const inner = Math.round(S * SAFE);
const designInner = await sharp(sourceSvg, { density: DENSITY }).resize(inner, inner).png().toBuffer();

// 自适应背景：纯深色
const background = await sharp({
  create: { width: S, height: S, channels: 4, background: { r: 18, g: 18, b: 18, alpha: 1 } },
}).png().toBuffer();

// 自适应前景：设计缩进安全区、居中、四周透明（深色由背景层补）
const foreground = await sharp({
  create: { width: S, height: S, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
}).composite([{ input: designInner, gravity: 'center' }]).png().toBuffer();

// 全幅压平到深色（旧式 ic_launcher / 圆形图标用，老启动器直接遮罩显示）
const flat = await sharp(designFull).flatten({ background: DARK }).png().toBuffer();

// 自适应「静止合成」预览（背景 + 前景）
const adaptiveRest = await sharp(background).composite([{ input: foreground }]).png().toBuffer();

const squircleMask = await sharp(Buffer.from(squircleMaskSvg)).png().toBuffer();
const circleMask = await sharp(Buffer.from(circleMaskSvg)).png().toBuffer();

async function writeMasked(source, mask, size, file) {
  const s = await sharp(source).resize(size, size).png().toBuffer();
  const m = await sharp(mask).resize(size, size).png().toBuffer();
  await sharp(s).composite([{ input: m, blend: 'dest-in' }]).png().toFile(file);
}

// 资产预览
await sharp(background).png().toFile(join(ASSETS, 'icon-background.png'));
await sharp(foreground).png().toFile(join(ASSETS, 'icon-foreground.png'));
await sharp(adaptiveRest).png().toFile(join(ASSETS, 'icon-only.png'));

const densities = [
  ['mdpi', 48, 108],
  ['hdpi', 72, 162],
  ['xhdpi', 96, 216],
  ['xxhdpi', 144, 324],
  ['xxxhdpi', 192, 432],
];

for (const [density, legacySize, foregroundSize] of densities) {
  const dir = join(ANDROID_RES, `mipmap-${density}`);
  mkdirSync(dir, { recursive: true });
  await writeMasked(flat, squircleMask, legacySize, join(dir, 'ic_launcher.png'));
  await writeMasked(flat, circleMask, legacySize, join(dir, 'ic_launcher_round.png'));
  await sharp(foreground).resize(foregroundSize, foregroundSize).png().toFile(join(dir, 'ic_launcher_foreground.png'));
}

// 启动器实际呈现模拟：截取自适应静止图的中心 66.7%、放大、方圆遮罩
const cropPx = Math.round(S * 0.667);
const off = Math.round((S - cropPx) / 2);
const shown = await sharp(adaptiveRest).extract({ left: off, top: off, width: cropPx, height: cropPx }).resize(S, S).png().toBuffer();
await writeMasked(shown, squircleMask, 360, '/tmp/icon-sim-pixel.png');
await writeMasked(flat, squircleMask, 360, '/tmp/icon-sim-legacy.png');

console.log(`OK: SAFE=${SAFE} → generated adaptive fg/bg, legacy mipmaps, assets, and /tmp sim previews`);

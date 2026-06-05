import { test, expect, type Page } from '@playwright/test';
import { favoriteKey } from '../../src/favorites';
import type { ActivityEvent, ExtensionSource } from '../../src/types';

const EXT: ExtensionSource[] = [{
  id: 'ext-eplus', name: 'eplus', platform: 'eplus', version: '1.0', author: 'test',
  isEnabled: true, isInstalled: true, rating: 5, iconType: 'eplus', description: '',
}];

const EV: ActivityEvent = {
  id: 'eplus-1', title: 'FRUITS ZIPPER LIVE', artistId: 'art-fz', artistName: 'FRUITS ZIPPER',
  venueId: 'ven-gt', venueName: '東京ガーデンシアター', date: '2030-08-10', time: '18:00',
  region: '東京都', platform: 'eplus', price: '¥8,000', imageUrl: 'https://example.test/i.jpg',
  timeline: {}, originalUrl: 'https://example.test/e/1', description: '', category: 'J-Pop',
  tags: [], sourceKind: 'live',
};

interface SeedData {
  events?: ActivityEvent[];
  favorites?: string[];
  followedArtists?: string[];
}

async function seed(page: Page, data: SeedData = {}): Promise<void> {
  const payload = {
    ext: JSON.stringify(EXT),
    events: JSON.stringify(data.events ?? []),
    favorites: JSON.stringify(data.favorites ?? []),
    followedArtists: JSON.stringify(data.followedArtists ?? []),
  };
  await page.addInitScript((d) => {
    localStorage.setItem('oshikatsu_extensions', d.ext);
    localStorage.setItem('oshikatsu_events', d.events);
    localStorage.setItem('oshikatsu_favorites', d.favorites);
    localStorage.setItem('oshikatsu_followed_artists', d.followedArtists);
  }, payload);
}

test('搜索 → 渲染结果卡（/api 用 fixture 拦截）', async ({ page }) => {
  await seed(page);
  await page.route('**/api/search**', (route) =>
    route.fulfill({ json: { events: [EV], reports: [{ platform: 'eplus', status: 'ok', count: 1 }] } }),
  );
  await page.goto('/');
  await page.fill('#search-input-field', 'FRUITS ZIPPER');
  await page.click('#btn-platform-search');
  await expect(page.locator('#event-card-eplus-1')).toBeVisible();
});

test('点卡 → 详情弹窗打开 → 关闭', async ({ page }) => {
  await seed(page, { events: [EV], favorites: [favoriteKey(EV)] });
  await page.goto('/');
  await page.locator('#event-card-eplus-1 .cursor-pointer').first().click();
  await expect(page.locator('#bottom-sheet-container')).toBeVisible();
  await page.click('#btn-close-bottom-sheet');
  await expect(page.locator('#bottom-sheet-container')).toHaveCount(0);
});

test('收藏持久化：reload 后仍展示', async ({ page }) => {
  await seed(page, { events: [EV], favorites: [favoriteKey(EV)] });
  await page.goto('/');
  await expect(page.locator('#event-card-eplus-1')).toBeVisible();
  await page.reload();
  await expect(page.locator('#event-card-eplus-1')).toBeVisible();
});

test('收藏的演出 → 票务日程页可见 + 可导出', async ({ page }) => {
  await seed(page, { events: [EV], favorites: [favoriteKey(EV)] });
  await page.goto('/');
  await page.click('#tabnav-calendar');
  await expect(page.locator('#calendar-view-root')).toBeVisible();
  await expect(page.locator('#btn-export-combined-ics')).toBeVisible();
});

test('关注艺人 → MyOshi 仪表盘显示该艺人', async ({ page }) => {
  await seed(page, { events: [EV], followedArtists: ['art-fz'] });
  await page.goto('/');
  await page.click('#tabnav-oshis');
  await expect(page.locator('#btn-unfollow-artist-art-fz')).toBeVisible();
});

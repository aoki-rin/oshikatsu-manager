// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderWithI18n, makeEvent, fireEvent, cleanup, waitFor } from './_helpers';
import type { ComponentProps } from 'react';
import type { Artist } from '../../src/types';
import { MyOshiView } from '../../src/components/MyOshiView';

afterEach(cleanup);

const makeArtist = (o: Partial<Artist> = {}): Artist => ({
  id: 'art-cur', name: 'CURATED ARTIST', avatarUrl: '', category: 'J-Pop',
  description: '', followerCount: 0, tags: [], ...o,
});

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    artists: [],
    venues: [],
    events: [],
    followedArtists: [] as string[],
    followedVenues: [] as string[],
    onToggleFollowArtist: vi.fn(),
    onToggleFollowVenue: vi.fn(),
    onSelectEvent: vi.fn(),
    onSearchEntity: vi.fn().mockResolvedValue(undefined),
    lastViewed: {} as Record<string, string>,
    onViewEntity: vi.fn(),
    oshiColor: '#ec4899',
    ...overrides,
  };
}

describe('MyOshiView', () => {
  it('无关注时不渲染取关按钮；策展艺人显示关注按钮且回调', () => {
    const props = makeProps({ artists: [makeArtist({ id: 'art-cur' })] });
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    expect(container.querySelector('[id^="btn-unfollow-artist-"]')).toBeNull();
    const followBtn = container.querySelector('#btn-follow-artist-art-cur') as HTMLButtonElement;
    expect(followBtn).not.toBeNull();

    fireEvent.click(followBtn);
    expect(props.onToggleFollowArtist).toHaveBeenCalledWith('art-cur');
  });

  it('从 events 派生的关注艺人渲染并可取关', () => {
    const props = makeProps({
      events: [makeEvent({ artistId: 'art-fz', artistName: 'FRUITS ZIPPER' })],
      followedArtists: ['art-fz'],
    });
    const { container, getByText } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    expect(getByText('FRUITS ZIPPER')).toBeInTheDocument();
    const unfollow = container.querySelector('#btn-unfollow-artist-art-fz') as HTMLButtonElement;
    expect(unfollow).not.toBeNull();

    fireEvent.click(unfollow);
    expect(props.onToggleFollowArtist).toHaveBeenCalledWith('art-fz');
  });

  it('「检索最新场次」按钮触发 onSearchEntity + onViewEntity', async () => {
    const props = makeProps({
      events: [makeEvent({ artistId: 'art-fz', artistName: 'FRUITS ZIPPER' })],
      followedArtists: ['art-fz'],
    });
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    const card = container.querySelector('#btn-unfollow-artist-art-fz')!.closest('[class*="rounded-2xl"]')!;
    const buttons = [...card.querySelectorAll('button')];
    const searchBtn = buttons.find(b => b.id !== 'btn-unfollow-artist-art-fz')!;

    fireEvent.click(searchBtn);
    expect(props.onSearchEntity).toHaveBeenCalledWith('FRUITS ZIPPER');
    await waitFor(() => expect(props.onViewEntity).toHaveBeenCalledWith('art-fz'));
  });

  it('新着角标：lastViewed 缺失时显示', () => {
    const props = makeProps({
      events: [makeEvent({ artistId: 'art-fz', lastFetchedAt: '2030-01-01T00:00:00Z' })],
      followedArtists: ['art-fz'],
      oshiColor: '#123456',
    });
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    const card = container.querySelector('#btn-unfollow-artist-art-fz')!.closest('[class*="rounded-2xl"]')!;
    const hasBadge = [...card.querySelectorAll('span')].some(s => s.style.backgroundColor === 'rgb(18, 52, 86)');
    expect(hasBadge).toBe(true);
  });

  it('新着角标：lastViewed 晚于抓取时间则隐藏', () => {
    const props = makeProps({
      events: [makeEvent({ artistId: 'art-fz', lastFetchedAt: '2030-01-01T00:00:00Z' })],
      followedArtists: ['art-fz'],
      lastViewed: { 'art-fz': '2030-02-01T00:00:00Z' },
      oshiColor: '#123456',
    });
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    const card = container.querySelector('#btn-unfollow-artist-art-fz')!.closest('[class*="rounded-2xl"]')!;
    const hasBadge = [...card.querySelectorAll('span')].some(s => s.style.backgroundColor === 'rgb(18, 52, 86)');
    expect(hasBadge).toBe(false);
  });

  it('切换到会场子标签后显示关注的会场', () => {
    const props = makeProps({
      events: [makeEvent({ venueId: 'ven-gt', venueName: '東京ガーデンシアター' })],
      followedVenues: ['ven-gt'],
    });
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    expect(container.querySelector('#btn-unfollow-venue-ven-gt')).toBeNull();
    fireEvent.click(container.querySelector('#subtab-venues') as HTMLButtonElement);
    expect(container.querySelector('#btn-unfollow-venue-ven-gt')).not.toBeNull();
  });
});

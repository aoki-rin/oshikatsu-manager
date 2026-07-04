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

    fireEvent.click(container.querySelector('#btn-search-artist-art-fz') as HTMLButtonElement);
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

    expect(container.querySelector('[data-testid="new-badge"]')).not.toBeNull();
  });

  it('新着角标：lastViewed 晚于抓取时间则隐藏', () => {
    const props = makeProps({
      events: [makeEvent({ artistId: 'art-fz', lastFetchedAt: '2030-01-01T00:00:00Z' })],
      followedArtists: ['art-fz'],
      lastViewed: { 'art-fz': '2030-02-01T00:00:00Z' },
      oshiColor: '#123456',
    });
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    expect(container.querySelector('[data-testid="new-badge"]')).toBeNull();
  });

  it('「更新全部关注」顺序检索每位推し并清新着（QA #13-lite）', async () => {
    const props = makeProps({
      events: [
        makeEvent({ id: 'e1', artistId: 'art-a', artistName: 'ARTIST A' }),
        makeEvent({ id: 'e2', artistId: 'art-b', artistName: 'ARTIST B', venueId: 'v2' }),
      ],
      followedArtists: ['art-a', 'art-b'],
    });
    const { container } = renderWithI18n(<MyOshiView {...(props as unknown as ComponentProps<typeof MyOshiView>)} />);

    fireEvent.click(container.querySelector('#btn-refresh-all-follows') as HTMLButtonElement);
    await waitFor(() => expect(props.onSearchEntity).toHaveBeenCalledTimes(2));
    expect(props.onSearchEntity).toHaveBeenNthCalledWith(1, 'ARTIST A');
    expect(props.onSearchEntity).toHaveBeenNthCalledWith(2, 'ARTIST B');
    await waitFor(() => expect(props.onViewEntity).toHaveBeenCalledWith('art-b'));
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

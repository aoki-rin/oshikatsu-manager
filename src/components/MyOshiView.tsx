import { useState } from 'react';
import { Artist, Venue, ActivityEvent } from '../types';
import {
  Heart, MapPin, Building, Star, Sparkles,
  Trash2, ChevronRight, Hash, Users
} from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

interface MyOshiViewProps {
  artists: Artist[];
  venues: Venue[];
  events: ActivityEvent[];
  followedArtists: string[];
  followedVenues: string[];
  onToggleFollowArtist: (id: string) => void;
  onToggleFollowVenue: (id: string) => void;
  onSelectEvent: (event: ActivityEvent) => void;
  onSearchEntity: (name: string) => Promise<void>;
  oshiColor: string; // hex
}

export function MyOshiView({
  artists,
  venues,
  events,
  followedArtists,
  followedVenues,
  onToggleFollowArtist,
  onToggleFollowVenue,
  onSelectEvent,
  onSearchEntity,
  oshiColor
}: MyOshiViewProps) {
  const { locale, t } = useI18n();
  const [activeSubTab, setActiveSubTab] = useState<'artists' | 'venues'>('artists');

  // Selected focused artist or venue for quick filter
  const [filterFocusId, setFilterFocusId] = useState<string | null>(null);
  // 正在为哪个关注对象跑实时检索（按钮 loading + 防重复点击）。
  const [searchingId, setSearchingId] = useState<string | null>(null);

  // 关注 = 订阅：点「检索最新场次」真的去各平台拉该 艺人/会场 的最新演出，
  // 结果并入 events 后下面的聚焦列表即时显示（不再只是过滤旧缓存）。
  const runEntitySearch = async (id: string, name: string) => {
    setSearchingId(id);
    try {
      await onSearchEntity(name);
    } finally {
      setSearchingId(null);
    }
    setFilterFocusId(id);
  };

  // 没有独立的 Artist/Venue 库：实时搜索事件只带 artistId/venueId + 名称。
  // 从 events 派生记录，让「关注」能在这里解析并显示（props.artists/venues 优先）。
  const artistsById = new Map<string, Artist>(artists.map((a): [string, Artist] => [a.id, a]));
  for (const e of events) {
    if (e.artistId && !artistsById.has(e.artistId)) {
      artistsById.set(e.artistId, {
        id: e.artistId, name: e.artistName, avatarUrl: e.imageUrl,
        category: e.category, description: '', followerCount: 0, tags: [],
      });
    }
  }
  const allArtists = [...artistsById.values()];

  const venuesById = new Map<string, Venue>(venues.map((v): [string, Venue] => [v.id, v]));
  for (const e of events) {
    if (e.venueId && !venuesById.has(e.venueId)) {
      venuesById.set(e.venueId, {
        id: e.venueId, name: e.venueName, capacity: 0,
        region: e.region, address: '', accessInfo: '', imageUrl: e.imageUrl,
      });
    }
  }
  const allVenues = [...venuesById.values()];

  // Followed lists resolve against the derived records; the "explore" lists stay
  // curated-only (props), so they simply hide when there's no curated catalog.
  const followedArtistList = allArtists.filter(a => followedArtists.includes(a.id));
  const otherArtistList = artists.filter(a => !followedArtists.includes(a.id));

  const followedVenueList = allVenues.filter(v => followedVenues.includes(v.id));
  const otherVenueList = venues.filter(v => !followedVenues.includes(v.id));

  // Find events matching the selected focused artist or venue
  const focusedEvents = events.filter(e => {
    if (activeSubTab === 'artists') {
      return e.artistId === filterFocusId;
    } else {
      return e.venueId === filterFocusId;
    }
  });

  const focusedEntityName = activeSubTab === 'artists'
    ? allArtists.find(a => a.id === filterFocusId)?.name
    : allVenues.find(v => v.id === filterFocusId)?.name;
  const numberFormatter = new Intl.NumberFormat(locale);

  return (
    <div id="oshi-view-root" className="flex-1 flex flex-col overflow-hidden">
      
      {/* Search Header and sub-tabs */}
      <div className="bg-white px-4 pt-3 pb-2 border-b border-slate-100 z-10 sticky top-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="p-1 px-1.5 rounded-xl text-white transition-colors"
              style={{ backgroundColor: oshiColor }}
            >
              <Heart className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h1 className="text-base font-bold font-display text-slate-900">{t('oshi.title')}</h1>
              <p className="text-[10px] text-slate-400">{t('oshi.subtitle')}</p>
            </div>
          </div>
        </div>

        {/* Sub tabs selectors */}
        <div className="flex gap-4 border-b border-slate-100 mt-3 text-xs">
          <button
            id="subtab-artists"
            onClick={() => {
              setActiveSubTab('artists');
              setFilterFocusId(null);
            }}
            className={`pb-2.5 font-bold transition-all relative ${
              activeSubTab === 'artists' ? 'text-slate-900' : 'text-slate-400 font-medium'
            }`}
          >
            {t('oshi.artistsTab', { count: followedArtistList.length })}
            {activeSubTab === 'artists' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: oshiColor }}></span>
            )}
          </button>

          <button
            id="subtab-venues"
            onClick={() => {
              setActiveSubTab('venues');
              setFilterFocusId(null);
            }}
            className={`pb-2.5 font-bold transition-all relative ${
              activeSubTab === 'venues' ? 'text-slate-900' : 'text-slate-400 font-medium'
            }`}
          >
            {t('oshi.venuesTab', { count: followedVenueList.length })}
            {activeSubTab === 'venues' && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full" style={{ backgroundColor: oshiColor }}></span>
            )}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        
        {/* Quick focused events overlay when clicking an element */}
        {filterFocusId && (
          <div className="bg-slate-900 text-white rounded-2xl p-3.5 border border-slate-800 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-400 font-mono">{t('oshi.focusedSearch')}</span>
                <h3 className="text-xs font-bold text-slate-100 truncate mt-0.5">⭐ {focusedEntityName}</h3>
              </div>
              <button 
                onClick={() => setFilterFocusId(null)}
                className="text-xs text-slate-400 hover:text-white border border-slate-705 px-2 py-0.5 rounded"
              >
                {t('oshi.closeFocused')}
              </button>
            </div>

            <div className="space-y-2">
              {focusedEvents.length === 0 ? (
                <p className="text-[10px] text-slate-400 py-2">{t('oshi.noFocusedEvents')}</p>
              ) : (
                focusedEvents.map(e => (
                  <div 
                    key={e.id}
                    onClick={() => onSelectEvent(e)}
                    className="p-2 bg-slate-800 rounded-xl hover:bg-slate-750 transition flex items-center justify-between cursor-pointer"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="text-[10px] text-emerald-400 font-bold">{e.platform} · {e.date}</p>
                      <h4 className="text-xs font-semibold text-slate-200 truncate mt-0.5">{e.title}</h4>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* 1. Artist List Container */}
        {activeSubTab === 'artists' && (
          <div className="space-y-4">
            
            {/* Followed list */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 font-mono block">
                {t('oshi.followedArtistsTitle')}
              </span>

              {followedArtistList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-100/80">
                  {t('oshi.followedArtistsEmpty')}
                </p>
              ) : (
                followedArtistList.map(artist => (
                  <div 
                    key={artist.id}
                    className="bg-white rounded-2xl border border-slate-100 p-3.5 flex gap-3 transition hover:shadow-xs"
                  >
                    <img 
                      referrerPolicy="no-referrer"
                      src={artist.avatarUrl} 
                      alt={artist.name} 
                      className="w-12 h-12 rounded-full object-cover shrink-0 border-2 p-0.5"
                      style={{ borderColor: oshiColor }}
                    />

                    <div className="flex-1 min-w-0 font-sans">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900 tracking-tight">{artist.name}</h4>
                        <button
                          id={`btn-unfollow-artist-${artist.id}`}
                          onClick={() => onToggleFollowArtist(artist.id)}
                          className="text-[10px] py-0.5 px-2.5 rounded-full font-bold border transition-colors"
                          style={{
                            color: oshiColor,
                            borderColor: `${oshiColor}40`,
                            backgroundColor: `${oshiColor}08`
                          }}
                        >
                          {t('oshi.followedArtistButton')}
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {artist.followerCount > 0
                          ? t('oshi.artistFollowers', { count: numberFormatter.format(artist.followerCount), category: artist.category })
                          : t('oshi.artistCategoryOnly', { category: artist.category })}
                      </p>
                      {artist.description && (
                        <p className="text-[10.5px] text-slate-500 line-clamp-1 leading-snug mt-1">{artist.description}</p>
                      )}
                      
                      {/* 检索最新场次：真的跑实时搜索（关注=订阅），结果并入后即时显示 */}
                      <button
                        onClick={() => runEntitySearch(artist.id, artist.name)}
                        disabled={searchingId === artist.id}
                        className="text-[9px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded mt-2.5 hover:bg-slate-200 transition font-bold disabled:opacity-60"
                      >
                        {searchingId === artist.id ? t('oshi.searching') : t('oshi.searchSchedule')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Other Explore Suggestive list */}
            {otherArtistList.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <span className="text-[10px] font-bold text-slate-400 font-mono block">
                  {t('oshi.exploreArtistsTitle')}
                </span>

                <div className="space-y-2">
                  {otherArtistList.map(artist => (
                    <div 
                      key={artist.id}
                      className="bg-white rounded-xl border border-slate-100 p-2.5 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <img 
                          referrerPolicy="no-referrer"
                          src={artist.avatarUrl} 
                          alt={artist.name} 
                          className="w-7 h-7 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <h4 className="text-xs font-bold text-slate-800 truncate">{artist.name}</h4>
                          <span className="text-[8.5px] text-slate-400 uppercase font-mono">{artist.category}</span>
                        </div>
                      </div>

                      <button
                        id={`btn-follow-artist-${artist.id}`}
                        onClick={() => onToggleFollowArtist(artist.id)}
                        className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg transition"
                      >
                        {t('oshi.followButton')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

        {/* 2. Venue Subtab list Content */}
        {activeSubTab === 'venues' && (
          <div className="space-y-4">
            
            {/* Followed Venues list */}
            <div className="space-y-2.5">
              <span className="text-[10px] font-bold text-slate-400 font-mono block">
                {t('oshi.followedVenuesTitle')}
              </span>

              {followedVenueList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-100/80">
                  {t('oshi.followedVenuesEmpty')}
                </p>
              ) : (
                followedVenueList.map(venue => (
                  <div 
                    key={venue.id}
                    className="bg-white rounded-2xl border border-slate-100 p-3.5 flex gap-3 transition hover:shadow-xs"
                  >
                    <div className="w-12 h-12 bg-slate-100 rounded-xl overflow-hidden shrink-0">
                      <img 
                        referrerPolicy="no-referrer"
                        src={venue.imageUrl} 
                        alt={venue.name} 
                        className="w-full h-full object-cover"
                      />
                    </div>

                    <div className="flex-1 min-w-0 font-sans">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-900 truncate tracking-tight">{venue.name}</h4>
                        <button
                          id={`btn-unfollow-venue-${venue.id}`}
                          onClick={() => onToggleFollowVenue(venue.id)}
                          className="text-[10px] py-0.5 px-2.5 rounded-full font-bold border transition-colors"
                          style={{
                            color: oshiColor,
                            borderColor: `${oshiColor}40`,
                            backgroundColor: `${oshiColor}08`
                          }}
                        >
                          {t('oshi.followedVenueButton')}
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {venue.capacity > 0
                          ? t('oshi.venueCapacity', { count: numberFormatter.format(venue.capacity), region: venue.region })
                          : t('oshi.venueRegionOnly', { region: venue.region })}
                      </p>
                      
                      <button
                        onClick={() => runEntitySearch(venue.id, venue.name)}
                        disabled={searchingId === venue.id}
                        className="text-[9px] text-slate-605 bg-slate-100 px-2 py-0.5 rounded mt-2.5 hover:bg-slate-200 transition font-bold disabled:opacity-60"
                      >
                        {searchingId === venue.id ? t('oshi.searching') : t('oshi.searchVenue')}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Other Venues Explore */}
            {otherVenueList.length > 0 && (
              <div className="space-y-2.5 pt-2">
                <span className="text-[10px] font-bold text-slate-400 font-mono block">
                  {t('oshi.exploreVenuesTitle')}
                </span>

                <div className="space-y-2">
                  {otherVenueList.map(v => (
                    <div 
                      key={v.id}
                      className="bg-white rounded-xl border border-slate-100 p-2.5 flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{v.name}</h4>
                        <span className="text-[8.5px] text-slate-400 font-mono">
                          {t('oshi.venueMax', { region: v.region, count: numberFormatter.format(v.capacity) })}
                        </span>
                      </div>
                      <button
                        id={`btn-follow-venue-${v.id}`}
                        onClick={() => onToggleFollowVenue(v.id)}
                        className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-650 rounded-lg shrink-0 hover:bg-slate-200 transition"
                      >
                        {t('oshi.followButton')}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>

    </div>
  );
}

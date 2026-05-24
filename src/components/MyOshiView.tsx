import React, { useState } from 'react';
import { Artist, Venue, ActivityEvent } from '../types';
import { 
  Heart, MapPin, Building, PlusCircle, Star, Sparkles, 
  Trash2, ChevronRight, Hash, Users 
} from 'lucide-react';

interface MyOshiViewProps {
  artists: Artist[];
  venues: Venue[];
  events: ActivityEvent[];
  followedArtists: string[];
  followedVenues: string[];
  onToggleFollowArtist: (id: string) => void;
  onToggleFollowVenue: (id: string) => void;
  onAddCustomArtist: (newArtist: Artist) => void;
  onSelectEvent: (event: ActivityEvent) => void;
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
  onAddCustomArtist,
  onSelectEvent,
  oshiColor
}: MyOshiViewProps) {
  const [activeSubTab, setActiveSubTab] = useState<'artists' | 'venues'>('artists');
  const [showAddArtistModal, setShowAddArtistModal] = useState(false);
  
  // Custom Artist Form state
  const [newArtistName, setNewArtistName] = useState('');
  const [newArtistCategory, setNewArtistCategory] = useState('J-Pop');
  const [newArtistDesc, setNewArtistDesc] = useState('');
  const [newArtistTags, setNewArtistTags] = useState('');

  // Selected focused artist or venue for quick filter
  const [filterFocusId, setFilterFocusId] = useState<string | null>(null);

  // Filter actual lists
  const followedArtistList = artists.filter(a => followedArtists.includes(a.id));
  const otherArtistList = artists.filter(a => !followedArtists.includes(a.id));

  const followedVenueList = venues.filter(v => followedVenues.includes(v.id));
  const otherVenueList = venues.filter(v => !followedVenues.includes(v.id));

  const handleCreateArtistSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newArtistName) return;

    const formattedTags = newArtistTags ? newArtistTags.split(',').map(t => t.trim()) : ['自家星推'];

    const newArtist: Artist = {
      id: `art-user-${Date.now()}`,
      name: newArtistName,
      avatarUrl: 'https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?auto=format&fit=crop&w=150&q=80',
      category: newArtistCategory,
      description: newArtistDesc || '用户自主添加的独占推し主页！快为他/她同步添加更多Live吧。',
      followerCount: 999,
      tags: formattedTags
    };

    onAddCustomArtist(newArtist);
    setShowAddArtistModal(false);

    // Reset Form
    setNewArtistName('');
    setNewArtistDesc('');
    setNewArtistTags('');
  };

  // Find events matching the selected focused artist or venue
  const focusedEvents = events.filter(e => {
    if (activeSubTab === 'artists') {
      return e.artistId === filterFocusId;
    } else {
      return e.venueId === filterFocusId;
    }
  });

  const focusedEntityName = activeSubTab === 'artists' 
    ? artists.find(a => a.id === filterFocusId)?.name 
    : venues.find(v => v.id === filterFocusId)?.name;

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
              <h1 className="text-base font-bold font-display text-slate-900">推し与圣地</h1>
              <p className="text-[10px] text-slate-400">我的星推阵容与常去演厅圣地</p>
            </div>
          </div>

          {activeSubTab === 'artists' && (
            <button
              id="btn-trigger-add-artist"
              onClick={() => setShowAddArtistModal(true)}
              className="p-1 px-2 text-[11px] font-bold rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 flex items-center gap-1 shrink-0"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              <span>添加推し</span>
            </button>
          )}
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
            我推的艺人 ({followedArtistList.length})
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
            关注场馆 ({followedVenueList.length})
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
                <span className="text-[10px] text-slate-400 font-mono">专属巡演检索</span>
                <h3 className="text-xs font-bold text-slate-100 truncate mt-0.5">⭐ {focusedEntityName}</h3>
              </div>
              <button 
                onClick={() => setFilterFocusId(null)}
                className="text-xs text-slate-400 hover:text-white border border-slate-705 px-2 py-0.5 rounded"
              >
                关闭聚合
              </button>
            </div>

            <div className="space-y-2">
              {focusedEvents.length === 0 ? (
                <p className="text-[10px] text-slate-400 py-2">目前日本各大票仓 Pia / e+ 暂不包含其名目下的近期开票实况。</p>
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
                已在推名单 (MY SPECIAL OSHIS)
              </span>

              {followedArtistList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-100/80">
                  点击发现页的小心心，或者在下方候选列表添加您的本命歌姬与偶像！
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
                          已推 ♥
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">粉丝数: {artist.followerCount}名 · {artist.category}</p>
                      <p className="text-[10.5px] text-slate-500 line-clamp-1 leading-snug mt-1">{artist.description}</p>
                      
                      {/* Interactive Aggregate schedule shortcut trigger */}
                      <button
                        onClick={() => setFilterFocusId(artist.id)}
                        className="text-[9px] text-slate-600 bg-slate-100 px-2 py-0.5 rounded mt-2.5 hover:bg-slate-200 transition font-bold"
                      >
                        ⚡ 检索聚合排期
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
                  探索其他人气艺人 (EXPLORE SUGGESTED)
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
                        + 关注
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
                已关注场馆 (MY HOLY VENUES)
              </span>

              {followedVenueList.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 bg-white rounded-2xl border border-slate-100/80">
                  关注场馆可在上方随时展开近期开票的现场合算。
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
                          已关注 ✓
                        </button>
                      </div>

                      <p className="text-[10px] text-slate-400 font-mono mt-0.5">容纳规模: {venue.capacity}人 | {venue.region}</p>
                      
                      <button
                        onClick={() => setFilterFocusId(venue.id)}
                        className="text-[9px] text-slate-605 bg-slate-100 px-2 py-0.5 rounded mt-2.5 hover:bg-slate-200 transition font-bold"
                      >
                        🏢 检索该馆演出
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
                  探索日本标志性 Live House / 巨蛋
                </span>

                <div className="space-y-2">
                  {otherVenueList.map(v => (
                    <div 
                      key={v.id}
                      className="bg-white rounded-xl border border-slate-100 p-2.5 flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <h4 className="text-xs font-bold text-slate-800 truncate">{v.name}</h4>
                        <span className="text-[8.5px] text-slate-400 font-mono">{v.region} · 最大 {v.capacity.toLocaleString()} 人</span>
                      </div>
                      <button
                        id={`btn-follow-venue-${v.id}`}
                        onClick={() => onToggleFollowVenue(v.id)}
                        className="text-[10px] font-bold px-2.5 py-1 bg-slate-100 text-slate-650 rounded-lg shrink-0 hover:bg-slate-200 transition"
                      >
                        + 关注
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

      </div>

      {/* Add Custom Artist Form overlay modal */}
      {showAddArtistModal && (
        <div id="add-artist-modal" className="absolute inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-40">
          <div className="w-full max-w-xs bg-white rounded-3xl p-5 shadow-2xl text-slate-800">
            <h3 className="text-xs font-bold text-slate-930 border-b border-slate-100 pb-2 flex items-center gap-1.5 uppercase font-display">
              <PlusCircle className="w-4 h-4 text-pink-500" />
              添加自定义推し Performer
            </h3>

            <form onSubmit={handleCreateArtistSubmit} className="space-y-3 mt-4 text-xs">
              <div>
                <label className="block text-[10px] font-bold text-slate-400">推し本命名称 (或企划团队名)</label>
                <input
                  id="artist-form-name"
                  type="text"
                  required
                  value={newArtistName}
                  onChange={(e) => setNewArtistName(e.target.value)}
                  placeholder="如: YOASOBI / Ado / 凑阿库娅"
                  className="w-full border border-slate-200 p-2 rounded-lg mt-1 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400">分类领域</label>
                <select
                  id="artist-form-category"
                  value={newArtistCategory}
                  onChange={(e) => setNewArtistCategory(e.target.value)}
                  className="w-full border border-slate-200 p-2 rounded-lg mt-1"
                >
                  <option value="J-Pop">J-Pop (流行乐)</option>
                  <option value="Idol">地下/女子偶像 (Idol)</option>
                  <option value="VTuber">VTuber (虚拟主播)</option>
                  <option value="Rock/Metal">摇滚与金属 (Rock/Metal)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400">爱意宣言 / 本命短述</label>
                <textarea
                  id="artist-form-desc"
                  value={newArtistDesc}
                  onChange={(e) => setNewArtistDesc(e.target.value)}
                  placeholder="请输入对推的简单安利，展现热诚！"
                  className="w-full border border-slate-205 p-2 rounded-lg mt-1 h-16 resize-none focus:outline-none"
                />
              </div>

              <div className="flex gap-2 pt-3 border-t border-slate-150">
                <button
                  id="btn-cancel-add-artist"
                  type="button"
                  onClick={() => setShowAddArtistModal(false)}
                  className="flex-1 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                >
                  取消
                </button>
                <button
                  id="btn-confirm-add-artist"
                  type="submit"
                  className="flex-1 py-2 text-white rounded-lg transition"
                  style={{ backgroundColor: oshiColor }}
                >
                  本命入库
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

import { useState } from 'react';
import { ActivityEvent } from './types';
import { isFavorited } from './favorites';
import { PhoneFrame } from './components/PhoneFrame';
import { DiscoverView } from './components/DiscoverView';
import { CalendarView } from './components/CalendarView';
import { MyOshiView } from './components/MyOshiView';
import { ExtensionView } from './components/ExtensionView';
import { SettingsView } from './components/SettingsView';
import { EventDetailModal } from './components/EventDetailModal';
import { BottomTabBar, type TabId } from './components/BottomTabBar';
import { BellRing, X } from 'lucide-react';
import { useOshiStore } from './store/useOshiStore';
import { useI18n } from './i18n/I18nProvider';

export type OShiColorId = 'pink' | 'blue' | 'green' | 'yellow' | 'purple' | 'red' | 'black' | 'orange';

export default function App() {
  const { locale, localeMode, setLocaleMode, t } = useI18n();
  // Pure view state: active tab + the event whose detail sheet is open.
  const [currentTab, setCurrentTab] = useState<TabId>('discover');
  const [selectedEvent, setSelectedEvent] = useState<ActivityEvent | null>(null);

  // All domain state, persistence and business handlers live in the store hook.
  const store = useOshiStore(t);
  const { activeColorObj, toastMessage, setToastMessage } = store;
  const oshiColor = activeColorObj.colorHex;

  const searchResults = store.searchResultIds
    .map(id => store.events.find(event => event.id === id))
    .filter(Boolean) as ActivityEvent[];

  // 关注页「检索最新场次」用的启用平台（与 Discover 一致：已启用且已安装的插件）。
  const enabledPlatforms = store.extensions
    .filter(ext => ext.isEnabled && ext.isInstalled)
    .map(ext => ext.platform);

  return (
    <div id="application-container-frame" className="min-h-screen bg-slate-100">
      <PhoneFrame oshiColorHex={oshiColor}>

        {/* Realtime floating toast banner simulating a mobile push popup */}
        {toastMessage && (
          <div
            id="mobile-system-toast"
            className="absolute top-12 left-3 right-3 bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl shadow-xl z-[999] border flex items-start gap-2.5 transition-all text-white animate-fade-in"
            style={{ borderColor: `${oshiColor}50` }}
          >
            <BellRing className="w-5 h-5 shrink-0 mt-0.5 animate-bounce" style={{ color: oshiColor }} />
            <div className="flex-1 min-w-0">
              <h5 className="text-[11px] font-bold tracking-tight">{toastMessage.title}</h5>
              <p className="text-[10px] text-slate-350 mt-0.5 leading-snug">{toastMessage.text}</p>
            </div>
            <button
              onClick={() => setToastMessage(null)}
              className="p-1 rounded-full text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Dynamic multi-view router */}
        <div className="flex-1 flex flex-col overflow-hidden relative">
          {currentTab === 'discover' && (
            <DiscoverView
              events={store.events}
              searchResults={searchResults}
              searchReports={store.searchReports}
              recentSearches={store.recentSearches}
              searching={store.isSearching}
              extensions={store.extensions}
              artists={store.artists}
              venues={store.venues}
              onSelectEvent={setSelectedEvent}
              favorites={store.favorites}
              onToggleFavorite={store.handleToggleFavorite}
              onRunPlatformSearch={store.handleRunPlatformSearch}
              onClearSearchResults={store.clearSearchResults}
              oshiColor={oshiColor}
            />
          )}

          {currentTab === 'calendar' && (
            <CalendarView
              events={store.events}
              favorites={store.favorites}
              followedArtists={store.followedArtists}
              followedVenues={store.followedVenues}
              activeAlerts={store.activeAlerts}
              onSelectEvent={setSelectedEvent}
              oshiColor={oshiColor}
            />
          )}

          {currentTab === 'oshis' && (
            <MyOshiView
              artists={store.artists}
              venues={store.venues}
              events={store.events}
              followedArtists={store.followedArtists}
              followedVenues={store.followedVenues}
              onToggleFollowArtist={store.handleToggleFollowArtist}
              onToggleFollowVenue={store.handleToggleFollowVenue}
              onSelectEvent={setSelectedEvent}
              onSearchEntity={async (name) => { await store.handleRunPlatformSearch(name, enabledPlatforms); }}
              lastViewed={store.lastViewed}
              onViewEntity={store.markViewed}
              oshiColor={oshiColor}
            />
          )}

          {currentTab === 'extensions' && (
            <ExtensionView
              extensions={store.extensions}
              onToggleExtension={store.handleToggleExtension}
              oshiColor={oshiColor}
            />
          )}

          {currentTab === 'settings' && (
            <SettingsView
              currentOshiColorId={store.oshiColorId}
              onSelectOshiColor={store.handleSelectOshiColor}
              onResetDatabase={store.handleResetDatabase}
              oshiColorHex={oshiColor}
              locale={locale}
              localeMode={localeMode}
              onSelectLocaleMode={setLocaleMode}
            />
          )}
        </div>

        {/* Mobile-native bottom tab bar (frosted glass + accent capsule) */}
        <BottomTabBar
          currentTab={currentTab}
          onChange={setCurrentTab}
          oshiColor={oshiColor}
        />

        {/* Global event detail bottom-sheet overlay */}
        {selectedEvent && (
          <EventDetailModal
            event={selectedEvent}
            artists={store.artists}
            venues={store.venues}
            onClose={() => setSelectedEvent(null)}
            isFavorited={isFavorited(selectedEvent, store.favorites)}
            onToggleFavorite={store.handleToggleFavorite}
            isArtistFollowed={store.followedArtists.includes(selectedEvent.artistId)}
            onToggleFollowArtist={store.handleToggleFollowArtist}
            isVenueFollowed={store.followedVenues.includes(selectedEvent.venueId)}
            onToggleFollowVenue={store.handleToggleFollowVenue}
            activeAlerts={store.activeAlerts}
            onToggleAlert={store.handleToggleAlert}
            onEnrichEvent={store.handleEnrichEvent}
            oshiColor={oshiColor}
          />
        )}

      </PhoneFrame>
    </div>
  );
}

import React from 'react';
import type { Locale, LocaleMode } from '../i18n/core';
import { useI18n } from '../i18n/I18nProvider';
import { OSHI_COLORS } from '../data/mockData';
import { Settings, Palette, Trash2, Heart, Languages } from 'lucide-react';

interface SettingsViewProps {
  currentOshiColorId: string;
  onSelectOshiColor: (colorId: string) => void;
  onResetDatabase: () => void;
  oshiColorHex: string; // hex
  locale: Locale;
  localeMode: LocaleMode;
  onSelectLocaleMode: (mode: LocaleMode) => void;
}

export function SettingsView({
  currentOshiColorId,
  onSelectOshiColor,
  onResetDatabase,
  oshiColorHex,
  locale,
  localeMode,
  onSelectLocaleMode,
}: SettingsViewProps) {
  const { t } = useI18n();
  
  const handleReset = () => {
    if (window.confirm(t('settings.resetConfirm'))) {
      onResetDatabase();
      alert(t('settings.resetDone'));
    }
  };

  const languageOptions: Array<{ mode: LocaleMode; label: string }> = [
    { mode: 'system', label: t('settings.language.optionSystem') },
    { mode: 'zh-CN', label: t('settings.language.optionChinese') },
    { mode: 'ja-JP', label: t('settings.language.optionJapanese') },
  ];

  return (
    <div id="settings-view-root" className="flex-1 flex flex-col overflow-hidden">
      
      {/* Header Panel */}
      <div className="bg-white px-4 pt-3 pb-3 border-b border-slate-100 z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <div 
            className="p-1 px-1.5 rounded-xl text-white transition-colors"
            style={{ backgroundColor: oshiColorHex }}
          >
            <Settings className="w-4 h-4 animate-spin-slow" />
          </div>
          <div>
            <h1 className="text-base font-bold font-display text-slate-900">{t('settings.title')}</h1>
            <p className="text-[10px] text-slate-400 font-mono">{t('settings.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        <div className="bg-white rounded-2xl p-4 border border-slate-150 space-y-3">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Languages className="w-4 h-4 text-sky-500" />
            {t('settings.language.title')}
          </h3>
          <p className="text-[10.5px] text-slate-400 leading-relaxed">{t('settings.language.body')}</p>

          <div className="grid grid-cols-1 gap-2">
            {languageOptions.map((option) => {
              const isActive = localeMode === option.mode;
              return (
                <button
                  key={option.mode}
                  type="button"
                  onClick={() => onSelectLocaleMode(option.mode)}
                  className={`flex items-center justify-between rounded-xl border px-3 py-2 text-left transition ${
                    isActive ? 'border-slate-800 bg-slate-50 shadow-xs' : 'border-slate-150 bg-white hover:border-slate-300'
                  }`}
                >
                  <span className="text-xs font-bold text-slate-800">{option.label}</span>
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: isActive ? oshiColorHex : '#cbd5e1' }}
                  />
                </button>
              );
            })}
          </div>

          <p className="text-[9.5px] text-slate-400">
            {localeMode === 'system' ? `${t('settings.language.optionSystem')} -> ${locale}` : locale}
          </p>
        </div>
        
        {/* Aesthetic My Oshi Statement */}
        <div className="bg-white rounded-2xl p-4 border border-slate-150 space-y-3">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-pink-500" />
            {t('settings.colorTitle')}
          </h3>
          <p className="text-[10.5px] text-slate-400 leading-relaxed">
            {t('settings.colorBody')}
          </p>

          {/* Grid Selection matrix */}
          <div className="grid grid-cols-2 gap-2 pt-1">
            {OSHI_COLORS.map((color) => {
              const isActive = color.id === currentOshiColorId;
              return (
                <button
                  key={color.id}
                  id={`color-btn-${color.id}`}
                  onClick={() => onSelectOshiColor(color.id)}
                  className={`p-2.5 rounded-xl border text-left flex items-center gap-2 transition duration-200 relative ${
                    isActive 
                      ? 'bg-slate-50 border-slate-700 shadow-xs' 
                      : 'bg-white border-slate-150 hover:border-slate-300'
                  }`}
                >
                  <span 
                    className="w-3.5 h-3.5 rounded-full shrink-0 border border-black/10"
                    style={{ backgroundColor: color.colorHex }}
                  ></span>
                  <div className="min-w-0">
                    <p className="text-[10.5px] font-bold text-slate-800 truncate leading-tight">
                      {locale === 'ja-JP' ? color.jpName : color.name}
                    </p>
                    <p className="text-[9px] text-slate-400 font-mono leading-tight">
                      {locale === 'ja-JP' ? color.name : color.jpName}
                    </p>
                  </div>
                  
                  {isActive && (
                    <span 
                      className="absolute right-2 top-1.5 w-2 h-2 rounded-full"
                      style={{ backgroundColor: color.colorHex }}
                    ></span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Database Clear Actions */}
        <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-rose-800 flex items-center gap-1.5">
            <Trash2 className="w-4 h-4 text-rose-650" />
            {t('settings.resetTitle')}
          </h3>
          <p className="text-[10px] text-rose-700 leading-normal">
            {t('settings.resetBody')}
          </p>
          <button
            id="btn-reset-db"
            onClick={handleReset}
            className="w-full py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition shadow-md"
          >
            {t('settings.resetButton')}
          </button>
        </div>

        {/* App Meta Version credit lines */}
        <div className="text-center pt-4 space-y-1">
          <div className="flex justify-center items-center gap-1 text-slate-400">
            <Heart className="w-3.5 h-3.5 fill-pink-500 text-pink-500 animate-pulse" />
            <span className="text-[10.5px] font-bold text-slate-500">推し活マネージャー v1.0</span>
          </div>
          <p className="text-[9px] text-slate-400 font-mono">
            {t('settings.metaStack')}
          </p>
          <p className="text-[9px] text-slate-400/80">
            {t('settings.metaDescription')}
          </p>
        </div>

      </div>

    </div>
  );
}

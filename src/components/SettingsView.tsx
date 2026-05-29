import React from 'react';
import { OShiColorId } from '../App';
import { OshiColor } from '../types';
import { OSHI_COLORS } from '../data/mockData';
import { Settings, Palette, Trash2, Heart } from 'lucide-react';

interface SettingsViewProps {
  currentOshiColorId: string;
  onSelectOshiColor: (colorId: string) => void;
  onResetDatabase: () => void;
  oshiColorHex: string; // hex
}

export function SettingsView({
  currentOshiColorId,
  onSelectOshiColor,
  onResetDatabase,
  oshiColorHex
}: SettingsViewProps) {
  
  const handleReset = () => {
    if (window.confirm('确认重置推し活票务数据库吗？您关注的所有艺人、场馆、本地自备Live以及自定义闹钟提醒都将恢复为默认就绪数值！')) {
      onResetDatabase();
      alert('数据库初始化重置成功！');
    }
  };

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
            <h1 className="text-base font-bold font-display text-slate-900">系统设置</h1>
            <p className="text-[10px] text-slate-400 font-mono">Custom Preferences & Parameters</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        
        {/* Aesthetic My Oshi Statement */}
        <div className="bg-white rounded-2xl p-4 border border-slate-150 space-y-3">
          <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Palette className="w-4 h-4 text-pink-500" />
            我推的本命应援色 (My Oshi Color)
          </h3>
          <p className="text-[10.5px] text-slate-400 leading-relaxed">
            日本演唱会应援文化中，选择代表您本命演员或团队的特型“推し色”至关重要。更改后，APP 核心标志、开票提醒、主题按钮和焦点框将瞬间染上本命色彩！
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
                    <p className="text-[10.5px] font-bold text-slate-800 truncate leading-tight">{color.name}</p>
                    <p className="text-[9px] text-slate-400 font-mono leading-tight">{color.jpName}</p>
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
            重置本地票仓数据
          </h3>
          <p className="text-[10px] text-rose-700 leading-normal">
            若您的自定义演出产生冲突，或者想重载内置预售爬虫，可清空 LocalStorage 来重新抓取基础 Pia、e+、LivePocket 表单。
          </p>
          <button
            id="btn-reset-db"
            onClick={handleReset}
            className="w-full py-2 bg-rose-500 hover:bg-rose-600 text-white rounded-xl text-xs font-bold transition shadow-md"
          >
            一键全库重置
          </button>
        </div>

        {/* App Meta Version credit lines */}
        <div className="text-center pt-4 space-y-1">
          <div className="flex justify-center items-center gap-1 text-slate-400">
            <Heart className="w-3.5 h-3.5 fill-pink-500 text-pink-500 animate-pulse" />
            <span className="text-[10.5px] font-bold text-slate-500">推し活マネージャー v1.0.0</span>
          </div>
          <p className="text-[9px] text-slate-400 font-mono">
            基建支持: React 19 / Capacitor Edge Core / Tailwind V4
          </p>
          <p className="text-[9px] text-slate-400/80">
            仅限日本巨蛋、Livehouse票务提醒与多规合一ICS同步
          </p>
        </div>

      </div>

    </div>
  );
}

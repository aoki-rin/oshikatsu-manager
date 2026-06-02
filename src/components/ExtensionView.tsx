import React, { useState } from 'react';
import { ExtensionSource } from '../types';
import { Puzzle, Search } from 'lucide-react';

interface ExtensionViewProps {
  extensions: ExtensionSource[];
  onToggleExtension: (id: string) => void;
  oshiColor: string; // hex
}

export function ExtensionView({
  extensions,
  onToggleExtension,
  oshiColor
}: ExtensionViewProps) {
  const [extSearchText, setExtSearchText] = useState('');

  const installedExtensions = extensions.filter(
    e => e.isInstalled && e.name.toLowerCase().includes(extSearchText.toLowerCase())
  );

  return (
    <div id="extension-view-root" className="flex-1 flex flex-col overflow-hidden">

      {/* Header Panel */}
      <div className="bg-white px-4 pt-3 pb-3 border-b border-slate-100 z-10 sticky top-0">
        <div className="flex items-center gap-2">
          <div
            className="p-1 px-1.5 rounded-xl text-white transition-colors"
            style={{ backgroundColor: oshiColor }}
          >
            <Puzzle className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-base font-bold font-display text-slate-900">数据源插件</h1>
            <p className="text-[10px] text-slate-400">启用 / 停用哪些平台参与聚合搜索</p>
          </div>
        </div>

        {/* Extension search */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            id="ext-search-input"
            type="text"
            value={extSearchText}
            onChange={(e) => setExtSearchText(e.target.value)}
            placeholder="筛选已安装票源..."
            className="w-full text-xs pl-8.5 pr-4 py-2 bg-slate-100 rounded-xl border border-slate-150 focus:outline-none focus:border-slate-300 focus:bg-white"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>

        {/* Installed sources */}
        <div className="space-y-2.5">
          <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider block">
            票源 ({installedExtensions.length} 个)
          </span>

          {installedExtensions.map(ext => (
            <div
              key={ext.id}
              id={`ext-installed-${ext.id}`}
              className="bg-white rounded-2xl p-3.5 border border-slate-150 flex gap-3 items-start justify-between shadow-xs"
            >
              <div className="flex-1 min-w-0">
                <h4 className="text-xs font-bold text-slate-900">{ext.name}</h4>

                <p className="text-[10.5px] text-slate-500 mt-1.5 leading-snug">
                  {ext.description}
                </p>
              </div>

              {/* Enable/disable toggle (real: controls which platforms search) */}
              <div className="flex items-center gap-1.5 pt-0.5 shrink-0">
                <span className="text-[9px] font-bold text-slate-400">{ext.isEnabled ? '已启用' : '已停用'}</span>
                <button
                  id={`toggle-${ext.id}`}
                  onClick={() => onToggleExtension(ext.id)}
                  className={`w-10 h-5 flex items-center rounded-full p-0.5 cursor-pointer transition-all shrink-0 ${
                    ext.isEnabled ? 'bg-emerald-500 justify-end' : 'bg-slate-200 justify-start'
                  }`}
                >
                  <div className="w-4 h-4 rounded-full bg-white shadow-md"></div>
                </button>
              </div>
            </div>
          ))}
        </div>

      </div>

    </div>
  );
}

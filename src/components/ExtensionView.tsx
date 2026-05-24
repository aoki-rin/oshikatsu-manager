import React, { useState } from 'react';
import { ExtensionSource } from '../types';
import { 
  Puzzle, Download, Check, AlertTriangle, RefreshCw, 
  Search, Sliders, Server, Star, HelpCircle 
} from 'lucide-react';

interface ExtensionViewProps {
  extensions: ExtensionSource[];
  onToggleExtension: (id: string) => void;
  onInstallExtension: (id: string) => void;
  onUpdateExtension: (id: string) => void;
  onPingExtensions: () => void;
  oshiColor: string; // hex
}

export function ExtensionView({
  extensions,
  onToggleExtension,
  onInstallExtension,
  onUpdateExtension,
  onPingExtensions,
  oshiColor
}: ExtensionViewProps) {
  const [extSearchText, setExtSearchText] = useState('');
  const [pinging, setPinging] = useState(false);

  const installedExtensions = extensions.filter(
    e => e.isInstalled && e.name.toLowerCase().includes(extSearchText.toLowerCase())
  );
  
  const uninstalledExtensions = extensions.filter(
    e => !e.isInstalled && e.name.toLowerCase().includes(extSearchText.toLowerCase())
  );

  const triggerPingCycle = () => {
    setPinging(true);
    onPingExtensions();
    setTimeout(() => {
      setPinging(false);
    }, 800);
  };

  return (
    <div id="extension-view-root" className="flex-1 flex flex-col overflow-hidden">
      
      {/* Header Panel */}
      <div className="bg-white px-4 pt-3 pb-3 border-b border-slate-100 z-10 sticky top-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div 
              className="p-1 px-1.5 rounded-xl text-white transition-colors"
              style={{ backgroundColor: oshiColor }}
            >
              <Puzzle className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-base font-bold font-display text-slate-900">数据源插件</h1>
              <p className="text-[10px] text-slate-400">类似Tachiyomi形式的外部票源拓展库</p>
            </div>
          </div>

          <button
            id="btn-ping-extensions"
            onClick={triggerPingCycle}
            disabled={pinging}
            className="text-[10px] font-bold px-2 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 flex items-center gap-1 transition shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-slate-500 ${pinging ? 'animate-spin' : ''}`} />
            <span>{pinging ? '测速中...' : '延迟测速'}</span>
          </button>
        </div>

        {/* Extension search */}
        <div className="relative mt-3">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            id="ext-search-input"
            type="text"
            value={extSearchText}
            onChange={(e) => setExtSearchText(e.target.value)}
            placeholder="搜索日本各大票源/定制插件..."
            className="w-full text-xs pl-8.5 pr-4 py-2 bg-slate-100 rounded-xl border border-slate-150 focus:outline-none focus:border-slate-300 focus:bg-white"
          />
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar" style={{ scrollbarWidth: 'none' }}>
        
        {/* Concept Introduction banner */}
        <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white rounded-2xl p-4 space-y-2 border border-slate-800 shadow-lg">
          <p className="text-[11px] font-mono text-slate-400 uppercase tracking-widest">插件机制说明</p>
          <h3 className="text-xs font-bold leading-snug">为什么是类似 Tachiyomi 的拓展组件？</h3>
          <p className="text-[10.5px] text-slate-300 leading-normal">
            日本各票仓（Pia、eplus、LivePocket）的防机器反爬和规则异动极为频繁。通过<b>插件模式</b>，各平台网页结构规则被独立维护：
          </p>
          <ul className="text-[10px] text-slate-400 space-y-1 list-disc pl-4 leading-normal">
            <li>单独升级指定平台抓取脚本无需更新整包App。</li>
            <li>用户可以按自己关注的组合，开启对应票务插件，精简内存与网络负荷。</li>
          </ul>
        </div>

        {/* 1. Installed Extension sections */}
        <div className="space-y-2.5">
          <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider block">
            已安装票源 ({installedExtensions.length} 个)
          </span>

          {installedExtensions.map(ext => {
            return (
              <div 
                key={ext.id}
                id={`ext-installed-${ext.id}`}
                className="bg-white rounded-2xl p-3.5 border border-slate-150 flex gap-3 items-start justify-between shadow-xs"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <h4 className="text-xs font-bold text-slate-900">{ext.name}</h4>
                    <span className="text-[8px] font-mono px-1 bg-slate-100 text-slate-500 rounded">
                      {ext.version}
                    </span>
                    {ext.updateAvailable && (
                      <span className="text-[8px] text-amber-600 bg-amber-50 px-1 rounded animate-pulse font-bold">
                        NEW
                      </span>
                    )}
                  </div>

                  <p className="text-[10.5px] text-slate-500 mt-1.5 leading-snug">
                    {ext.description}
                  </p>

                  <div className="flex items-center gap-3 mt-3">
                    <span className="text-[9px] text-slate-400 flex items-center gap-1 font-mono">
                      <Server className="w-3 h-3" />
                      延迟: {ext.isEnabled ? <b className="text-emerald-500">{ext.latencyMs}ms</b> : <span className="text-slate-300">未启用</span>}
                    </span>
                    <span className="text-[9px] text-slate-400 font-mono">作者: {ext.author}</span>
                  </div>
                </div>

                {/* Right actions side: Turn ON toggle, or update button */}
                <div className="flex flex-col items-end gap-2.5">
                  {/* Enabled status slider */}
                  <div className="flex items-center gap-1.5 pt-0.5">
                    <span className="text-[9px] font-bold text-slate-400">{ext.isEnabled ? '在役' : '休眠'}</span>
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

                  {ext.updateAvailable ? (
                    <button
                      id={`btn-update-${ext.id}`}
                      onClick={() => onUpdateExtension(ext.id)}
                      className="text-[9px] font-bold px-2 py-1 rounded bg-amber-500 text-white hover:bg-amber-600 transition"
                    >
                      一键升级
                    </button>
                  ) : (
                    <span className="text-[9.5px] text-slate-400 font-medium">最新版</span>
                  )}
                </div>

              </div>
            );
          })}
        </div>

        {/* 2. Directory Market section (Not Installed) */}
        <div className="space-y-2.5 pt-2">
          <span className="text-[10px] font-bold text-slate-400 font-mono tracking-wider block">
            插件源大厅 (COMMUNITY REPOSITORY)
          </span>

          {uninstalledExtensions.length === 0 ? (
            <p className="text-[10.5px] text-slate-400 py-2">暂无未安装的其他社区贡献抓取源。</p>
          ) : (
            <div className="space-y-2">
              {uninstalledExtensions.map(ext => {
                return (
                  <div 
                    key={ext.id}
                    id={`ext-market-${ext.id}`}
                    className="bg-white rounded-xl p-3 border border-slate-100 flex items-center justify-between"
                  >
                    <div className="min-w-0 pr-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-800">{ext.name}</h4>
                        <span className="text-[8px] bg-slate-100 text-slate-500 rounded font-mono px-1">社区版</span>
                      </div>
                      <p className="text-[10px] text-slate-500 leading-snug line-clamp-1">{ext.description}</p>
                    </div>

                    <button
                      id={`btn-install-${ext.id}`}
                      onClick={() => onInstallExtension(ext.id)}
                      className="text-[10.5px] font-bold px-3 py-1 text-white rounded-lg hover:opacity-90 shrink-0 flex items-center gap-1 transition"
                      style={{ backgroundColor: oshiColor }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>安装</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}

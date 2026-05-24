import React, { useState } from 'react';
import { Smartphone, Monitor, Wifi, Signal, Battery } from 'lucide-react';

interface PhoneFrameProps {
  children: React.ReactNode;
  oshiColorHex: string;
}

export function PhoneFrame({ children, oshiColorHex }: PhoneFrameProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Get current mobile system hours
  const systemTime = "14:45";

  return (
    <div id="phone-frame-root" className="min-h-screen bg-[#121212] text-slate-100 flex flex-col items-center justify-start p-2 sm:p-6 transition-colors duration-300 relative overflow-hidden">
      
      {/* Desktop Background Decoration (Geometric Balance) */}
      <div className="absolute top-12 left-10 opacity-15 hidden lg:block select-none pointer-events-none transition-colors duration-300" style={{ color: oshiColorHex }}>
        <div className="text-7xl font-black tracking-tighter">PUSHIKATSU</div>
        <div className="text-9xl font-black tracking-widest -mt-4">MANAGER</div>
      </div>
      <div className="absolute bottom-12 right-10 text-white opacity-10 text-right hidden lg:block select-none pointer-events-none font-mono">
        <div className="text-xl font-bold">v1.2.0-STABLE</div>
        <div className="text-sm mt-1 tracking-wider">GEOMETRIC BALANCE ACTIVE ENGINE</div>
        <div className="text-xs text-slate-405 mt-0.5">AGGREGATING: PIA, E+, LIVEPOCKET, TIGET</div>
      </div>

      {/* Visual Workspace Controller Top Bar */}
      <div id="phone-workspace-controls" className="w-full max-w-sm sm:max-w-md bg-slate-800/80 backdrop-blur-md px-4 py-2 border border-slate-700 rounded-2xl flex items-center justify-between mb-4 shadow-xl z-20">
        <span className="text-xs font-mono text-slate-400 flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping"></span>
          推し活スマホ端末模擬
        </span>

        {/* View Switch Mockup Button */}
        <button
          id="btn-toggle-fullscreen"
          onClick={() => setIsFullscreen(!isFullscreen)}
          className="text-xs font-medium px-2.5 py-1 rounded bg-slate-700 hover:bg-slate-600 text-slate-200 flex items-center gap-1 transition-all"
        >
          {isFullscreen ? (
            <>
              <Smartphone className="w-3 h-3" />
              <span>智能手机外壳</span>
            </>
          ) : (
            <>
              <Monitor className="w-3 h-3" />
              <span>全屏铺满</span>
            </>
          )}
        </button>
      </div>

      {isFullscreen ? (
        /* Fullscreen Layout covering full height/width without border mockup */
        <div id="phone-content-fullscreen" className="w-full max-w-md h-[840px] bg-white text-slate-950 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col border border-slate-800">
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            {children}
          </div>
        </div>
      ) : (
        /* Native Mock iPhone/Android Layout with physical bezel, camera pill, status bar & home indicator */
        <div 
          id="phone-physical-container" 
          className="relative w-[385px] h-[820px] bg-slate-950 rounded-[52px] p-3 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.8)] border-[6px] border-slate-800 flex flex-col select-none ring-12 ring-slate-900/30 ring-offset-4 ring-offset-slate-800"
          style={{ borderColor: `${oshiColorHex}50` }}
        >
          {/* Top Speaker / Dynamic Island notch simulation */}
          <div className="absolute top-5 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-3xl z-40 flex items-center justify-end px-2">
            <div className="w-2.5 h-2.5 rounded-full bg-slate-900 border border-slate-800"></div>
          </div>
          
          {/* Upper Corner Buttons (Side Physical Buttons) */}
          <div className="absolute -left-2 top-24 w-1 h-12 bg-slate-700 rounded-r"></div>
          <div className="absolute -left-2 top-40 w-1 h-16 bg-slate-700 rounded-r"></div>
          <div className="absolute -left-2 top-60 w-1 h-16 bg-slate-700 rounded-r"></div>
          <div className="absolute -right-2 top-36 w-1 h-20 bg-slate-700 rounded-l"></div>

          {/* Screen Content Wrapper */}
          <div id="phone-screen-screen" className="flex-1 bg-slate-50 text-slate-900 rounded-[44px] overflow-hidden relative flex flex-col border-4 border-black">
            
            {/* Native App Top Status Bar */}
            <div id="phone-status-bar" className="h-11 px-6 pt-1 flex items-center justify-between text-black font-semibold text-xs select-none z-30 bg-white border-b border-slate-100">
              <span className="font-mono tracking-tight">{systemTime}</span>
              
              {/* Dynamic status icons */}
              <div className="flex items-center gap-1.5">
                <Signal className="w-3.5 h-3.5 text-slate-900" strokeWidth={2.5} />
                <span className="text-[10px] font-bold tracking-tighter">5G</span>
                <Wifi className="w-3.5 h-3.5 text-slate-900" strokeWidth={2.5} />
                <div className="flex items-center gap-0.5">
                  <Battery className="w-4 h-4 text-slate-900 rotate-0" strokeWidth={2.5} />
                </div>
              </div>
            </div>

            {/* Inner Application content space */}
            <div id="phone-app-inner-scroll" className="flex-1 flex flex-col overflow-hidden relative bg-slate-50">
              {children}
            </div>

            {/* Bottom Screen Home Bar indicator for gestural swipe mock */}
            <div id="phone-home-indicator" className="h-6 w-full bg-white flex items-center justify-center pb-1.5 z-30 border-t border-slate-50">
              <div className="w-32 h-1 bg-slate-300 rounded-full"></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

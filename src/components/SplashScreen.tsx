import { useEffect, useState } from 'react';

interface SplashScreenProps {
  oshiColor: string; // hex
  onDone: () => void;
}

// 开屏动画（参考 oshibeta）：深色底 + 应援色旋转双环 + 圆角粉块「推」+ 品牌字，约 1.25s 后淡出。
// 纯 CSS（不引入 motion 依赖）。原生静态启动屏 = 深色 #121212 + 同款「推」图标，与此衔接无割裂：
// 容器首帧即不透明（不透出底下 app），仅内层图标/字做轻微入场；退出时整体淡出+缩放+模糊。
export function SplashScreen({ oshiColor, onDone }: SplashScreenProps) {
  const [entered, setEntered] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const enter = requestAnimationFrame(() => setEntered(true));
    const leaveTimer = setTimeout(() => setLeaving(true), 1250);
    const doneTimer = setTimeout(onDone, 1750);
    return () => {
      cancelAnimationFrame(enter);
      clearTimeout(leaveTimer);
      clearTimeout(doneTimer);
    };
  }, [onDone]);

  return (
    <div
      className={`absolute inset-0 z-[1000] flex flex-col items-center justify-center overflow-hidden transition-all duration-500 ease-out ${
        leaving ? 'opacity-0 scale-110 blur-md pointer-events-none' : 'opacity-100'
      }`}
      style={{ backgroundColor: '#121212' }}
      aria-hidden="true"
    >
      <div
        className={`flex flex-col items-center transition-all duration-500 ease-out ${
          entered ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-3 scale-95'
        }`}
      >
        <div className="relative w-28 h-28 flex items-center justify-center">
          <div
            className="absolute inset-0 rounded-full border-4 border-dashed"
            style={{ borderColor: `${oshiColor}55`, animation: 'oshi-spin 3s linear infinite' }}
          />
          <div
            className="absolute inset-2 rounded-full border-2"
            style={{ borderColor: oshiColor, animation: 'oshi-spin 2s linear infinite reverse' }}
          />
          <div
            className="w-14 h-14 flex items-center justify-center rounded-2xl shadow-xl z-10"
            style={{ backgroundColor: oshiColor }}
          >
            <span className="text-white font-black text-3xl leading-none">推</span>
          </div>
        </div>

        <div className="mt-7 flex flex-col items-center">
          <h1 className="text-2xl font-black tracking-tighter" style={{ color: oshiColor }}>PUSHIKATSU</h1>
          <h2 className="text-sm font-bold tracking-[0.3em] text-white/80 -mt-0.5">MANAGER</h2>
        </div>
      </div>
    </div>
  );
}

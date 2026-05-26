import { Compass, Calendar, Heart, Puzzle, Settings, type LucideIcon } from 'lucide-react';

export type TabId = 'discover' | 'calendar' | 'oshis' | 'extensions' | 'settings';

interface TabDef {
  id: TabId;
  label: string;
  Icon: LucideIcon;
  /** 选中时填充图标（如爱心） */
  fillWhenActive?: boolean;
}

const TABS: readonly TabDef[] = [
  { id: 'discover', label: '发现聚合', Icon: Compass },
  { id: 'calendar', label: '票务日前', Icon: Calendar },
  { id: 'oshis', label: '追の阵容', Icon: Heart, fillWhenActive: true },
  { id: 'extensions', label: '扩展插件', Icon: Puzzle },
  { id: 'settings', label: '应援设置', Icon: Settings },
];

interface BottomTabBarProps {
  currentTab: TabId;
  onChange: (tab: TabId) => void;
  /** 当前推しテーマ色 (hex, e.g. #ec4899) */
  oshiColor: string;
}

// 高级感底部导航：磨砂玻璃浮层 + Material 3 风格的「胶囊高亮」+ 图标发光。
// 选中态用推し色：胶囊底色(透明叠加)、图标/文字着色、图标下方柔光。
export function BottomTabBar({ currentTab, onChange, oshiColor }: BottomTabBarProps) {
  return (
    <nav
      id="mobile-native-tabbar"
      className="relative z-30 shrink-0 flex items-stretch justify-around gap-1 px-3 pt-2 pb-3
                 h-20 rounded-t-[28px] bg-white/80 backdrop-blur-2xl
                 border-t border-slate-200/50
                 shadow-[0_-14px_40px_-18px_rgba(15,23,42,0.22)]"
    >
      {/* 顶部柔光高光线：比硬边框更精致 */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-10 top-0 h-px rounded-full
                   bg-gradient-to-r from-transparent via-slate-300/60 to-transparent"
      />

      {TABS.map(({ id, label, Icon, fillWhenActive }) => {
        const active = currentTab === id;
        return (
          <button
            key={id}
            id={`tabnav-${id}`}
            type="button"
            onClick={() => onChange(id)}
            aria-current={active ? 'page' : undefined}
            aria-label={label}
            className="group relative flex flex-1 flex-col items-center justify-center gap-1
                       transition-transform duration-200 ease-out active:scale-90 focus:outline-none"
            style={active ? { color: oshiColor } : undefined}
          >
            {/* 图标 + 胶囊高亮 */}
            <span className="relative flex items-center justify-center">
              {/* 胶囊高亮（仅选中态显示，绝对定位避免撑动布局） */}
              <span
                aria-hidden
                className={`pointer-events-none absolute left-1/2 top-1/2 h-8 w-[60px] -translate-x-1/2 -translate-y-1/2
                            rounded-full transition-all duration-300 ease-out
                            ${active ? 'scale-100 opacity-100' : 'scale-75 opacity-0'}`}
                style={{ backgroundColor: `${oshiColor}1f` }}
              />
              {/* 图标本体（选中态上浮 + 柔光） */}
              <Icon
                className={`relative w-[22px] h-[22px] transition-all duration-300 ease-out
                            ${active ? '-translate-y-px' : 'text-slate-400 group-hover:text-slate-500'}`}
                strokeWidth={active ? 2.6 : 2}
                fill={active && fillWhenActive ? 'currentColor' : 'none'}
                style={active ? { filter: `drop-shadow(0 5px 11px ${oshiColor}66)` } : undefined}
              />
            </span>

            {/* 文字标签 */}
            <span
              className={`relative text-[10px] leading-none tracking-wide transition-colors duration-300
                          ${active ? 'font-bold' : 'font-medium text-slate-400 group-hover:text-slate-500'}`}
            >
              {label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

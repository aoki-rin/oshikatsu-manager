import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Check } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider';

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface AppSelectProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** 当前推しテーマ色 (hex) — 用于选中项高亮 */
  oshiColor: string;
  /** trigger 按钮的外观类（沿用各调用点原有样式） */
  className?: string;
  /** 弹层顶部标题（可选） */
  title?: string;
  /** 无障碍 label */
  ariaLabel?: string;
  id?: string;
}

// 自定义下拉：用「底部弹层 (bottom sheet)」替代原生 <select>。
// 原生 select 在安卓上会弹出无法定制的系统框；这里全程自绘，iOS/Android/浏览器一致且更精致。
// 通过 portal 渲染到 #app-screen，盖住整个手机列（绕过内容区的 overflow-hidden）。
export function AppSelect<T extends string>({
  value,
  onChange,
  options,
  oshiColor,
  className,
  title,
  ariaLabel,
  id,
}: AppSelectProps<T>) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  // 打开时：Esc 关闭
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const host =
    typeof document !== 'undefined'
      ? document.getElementById('app-screen') ?? document.body
      : null;

  const triggerClass =
    'flex items-center justify-between gap-1 text-left ' +
    (className ??
      'w-full text-[11px] font-semibold bg-white border border-slate-200 p-1.5 rounded-lg');

  return (
    <>
      <button
        id={id}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        className={`${triggerClass} focus:outline-none active:scale-[0.99] transition-transform`}
      >
        <span className="truncate">{selected?.label ?? t('common.selectPlaceholder')}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 shrink-0 text-slate-400 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open &&
        host &&
        createPortal(
          <div
            className="absolute inset-0 z-[60] flex items-end justify-center"
            role="dialog"
            aria-modal="true"
          >
            {/* 背景遮罩 */}
            <div
              className="sheet-backdrop absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* 弹层面板 */}
            <div className="sheet-panel relative w-full max-w-[480px] bg-white rounded-t-[28px] shadow-2xl">
              {/* 抓手 */}
              <div className="flex justify-center pt-3 pb-1">
                <span className="h-1.5 w-10 rounded-full bg-slate-200" />
              </div>

              {title && (
                <h3 className="px-5 pb-1 pt-1 text-sm font-bold text-slate-800">{title}</h3>
              )}

              <ul
                role="listbox"
                className="px-2 pb-[max(env(safe-area-inset-bottom),12px)] pt-1 max-h-[55vh] overflow-y-auto"
              >
                {options.map((o) => {
                  const active = o.value === value;
                  return (
                    <li key={o.value} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onClick={() => {
                          onChange(o.value);
                          setOpen(false);
                        }}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl text-sm transition-colors ${
                          active
                            ? 'font-bold'
                            : 'font-medium text-slate-700 active:bg-slate-100 hover:bg-slate-50'
                        }`}
                        style={
                          active
                            ? { color: oshiColor, backgroundColor: `${oshiColor}14` }
                            : undefined
                        }
                      >
                        <span>{o.label}</span>
                        {active && <Check className="w-4 h-4 shrink-0" strokeWidth={3} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>,
          host,
        )}
    </>
  );
}

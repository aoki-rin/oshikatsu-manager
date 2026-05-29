import React from 'react';

interface PhoneFrameProps {
  children: React.ReactNode;
  oshiColorHex: string; // 兼容 App 调用，当前不使用
}

// 不再套假手机外壳（原生 + 浏览器预览都一样）：
// 居中的手机宽度列 + 全屏高度，无假边框/状态栏/工作台条。
// 手机上(宽度 < 480)自动铺满；桌面浏览器里居中成手机宽度，方便审 UI。
export function PhoneFrame({ children }: PhoneFrameProps) {
  return (
    <div className="min-h-screen w-full flex justify-center bg-slate-100">
      <div
        id="app-screen"
        className="w-full max-w-[480px] h-screen flex flex-col bg-slate-50 text-slate-900 overflow-hidden relative shadow-xl"
        style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {children}
      </div>
    </div>
  );
}

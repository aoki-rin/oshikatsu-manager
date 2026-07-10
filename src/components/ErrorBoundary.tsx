import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

// 本项目未装 @types/react（react 模块类型整体为 any，函数组件不受影响），
// class 继承需要成员类型 → 给 Component 断言一个最小类型面。运行时仍是真 React.Component
// （错误边界必须以它为基类，React 才认 getDerivedStateFromError）。
const TypedComponent = Component as unknown as new (props: ErrorBoundaryProps) => {
  props: ErrorBoundaryProps;
  state: ErrorBoundaryState;
};

// 顶层渲染兜底：任何组件抛异常时不再白屏，给出双语提示 + 重启按钮 + 错误摘要
// （分发给他人后，白屏 = 无法自救也无法报告；这页至少能截图发回来）。
// 刻意放在 I18nProvider 外层，Provider 自身崩溃也能兜住 → 文案双语硬编码，不走 t()。
export class ErrorBoundary extends TypedComponent {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // 本地日志足矣（自用/小范围分发，不接崩溃上报服务）
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        id="error-boundary-fallback"
        style={{
          minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 16, padding: 24, background: '#0f172a', color: '#f1f5f9',
          fontFamily: 'sans-serif', textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 40 }}>⚠️</div>
        <h1 style={{ fontSize: 16, fontWeight: 700 }}>出错了 / エラーが発生しました</h1>
        <p style={{ fontSize: 12, color: '#94a3b8', maxWidth: 300, wordBreak: 'break-all' }}>
          {this.state.error.message || String(this.state.error)}
        </p>
        <button
          id="btn-error-reload"
          onClick={() => window.location.reload()}
          style={{
            fontSize: 14, fontWeight: 700, padding: '10px 28px', borderRadius: 12,
            border: 'none', background: '#ec4899', color: '#fff',
          }}
        >
          重新启动 / 再起動
        </button>
        <p style={{ fontSize: 10, color: '#64748b' }}>
          若反复出现，请截图此页并反馈 / 繰り返す場合はこの画面を報告してください
        </p>
      </div>
    );
  }
}

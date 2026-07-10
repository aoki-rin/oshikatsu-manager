// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from '../../src/components/ErrorBoundary';

afterEach(cleanup);

function Bomb(): never {
  throw new Error('boom-from-render');
}

describe('ErrorBoundary（分发兜底）', () => {
  it('子组件抛异常 → 渲染双语兜底页含错误摘要与重启按钮', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {}); // React 噪音静音
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    const { container } = render(<ErrorBoundary><Bomb /></ErrorBoundary>);

    const fallback = container.querySelector('#error-boundary-fallback');
    expect(fallback).not.toBeNull();
    expect(fallback?.textContent).toContain('boom-from-render');
    expect(fallback?.textContent).toContain('エラー');
    fireEvent.click(container.querySelector('#btn-error-reload') as HTMLButtonElement);
    vi.unstubAllGlobals();
  });

  it('正常子组件原样渲染，不出兜底', () => {
    const { container, getByText } = render(<ErrorBoundary><p>ok</p></ErrorBoundary>);
    expect(getByText('ok')).toBeTruthy();
    expect(container.querySelector('#error-boundary-fallback')).toBeNull();
  });
});

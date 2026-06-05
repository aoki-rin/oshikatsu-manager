// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { renderWithI18n, fireEvent, cleanup } from './_helpers';
import { SettingsView } from '../../src/components/SettingsView';

afterEach(cleanup);

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    currentOshiColorId: 'pink',
    onSelectOshiColor: vi.fn(),
    onResetDatabase: vi.fn(),
    oshiColorHex: '#ec4899',
    locale: 'zh-CN',
    localeMode: 'system',
    onSelectLocaleMode: vi.fn(),
    ...overrides,
  };
}

const render = (props: ReturnType<typeof makeProps>) =>
  renderWithI18n(<SettingsView {...(props as unknown as ComponentProps<typeof SettingsView>)} />);

describe('SettingsView', () => {
  it('选应援色 → onSelectOshiColor(colorId)', () => {
    const props = makeProps();
    const { container } = render(props);
    const btn = container.querySelector('#color-btn-blue') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    fireEvent.click(btn);
    expect(props.onSelectOshiColor).toHaveBeenCalledWith('blue');
  });

  it('重置库：确认后调用 onResetDatabase', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.spyOn(window, 'alert').mockImplementation(() => {});
    const props = makeProps();
    const { container } = render(props);
    fireEvent.click(container.querySelector('#btn-reset-db') as HTMLButtonElement);
    expect(props.onResetDatabase).toHaveBeenCalled();
  });

  it('重置库：取消则不调用', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const props = makeProps();
    const { container } = render(props);
    fireEvent.click(container.querySelector('#btn-reset-db') as HTMLButtonElement);
    expect(props.onResetDatabase).not.toHaveBeenCalled();
  });

  it('切换语言 → onSelectLocaleMode', () => {
    const props = makeProps();
    const { container } = render(props);
    // 语言选项是 settings 内唯一无 id 的按钮组（颜色按钮有 #color-btn-*，重置有 #btn-reset-db）。
    const langButtons = [...container.querySelectorAll('button')].filter((b) => !b.id);
    expect(langButtons.length).toBeGreaterThanOrEqual(3);
    fireEvent.click(langButtons[1]); // zh-CN
    expect(props.onSelectLocaleMode).toHaveBeenCalled();
  });
});

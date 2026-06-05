// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import type { ComponentProps } from 'react';
import { renderWithI18n, fireEvent, cleanup } from './_helpers';
import type { ExtensionSource } from '../../src/types';
import { ExtensionView } from '../../src/components/ExtensionView';

afterEach(cleanup);

const ext = (o: Partial<ExtensionSource> = {}): ExtensionSource => ({
  id: 'ext-eplus', name: 'eplus', platform: 'eplus', version: '1.0', author: 'test',
  isEnabled: true, isInstalled: true, rating: 5, iconType: 'eplus', description: 'eplus source', ...o,
});

function makeProps(overrides: Record<string, unknown> = {}) {
  return {
    extensions: [ext()],
    onToggleExtension: vi.fn(),
    sourceStats: {},
    oshiColor: '#ec4899',
    ...overrides,
  };
}

const render = (props: ReturnType<typeof makeProps>) =>
  renderWithI18n(<ExtensionView {...(props as unknown as ComponentProps<typeof ExtensionView>)} />);

describe('ExtensionView', () => {
  it('渲染已安装的源', () => {
    const { container } = render(makeProps());
    expect(container.querySelector('#ext-installed-ext-eplus')).not.toBeNull();
  });

  it('点开关 → onToggleExtension(id)', () => {
    const props = makeProps();
    const { container } = render(props);
    fireEvent.click(container.querySelector('#toggle-ext-eplus') as HTMLButtonElement);
    expect(props.onToggleExtension).toHaveBeenCalledWith('ext-eplus');
  });

  it('带 sourceStats 时正常渲染（覆盖抓取状态分支）', () => {
    const props = makeProps({
      sourceStats: { eplus: { lastFetchedAt: '2030-01-01T00:00:00Z', count: 5, status: 'ok' } },
    });
    const { container } = render(props);
    expect(container.querySelector('#ext-installed-ext-eplus')).not.toBeNull();
  });
});

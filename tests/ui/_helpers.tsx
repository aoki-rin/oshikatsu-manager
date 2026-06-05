import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../src/i18n/I18nProvider';

export * from '@testing-library/react';
export { makeEvent, makeWindow } from '../_fixtures';

// 组件测试统一用 I18nProvider 包裹（同步翻译，无需等待）。
export function renderWithI18n(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

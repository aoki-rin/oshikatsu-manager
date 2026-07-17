// @vitest-environment jsdom
// #76：切换界面语言必须同步 <html lang>，否则 iOS VoiceOver 仍按 index.html 的
// lang="ja" 朗读中文。核心逻辑在 I18nProvider 的 useEffect。
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { I18nProvider, useI18n } from '../../src/i18n/I18nProvider';

afterEach(cleanup);

function LangProbe() {
  const { setLocaleMode } = useI18n();
  return (
    <div>
      <button onClick={() => setLocaleMode('zh-CN')}>zh</button>
      <button onClick={() => setLocaleMode('ja-JP')}>ja</button>
    </div>
  );
}

describe('I18nProvider 同步 <html lang> (#76)', () => {
  it('切换 locale 时更新 document.documentElement.lang', () => {
    const { getByText } = render(<I18nProvider><LangProbe /></I18nProvider>);

    fireEvent.click(getByText('zh'));
    expect(document.documentElement.lang).toBe('zh-CN');

    fireEvent.click(getByText('ja'));
    expect(document.documentElement.lang).toBe('ja-JP');
  });
});

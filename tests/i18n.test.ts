import { describe, it } from 'vitest';
import assert from 'node:assert/strict';
import {
  createTranslator,
  normalizeLocaleMode,
  resolveLocale,
} from '../src/i18n/core';

describe('i18n locale resolution', () => {
  it('uses ja-JP when system languages prefer Japanese', () => {
    assert.equal(resolveLocale('system', ['ja-JP', 'zh-CN']), 'ja-JP');
    assert.equal(resolveLocale('system', ['ja', 'en-US']), 'ja-JP');
  });

  it('uses zh-CN for Chinese system languages and unknown fallbacks', () => {
    assert.equal(resolveLocale('system', ['zh-TW', 'ja-JP']), 'zh-CN');
    assert.equal(resolveLocale('system', ['en-US']), 'zh-CN');
  });

  it('keeps explicit user locale choices over system languages', () => {
    assert.equal(resolveLocale('zh-CN', ['ja-JP']), 'zh-CN');
    assert.equal(resolveLocale('ja-JP', ['zh-CN']), 'ja-JP');
  });

  it('normalizes bad persisted values to system mode', () => {
    assert.equal(normalizeLocaleMode(null), 'system');
    assert.equal(normalizeLocaleMode(''), 'system');
    assert.equal(normalizeLocaleMode('fr-FR'), 'system');
  });
});

describe('i18n translator', () => {
  it('returns Japanese strings with interpolation', () => {
    const t = createTranslator('ja-JP');
    assert.equal(t('discover.resultsTitle', { count: 8 }), 'リアルタイム検索結果（8件）');
    assert.equal(t('settings.language.optionJapanese'), '日本語');
  });

  it('falls back to Chinese when a key is missing in the active locale', () => {
    const t = createTranslator('ja-JP', {
      'zh-CN': { known: '中文 {value}' },
      'ja-JP': {},
    });
    assert.equal(t('known', { value: 'fallback' }), '中文 fallback');
  });
});

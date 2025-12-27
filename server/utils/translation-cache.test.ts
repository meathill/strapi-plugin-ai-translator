import test from 'node:test';
import assert from 'node:assert/strict';

import { buildTranslationCacheHash } from './translation-cache.ts';

test('buildTranslationCacheHash：相同输入应生成相同 hash', () => {
  const a = buildTranslationCacheHash({
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    prompt: '请用正式语气',
    text: 'Hello world',
  });

  const b = buildTranslationCacheHash({
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    prompt: '请用正式语气',
    text: 'Hello world',
  });

  assert.equal(a, b);
});

test('buildTranslationCacheHash：model / endpoint 变化应影响 hash（避免跨配置复用）', () => {
  const base = buildTranslationCacheHash({
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: 'https://api.openai.com/v1',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    prompt: 'tone=formal',
    text: 'Hello world',
  });

  const changedModel = buildTranslationCacheHash({
    provider: 'openai',
    model: 'gpt-4.1-mini',
    endpoint: 'https://api.openai.com/v1',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    prompt: 'tone=formal',
    text: 'Hello world',
  });

  const changedEndpoint = buildTranslationCacheHash({
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: 'https://example.com/v1',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    prompt: 'tone=formal',
    text: 'Hello world',
  });

  assert.notEqual(base, changedModel);
  assert.notEqual(base, changedEndpoint);
});

test('buildTranslationCacheHash：prompt 会做 trim（避免无意义空白导致 cache miss）', () => {
  const a = buildTranslationCacheHash({
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: '',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    prompt: '  keep markdown  ',
    text: 'Hello world',
  });

  const b = buildTranslationCacheHash({
    provider: 'openai',
    model: 'gpt-4o-mini',
    endpoint: '',
    sourceLocale: 'en',
    targetLocale: 'zh-CN',
    prompt: 'keep markdown',
    text: 'Hello world',
  });

  assert.equal(a, b);
});

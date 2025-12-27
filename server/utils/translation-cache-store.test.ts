import test from 'node:test';
import assert from 'node:assert/strict';

import type { Core } from '@strapi/strapi';

import { clearTranslationCache, getCachedTranslations, setCachedTranslations } from './translation-cache.ts';

type StoreValueMap = Map<string, unknown>;

type FakeStore = {
  get: (options: Record<string, unknown>) => Promise<unknown>;
  set: (options: { value: unknown }) => Promise<void>;
};

type FakeStrapi = {
  store: (options: { type: string; name: string; key: string }) => FakeStore;
};

function createFakeStrapi() {
  const values: StoreValueMap = new Map();

  function store(options: { type: string; name: string; key: string }): FakeStore {
    const storeKey = `${options.type}:${options.name}:${options.key}`;

    async function get() {
      return values.get(storeKey);
    }

    async function set(payload: { value: unknown }) {
      values.set(storeKey, payload.value);
    }

    return { get, set };
  }

  const strapi = { store } satisfies FakeStrapi;

  return { strapi, values };
}

test('setCachedTranslations：应按桶写入并合并已有内容', async () => {
  const { strapi } = createFakeStrapi();
  const typedStrapi = strapi as unknown as Core.Strapi;

  const existingHash = `aa${'0'.repeat(62)}`;
  const nextHashSameBucket = `aa${'1'.repeat(62)}`;
  const otherBucketHash = `bb${'2'.repeat(62)}`;

  await typedStrapi
    .store({ type: 'plugin', name: 'ai-translate', key: 'translation-cache:v2:aa' })
    .set({ value: { [existingHash]: 'existing' } });

  await setCachedTranslations({
    strapi: typedStrapi,
    entries: [
      { hash: nextHashSameBucket, translation: 'next' },
      { hash: otherBucketHash, translation: 'other' },
    ],
  });

  const bucketAa = await typedStrapi
    .store({ type: 'plugin', name: 'ai-translate', key: 'translation-cache:v2:aa' })
    .get({});
  const bucketBb = await typedStrapi
    .store({ type: 'plugin', name: 'ai-translate', key: 'translation-cache:v2:bb' })
    .get({});

  assert.deepEqual(bucketAa, {
    [existingHash]: 'existing',
    [nextHashSameBucket]: 'next',
  });
  assert.deepEqual(bucketBb, {
    [otherBucketHash]: 'other',
  });
});

test('getCachedTranslations：应只返回命中的 hash，并可跨桶读取', async () => {
  const { strapi } = createFakeStrapi();
  const typedStrapi = strapi as unknown as Core.Strapi;

  const hashA = `aa${'a'.repeat(62)}`;
  const hashB = `bb${'b'.repeat(62)}`;

  await setCachedTranslations({
    strapi: typedStrapi,
    entries: [
      { hash: hashA, translation: 'A' },
      { hash: hashB, translation: 'B' },
    ],
  });

  const result = await getCachedTranslations({
    strapi: typedStrapi,
    hashes: [hashA, hashB, `cc${'c'.repeat(62)}`],
  });

  assert.deepEqual(result, {
    [hashA]: 'A',
    [hashB]: 'B',
  });
});

test('setCachedTranslations：应忽略无效条目（空 hash / 空翻译）', async () => {
  const { strapi } = createFakeStrapi();
  const typedStrapi = strapi as unknown as Core.Strapi;

  const validHash = `aa${'9'.repeat(62)}`;

  await setCachedTranslations({
    strapi: typedStrapi,
    entries: [
      { hash: '', translation: 'bad' },
      { hash: 'a', translation: 'bad' },
      { hash: validHash, translation: '' },
      { hash: validHash, translation: 'ok' },
    ],
  });

  const result = await getCachedTranslations({
    strapi: typedStrapi,
    hashes: [validHash],
  });

  assert.deepEqual(result, {
    [validHash]: 'ok',
  });
});

test('clearTranslationCache：应清空已存在的桶，但不创建新的空桶', async () => {
  const { strapi, values } = createFakeStrapi();
  const typedStrapi = strapi as unknown as Core.Strapi;

  const hashA = `aa${'a'.repeat(62)}`;
  const hashB = `bb${'b'.repeat(62)}`;

  await setCachedTranslations({
    strapi: typedStrapi,
    entries: [
      { hash: hashA, translation: 'A' },
      { hash: hashB, translation: 'B' },
    ],
  });

  const beforeKeys = Array.from(values.keys());
  assert.equal(beforeKeys.length > 0, true);

  const result = await clearTranslationCache({ strapi: typedStrapi });
  assert.equal(result.clearedBuckets, 2);
  assert.equal(result.clearedVersions >= 1, true);

  const after = await getCachedTranslations({
    strapi: typedStrapi,
    hashes: [hashA, hashB],
  });
  assert.deepEqual(after, {});

  const afterKeys = Array.from(values.keys());
  assert.deepEqual(afterKeys.sort(), beforeKeys.sort());
});

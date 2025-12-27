import { createHash } from 'node:crypto';

import type { Core } from '@strapi/strapi';

import { isPlainObject } from './segments.ts';

const CACHE_VERSION = 2;

type CacheBucketValue = Record<string, string>;

type CacheStore = {
  get: (options: Record<string, unknown>) => Promise<unknown>;
  set: (options: { value: unknown }) => Promise<void>;
};

function getCacheBucketKey(hash: string): string {
  return hash.slice(0, 2);
}

function createCacheBucketStore(strapi: Core.Strapi, bucket: string): CacheStore {
  return strapi.store({
    type: 'plugin',
    name: 'ai-translate',
    key: `translation-cache:v${CACHE_VERSION}:${bucket}`,
  }) as unknown as CacheStore;
}

function createCacheBucketStoreForVersion(strapi: Core.Strapi, version: number, bucket: string): CacheStore {
  return strapi.store({
    type: 'plugin',
    name: 'ai-translate',
    key: `translation-cache:v${version}:${bucket}`,
  }) as unknown as CacheStore;
}

function normalizeCacheBucketValue(raw: unknown): CacheBucketValue {
  if (!isPlainObject(raw)) {
    return {};
  }

  const result: CacheBucketValue = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === 'string' && value.length > 0) {
      result[key] = value;
    }
  }
  return result;
}

function getAllBucketKeys(): string[] {
  const buckets: string[] = [];
  for (let i = 0; i < 256; i += 1) {
    buckets.push(i.toString(16).padStart(2, '0'));
  }
  return buckets;
}

export function buildTranslationCacheHash(params: {
  provider: string;
  model?: string;
  endpoint?: string;
  sourceLocale: string;
  targetLocale: string;
  prompt?: string;
  text: string;
}): string {
  const normalizedPrompt = (params.prompt ?? '').trim();
  const normalizedModel = (params.model ?? '').trim();
  const normalizedEndpoint = (params.endpoint ?? '').trim();

  const input = JSON.stringify({
    v: CACHE_VERSION,
    provider: params.provider,
    model: normalizedModel,
    endpoint: normalizedEndpoint,
    sourceLocale: params.sourceLocale,
    targetLocale: params.targetLocale,
    prompt: normalizedPrompt,
    text: params.text,
  });

  return createHash('sha256').update(input).digest('hex');
}

export async function getCachedTranslations(params: {
  strapi: Core.Strapi;
  hashes: string[];
}): Promise<Record<string, string>> {
  const { strapi, hashes } = params;

  const uniqueHashes = Array.from(new Set(hashes)).filter((h) => typeof h === 'string' && h.length >= 2);
  if (uniqueHashes.length === 0) {
    return {};
  }

  const hashesByBucket = new Map<string, string[]>();
  for (const hash of uniqueHashes) {
    const bucket = getCacheBucketKey(hash);
    const existing = hashesByBucket.get(bucket);
    if (existing) {
      existing.push(hash);
    } else {
      hashesByBucket.set(bucket, [hash]);
    }
  }

  const buckets = Array.from(hashesByBucket.entries());
  const bucketValues = await Promise.all(
    buckets.map(async ([bucket]) => {
      const store = createCacheBucketStore(strapi, bucket);
      const raw = await store.get({});
      return normalizeCacheBucketValue(raw);
    }),
  );

  const result: Record<string, string> = {};
  buckets.forEach(([bucket, bucketHashes], index) => {
    const bucketValue = bucketValues[index];
    bucketHashes.forEach((hash) => {
      const cached = bucketValue[hash];
      if (typeof cached === 'string') {
        result[hash] = cached;
      }
    });
  });

  return result;
}

export async function setCachedTranslations(params: {
  strapi: Core.Strapi;
  entries: Array<{ hash: string; translation: string }>;
}): Promise<void> {
  const { strapi, entries } = params;

  const validEntries = entries.filter(
    (e) => typeof e.hash === 'string' && e.hash.length >= 2 && typeof e.translation === 'string',
  );
  if (validEntries.length === 0) {
    return;
  }

  const entriesByBucket = new Map<string, Array<{ hash: string; translation: string }>>();
  for (const entry of validEntries) {
    const bucket = getCacheBucketKey(entry.hash);
    const existing = entriesByBucket.get(bucket);
    if (existing) {
      existing.push(entry);
    } else {
      entriesByBucket.set(bucket, [entry]);
    }
  }

  const buckets = Array.from(entriesByBucket.entries());

  await Promise.all(
    buckets.map(async ([bucket, bucketEntries]) => {
      const store = createCacheBucketStore(strapi, bucket);
      const raw = await store.get({});
      const current = normalizeCacheBucketValue(raw);

      const next: CacheBucketValue = { ...current };
      bucketEntries.forEach((entry) => {
        next[entry.hash] = entry.translation;
      });

      await store.set({ value: next });
    }),
  );
}

export async function clearTranslationCache(params: {
  strapi: Core.Strapi;
  includePreviousVersions?: boolean;
}): Promise<{ clearedBuckets: number; clearedVersions: number }> {
  const { strapi, includePreviousVersions } = params;
  const shouldIncludePreviousVersions = includePreviousVersions !== false;

  const versions = shouldIncludePreviousVersions
    ? Array.from({ length: CACHE_VERSION }, (_, index) => index + 1)
    : [CACHE_VERSION];

  const buckets = getAllBucketKeys();

  const clearedBucketsByVersion = await Promise.all(
    versions.map(async (version) => {
      const perVersionValues = await Promise.all(
        buckets.map(async (bucket) => {
          const store = createCacheBucketStoreForVersion(strapi, version, bucket);
          const raw = await store.get({});
          const current = normalizeCacheBucketValue(raw);
          return { store, hasValue: Object.keys(current).length > 0 };
        }),
      );

      const storesToClear = perVersionValues.filter((item) => item.hasValue);

      await Promise.all(
        storesToClear.map(async ({ store }) => {
          await store.set({ value: {} });
        }),
      );

      return storesToClear.length;
    }),
  );

  const clearedBuckets = clearedBucketsByVersion.reduce((sum, value) => sum + value, 0);

  return {
    clearedBuckets,
    clearedVersions: versions.length,
  };
}

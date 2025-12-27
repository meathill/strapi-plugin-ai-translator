import { Core } from '@strapi/strapi';

import type { AiTranslateProvider, AiTranslateSettings } from '../services/settings';
import { clearTranslationCache } from '../utils/translation-cache';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeProvider(value: unknown): AiTranslateProvider | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === 'openai' || trimmed === 'replicate' ? trimmed : undefined;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function resolveEffectiveValue(
  envValue: string | undefined,
  storedValue: string | undefined,
  configValue: string | undefined,
  fallback: string | undefined,
): { value: string | undefined; source: 'env' | 'settings' | 'config' | 'default' } {
  if (envValue) {
    return { value: envValue, source: 'env' };
  }
  if (storedValue) {
    return { value: storedValue, source: 'settings' };
  }
  if (configValue) {
    return { value: configValue, source: 'config' };
  }
  return { value: fallback, source: 'default' };
}

function getSecretLength(value: string | undefined): number {
  if (typeof value !== 'string') {
    return 0;
  }
  return value.trim().length;
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getSettings(ctx) {
    const stored = (await strapi.plugin('ai-translate').service('settings').getSettings()) as AiTranslateSettings;

    const config = (strapi.config.get('plugin::ai-translate') as AiTranslateSettings | undefined) ?? {};

    const envProvider = normalizeProvider(process.env.AI_TRANSLATE_PROVIDER);

    const envApiKey = process.env.AI_TRANSLATE_API_KEY;
    const envApiUrl = process.env.AI_TRANSLATE_API_URL;
    const envModel = process.env.AI_TRANSLATE_MODEL;

    const envReplicateApiToken = process.env.AI_TRANSLATE_REPLICATE_API_TOKEN;
    const envReplicateModel = process.env.AI_TRANSLATE_REPLICATE_MODEL;

    const effectiveProvider = resolveEffectiveValue(
      envProvider,
      stored.provider,
      normalizeProvider(config.provider),
      'openai',
    );

    const effectiveApiUrl = resolveEffectiveValue(envApiUrl, stored.apiUrl, config.apiUrl, undefined);
    const effectiveModel = resolveEffectiveValue(envModel, stored.model, config.model, 'gpt-4o-mini');
    const effectiveApiKey = resolveEffectiveValue(envApiKey, stored.apiKey, config.apiKey, undefined);

    const effectiveReplicateModel = resolveEffectiveValue(
      envReplicateModel,
      stored.replicateModel,
      config.replicateModel,
      '',
    );

    const effectiveReplicateApiToken = resolveEffectiveValue(
      envReplicateApiToken,
      stored.replicateApiToken,
      config.replicateApiToken,
      undefined,
    );

    ctx.body = {
      stored: {
        provider: stored.provider ?? 'openai',
        openai: {
          apiUrl: stored.apiUrl ?? '',
          model: stored.model ?? '',
          apiKeySet: Boolean(stored.apiKey),
          apiKeyLength: getSecretLength(stored.apiKey),
        },
        replicate: {
          model: stored.replicateModel ?? '',
          apiTokenSet: Boolean(stored.replicateApiToken),
          apiTokenLength: getSecretLength(stored.replicateApiToken),
        },
      },
      env: {
        providerSet: Boolean(envProvider),
        openai: {
          apiKeySet: Boolean(envApiKey),
          apiUrlSet: Boolean(envApiUrl),
          modelSet: Boolean(envModel),
        },
        replicate: {
          apiTokenSet: Boolean(envReplicateApiToken),
          modelSet: Boolean(envReplicateModel),
        },
      },
      effective: {
        provider: (effectiveProvider.value ?? 'openai') as AiTranslateProvider,
        providerSource: effectiveProvider.source,
        openai: {
          apiUrl: effectiveApiUrl.value ?? '',
          apiUrlSource: effectiveApiUrl.source,
          model: effectiveModel.value ?? 'gpt-4o-mini',
          modelSource: effectiveModel.source,
          apiKeySet: Boolean(effectiveApiKey.value),
          apiKeyLength: getSecretLength(effectiveApiKey.value),
          apiKeySource: effectiveApiKey.source,
        },
        replicate: {
          model: effectiveReplicateModel.value ?? '',
          modelSource: effectiveReplicateModel.source,
          apiTokenSet: Boolean(effectiveReplicateApiToken.value),
          apiTokenLength: getSecretLength(effectiveReplicateApiToken.value),
          apiTokenSource: effectiveReplicateApiToken.source,
        },
      },
    };
  },

  async updateSettings(ctx) {
    const body = ctx.request.body as unknown;
    if (!isRecord(body)) {
      ctx.throw(400, '请求体必须是 JSON 对象');
      return;
    }

    const current = (await strapi.plugin('ai-translate').service('settings').getSettings()) as AiTranslateSettings;

    const next: AiTranslateSettings = { ...current };

    if (hasOwn(body, 'provider')) {
      const provider = normalizeProvider(body.provider);
      if (!provider) {
        ctx.throw(400, 'provider 必须是 openai 或 replicate');
        return;
      }
      next.provider = provider;
    }

    if (hasOwn(body, 'apiUrl')) {
      const normalized = normalizeString(body.apiUrl);
      next.apiUrl = normalized;
    }

    if (hasOwn(body, 'model')) {
      const normalized = normalizeString(body.model);
      next.model = normalized;
    }

    if (hasOwn(body, 'apiKey')) {
      const normalized = normalizeString(body.apiKey);
      next.apiKey = normalized;
    }

    if (hasOwn(body, 'replicateModel')) {
      const normalized = normalizeString(body.replicateModel);
      next.replicateModel = normalized;
    }

    if (hasOwn(body, 'replicateApiToken')) {
      const normalized = normalizeString(body.replicateApiToken);
      next.replicateApiToken = normalized;
    }

    await strapi.plugin('ai-translate').service('settings').setSettings(next);

    ctx.body = {
      provider: next.provider ?? 'openai',
      openai: {
        apiUrl: next.apiUrl ?? '',
        model: next.model ?? '',
        apiKeySet: Boolean(next.apiKey),
        apiKeyLength: getSecretLength(next.apiKey),
      },
      replicate: {
        model: next.replicateModel ?? '',
        apiTokenSet: Boolean(next.replicateApiToken),
        apiTokenLength: getSecretLength(next.replicateApiToken),
      },
    };
  },

  async clearTranslationCache(ctx) {
    const body = ctx.request.body as unknown;
    const includePreviousVersions =
      isRecord(body) && typeof body.includePreviousVersions === 'boolean' ? body.includePreviousVersions : true;

    const result = await clearTranslationCache({
      strapi,
      includePreviousVersions,
    });

    ctx.body = {
      ok: true,
      ...result,
    };
  },
});

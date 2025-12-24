import { Core } from '@strapi/strapi';

import type { AiTranslateSettings } from '../services/settings';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function maskApiKey(value: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return '';
  }
  if (trimmed.length <= 8) {
    return '********';
  }
  const prefix = trimmed.slice(0, 3);
  const suffix = trimmed.slice(-4);
  return `${prefix}********${suffix}`;
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function hasOwn(obj: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(obj, key);
}

function resolveEffectiveValue(
  envValue: string | undefined,
  storedValue: string | undefined,
  configValue: string | undefined,
  fallback: string | undefined
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

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async getSettings(ctx) {
    const stored = (await strapi
      .plugin('ai-translate')
      .service('settings')
      .getSettings()) as AiTranslateSettings;

    const config = (strapi.config.get('plugin::ai-translate') as AiTranslateSettings | undefined) ?? {};

    const envApiKey = process.env.AI_TRANSLATE_API_KEY;
    const envApiUrl = process.env.AI_TRANSLATE_API_URL;
    const envModel = process.env.AI_TRANSLATE_MODEL;

    const effectiveApiUrl = resolveEffectiveValue(envApiUrl, stored.apiUrl, config.apiUrl, undefined);
    const effectiveModel = resolveEffectiveValue(envModel, stored.model, config.model, 'gpt-4o-mini');
    const effectiveApiKey = resolveEffectiveValue(envApiKey, stored.apiKey, config.apiKey, undefined);

    ctx.body = {
      stored: {
        apiUrl: stored.apiUrl ?? '',
        model: stored.model ?? '',
        apiKeyMasked: stored.apiKey ? maskApiKey(stored.apiKey) : '',
        apiKeySet: Boolean(stored.apiKey),
      },
      env: {
        apiKeySet: Boolean(envApiKey),
        apiUrlSet: Boolean(envApiUrl),
        modelSet: Boolean(envModel),
      },
      effective: {
        apiUrl: effectiveApiUrl.value ?? '',
        apiUrlSource: effectiveApiUrl.source,
        model: effectiveModel.value ?? 'gpt-4o-mini',
        modelSource: effectiveModel.source,
        apiKeySet: Boolean(effectiveApiKey.value),
        apiKeySource: effectiveApiKey.source,
      },
    };
  },

  async updateSettings(ctx) {
    const body = ctx.request.body as unknown;
    if (!isRecord(body)) {
      ctx.throw(400, '请求体必须是 JSON 对象');
      return;
    }

    const current = (await strapi
      .plugin('ai-translate')
      .service('settings')
      .getSettings()) as AiTranslateSettings;

    const next: AiTranslateSettings = { ...current };

    if (hasOwn(body, 'apiUrl')) {
      const normalized = normalizeString(body.apiUrl);
      next.apiUrl = normalized;
    }

    if (hasOwn(body, 'model')) {
      const normalized = normalizeString(body.model);
      next.model = normalized;
    }

    if (hasOwn(body, 'apiKey')) {
      // 允许显式清空：传入空字符串会被标准化为 undefined
      const normalized = normalizeString(body.apiKey);
      next.apiKey = normalized;
    }

    await strapi.plugin('ai-translate').service('settings').setSettings(next);

    ctx.body = {
      apiUrl: next.apiUrl ?? '',
      model: next.model ?? '',
      apiKeySet: Boolean(next.apiKey),
    };
  },
});

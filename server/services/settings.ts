import { Core } from '@strapi/strapi';

export type AiTranslateProvider = 'openai' | 'replicate';

export type AiTranslateSettings = {
  provider?: AiTranslateProvider;

  // OpenAI-compatible
  apiKey?: string;
  apiUrl?: string;
  model?: string;

  // Replicate
  replicateApiToken?: string;
  replicateModel?: string;
};

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
  const normalized = value.trim();
  if (normalized === 'openai' || normalized === 'replicate') {
    return normalized;
  }
  return undefined;
}

function normalizeSettings(value: unknown): AiTranslateSettings {
  if (!isRecord(value)) {
    return {};
  }

  return {
    provider: normalizeProvider(value.provider),
    apiKey: normalizeString(value.apiKey),
    apiUrl: normalizeString(value.apiUrl),
    model: normalizeString(value.model),
    replicateApiToken: normalizeString(value.replicateApiToken),
    replicateModel: normalizeString(value.replicateModel),
  };
}

export default ({ strapi }: { strapi: Core.Strapi }) => {
  const store = strapi.store({
    type: 'plugin',
    name: 'ai-translate',
    key: 'settings',
  });

  async function getSettings(): Promise<AiTranslateSettings> {
    const raw = (await store.get({})) as unknown;
    return normalizeSettings(raw);
  }

  async function setSettings(value: AiTranslateSettings): Promise<void> {
    await store.set({
      value: normalizeSettings(value),
    });
  }

  return {
    getSettings,
    setSettings,
  };
};

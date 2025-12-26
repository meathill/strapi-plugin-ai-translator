import { Core } from '@strapi/strapi';
import OpenAI from 'openai';

import {
  applySegmentTranslations,
  collectTranslatableSegments,
  extractLocalizedTopLevelFields,
  extractTopLevelMediaFields,
  isPlainObject,
  stripComponentInstanceIds,
  type ComponentsDictionary,
  type Segment,
  type Schema,
} from '../utils/segments';

import type { AiTranslateProvider, AiTranslateSettings } from './settings';

type PluginConfig = AiTranslateSettings;

type TranslateDocumentInput = {
  uid: string;
  documentId: string;
  sourceLocale: string;
  targetLocale: string;
  customPrompt?: string;
  includeJson?: boolean;
};

type TranslateSegmentsResult = {
  translationsById: Record<string, string>;
};

type Prompts = {
  systemPrompt: string;
  userPrompt: string;
};

type ReplicateClient = {
  run: (model: string, params: { input: Record<string, unknown> }) => Promise<unknown>;
};

function buildPopulateQueryForSourceDocument(
  schema: Schema,
  components: ComponentsDictionary
): Record<string, unknown> {
  const visitedComponents = new Set<string>();

  function buildPopulateForSchema(currentSchema: Schema): Record<string, unknown> {
    const attributes = currentSchema.attributes ?? {};
    const populate: Record<string, unknown> = {};

    for (const [key, attribute] of Object.entries(attributes)) {
      if (attribute.type === 'media' || attribute.type === 'relation') {
        populate[key] = true;
        continue;
      }

      if (attribute.type === 'component') {
        const componentUid = attribute.component;
        const componentSchema = components[componentUid];
        if (!componentSchema) {
          populate[key] = { populate: '*' };
          continue;
        }
        if (visitedComponents.has(componentUid)) {
          populate[key] = { populate: '*' };
          continue;
        }

        visitedComponents.add(componentUid);
        const nestedPopulate = buildPopulateForSchema(componentSchema);
        visitedComponents.delete(componentUid);

        populate[key] = {
          populate: Object.keys(nestedPopulate).length > 0 ? nestedPopulate : '*',
        };
        continue;
      }

      if (attribute.type === 'dynamiczone') {
        const on: Record<string, unknown> = {};

        for (const componentUid of attribute.components) {
          const componentSchema = components[componentUid];
          if (!componentSchema) {
            on[componentUid] = { populate: '*' };
            continue;
          }
          if (visitedComponents.has(componentUid)) {
            on[componentUid] = { populate: '*' };
            continue;
          }

          visitedComponents.add(componentUid);
          const nestedPopulate = buildPopulateForSchema(componentSchema);
          visitedComponents.delete(componentUid);

          on[componentUid] = {
            populate: Object.keys(nestedPopulate).length > 0 ? nestedPopulate : '*',
          };
        }

        populate[key] = { on };
      }
    }

    return populate;
  }

  return buildPopulateForSchema(schema);
}

function normalizeProvider(value: unknown): AiTranslateProvider | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed === 'openai' || trimmed === 'replicate' ? trimmed : undefined;
}

function parseJsonFromModelOutput(raw: string): unknown {
  const text = raw.trim();
  if (text.length === 0) {
    throw new Error('AI 未返回任何内容');
  }

  try {
    return JSON.parse(text);
  } catch {
    const fenced =
      text.match(/```json\n([\s\S]*?)\n```/) ?? text.match(/```\n([\s\S]*?)\n```/);
    if (fenced?.[1]) {
      return JSON.parse(fenced[1]);
    }

    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace >= 0 && lastBrace > firstBrace) {
      const candidate = text.slice(firstBrace, lastBrace + 1);
      return JSON.parse(candidate);
    }

    throw new Error('无法解析 AI 返回的 JSON');
  }
}

function isUnsupportedResponseFormatError(error: unknown): boolean {
  if (!(error instanceof OpenAI.APIError)) {
    return false;
  }
  const message = String(error.message ?? '');
  if (error.status !== 400) {
    return false;
  }
  return message.includes('response_format') || message.includes('json_object') || message.includes('json');
}

async function getPluginConfig(strapi: Core.Strapi): Promise<PluginConfig> {
  const config = (strapi.config.get('plugin::ai-translate') as PluginConfig | undefined) ?? {};
  const stored = (await strapi.plugin('ai-translate').service('settings').getSettings()) as
    | PluginConfig
    | undefined;

  return {
    ...config,
    ...(stored ?? {}),
  };
}

function getProvider(config: PluginConfig): AiTranslateProvider {
  return normalizeProvider(process.env.AI_TRANSLATE_PROVIDER) ?? normalizeProvider(config.provider) ?? 'openai';
}

function createOpenAIClient(config: PluginConfig): OpenAI {
  const apiKey = process.env.AI_TRANSLATE_API_KEY || config.apiKey;
  const baseURL = process.env.AI_TRANSLATE_API_URL || config.apiUrl;

  if (!apiKey) {
    throw new Error('AI_TRANSLATE_API_KEY 未配置，请在环境变量或插件 Settings 中设置');
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

function getOpenAIModelName(config: PluginConfig): string {
  return process.env.AI_TRANSLATE_MODEL || config.model || 'gpt-4o-mini';
}

async function createReplicateClient(config: PluginConfig): Promise<{ replicate: ReplicateClient; model: string }> {
  const apiToken = process.env.AI_TRANSLATE_REPLICATE_API_TOKEN || config.replicateApiToken;
  const model = process.env.AI_TRANSLATE_REPLICATE_MODEL || config.replicateModel;

  if (!apiToken) {
    throw new Error('AI_TRANSLATE_REPLICATE_API_TOKEN 未配置，请在环境变量或插件 Settings 中设置');
  }

  if (!model) {
    throw new Error('AI_TRANSLATE_REPLICATE_MODEL 未配置，请在环境变量或插件 Settings 中设置');
  }

  let ReplicateConstructor: unknown;
  try {
    const mod = (await import('replicate')) as unknown as { default?: unknown };
    ReplicateConstructor = mod.default ?? mod;
  } catch {
    throw new Error('未安装 replicate SDK：请先安装 `replicate`（pnpm add replicate）后重启');
  }

  if (typeof ReplicateConstructor !== 'function') {
    throw new Error('replicate SDK 加载失败：构造器不可用');
  }

  const replicate = new (ReplicateConstructor as new (options: { auth: string }) => ReplicateClient)({
    auth: apiToken,
  });

  return { replicate, model };
}

function chunkSegments(segments: Segment[], maxSegments: number, maxChars: number): Segment[][] {
  const chunks: Segment[][] = [];
  let current: Segment[] = [];
  let currentChars = 0;

  for (const segment of segments) {
    const length = segment.text.length;
    const wouldOverflow =
      current.length >= maxSegments || (current.length > 0 && currentChars + length > maxChars);

    if (wouldOverflow) {
      chunks.push(current);
      current = [];
      currentChars = 0;
    }

    current.push(segment);
    currentChars += length;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function buildTranslationPrompts(params: {
  targetLocale: string;
  segments: Segment[];
  customPrompt?: string;
}): Prompts {
  const { targetLocale, segments, customPrompt } = params;

  const input = {
    segments: segments.map((s) => ({
      id: s.id,
      text: s.text,
    })),
  };

  const systemPrompt = [
    '你是专业翻译员。',
    `目标语言（locale）：${targetLocale}`,
    '要求：',
    '- 只翻译 segments[].text 的文本内容，不要改动 id。',
    '- 保留 Markdown/HTML 结构、URL、邮箱、代码块、占位符（如 {{variable}}、{0}、%s）。',
    '- 不要输出任何解释、不要输出 Markdown 代码块，只返回严格 JSON。',
    '返回格式：{"segments":[{"id":"0","text":"..."}]}',
  ].join('\n');

  const userPrompt = [
    customPrompt ? `额外要求：\n${customPrompt}\n` : '',
    '需要翻译的内容：',
    JSON.stringify(input),
  ]
    .filter(Boolean)
    .join('\n');

  return { systemPrompt, userPrompt };
}

async function translateSegmentsWithOpenAI(params: {
  openai: OpenAI;
  model: string;
  prompts: Prompts;
}): Promise<TranslateSegmentsResult> {
  const { openai, model, prompts } = params;

  async function createCompletion(useResponseFormat: boolean) {
    return openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: prompts.systemPrompt },
        { role: 'user', content: prompts.userPrompt },
      ],
      temperature: 0.2,
      ...(useResponseFormat ? { response_format: { type: 'json_object' } } : {}),
    });
  }

  let completion: Awaited<ReturnType<typeof createCompletion>>;

  try {
    completion = await createCompletion(true);
  } catch (error) {
    if (!isUnsupportedResponseFormatError(error)) {
      throw error;
    }
    completion = await createCompletion(false);
  }

  const content = completion.choices[0]?.message?.content?.trim() ?? '';
  const parsed = parseJsonFromModelOutput(content);

  if (!isPlainObject(parsed)) {
    throw new Error('AI 返回的内容不是 JSON 对象');
  }

  const parsedSegments = parsed.segments;
  if (!Array.isArray(parsedSegments)) {
    throw new Error('AI 返回的 JSON 缺少 segments 数组');
  }

  const translationsById: Record<string, string> = {};
  for (const item of parsedSegments) {
    if (!isPlainObject(item)) {
      continue;
    }
    const id = item.id;
    const text = item.text;
    if (typeof id !== 'string' || typeof text !== 'string') {
      continue;
    }
    translationsById[id] = text;
  }

  return { translationsById };
}

function normalizeReplicateOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  if (Array.isArray(output)) {
    return output.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('');
  }

  if (isPlainObject(output)) {
    const nested = output.output;
    if (typeof nested === 'string') {
      return nested;
    }
    if (Array.isArray(nested)) {
      return nested.map((part) => (typeof part === 'string' ? part : JSON.stringify(part))).join('');
    }
  }

  return JSON.stringify(output);
}

async function translateSegmentsWithReplicate(params: {
  replicate: ReplicateClient;
  model: string;
  prompts: Prompts;
}): Promise<TranslateSegmentsResult> {
  const { replicate, model, prompts } = params;

  const combinedPrompt = `${prompts.systemPrompt}\n\n${prompts.userPrompt}`;

  const output = await replicate.run(model, {
    input: {
      prompt: combinedPrompt,
      temperature: 0.2,
    },
  });

  const content = normalizeReplicateOutput(output).trim();
  const parsed = parseJsonFromModelOutput(content);

  if (!isPlainObject(parsed)) {
    throw new Error('AI 返回的内容不是 JSON 对象');
  }

  const parsedSegments = parsed.segments;
  if (!Array.isArray(parsedSegments)) {
    throw new Error('AI 返回的 JSON 缺少 segments 数组');
  }

  const translationsById: Record<string, string> = {};
  for (const item of parsedSegments) {
    if (!isPlainObject(item)) {
      continue;
    }
    const id = item.id;
    const text = item.text;
    if (typeof id !== 'string' || typeof text !== 'string') {
      continue;
    }
    translationsById[id] = text;
  }

  return { translationsById };
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  async translateDocument(input: TranslateDocumentInput) {
    const { uid, documentId, sourceLocale, targetLocale, customPrompt, includeJson } = input;

    if (!uid || !documentId || !sourceLocale || !targetLocale) {
      throw new Error('缺少参数：uid / documentId / sourceLocale / targetLocale');
    }

    if (sourceLocale === targetLocale) {
      throw new Error('sourceLocale 与 targetLocale 不能相同');
    }

    const pluginConfig = await getPluginConfig(strapi);
    const provider = getProvider(pluginConfig);

    const schema = strapi.contentType(uid) as Schema | undefined;
    if (!schema) {
      throw new Error(`找不到内容类型：${uid}`);
    }

    if (schema.pluginOptions?.i18n?.localized !== true) {
      throw new Error(`内容类型未启用 i18n：${uid}`);
    }

    const components = strapi.components as ComponentsDictionary;
    const populate = buildPopulateQueryForSourceDocument(schema, components);

    const sourceDocument = await strapi.documents(uid).findOne({
      documentId,
      locale: sourceLocale,
      populate,
    });

    if (!isPlainObject(sourceDocument)) {
      throw new Error('未找到源语言版本，或返回数据格式不正确');
    }

    const localizedData = extractLocalizedTopLevelFields(schema, sourceDocument);
    const topLevelMediaFields = extractTopLevelMediaFields(schema, sourceDocument);
    const segments = collectTranslatableSegments(schema, components, localizedData, {
      includeJson: includeJson === true,
    });

    if (segments.length === 0) {
      return {
        ...stripComponentInstanceIds(schema, components, localizedData),
        ...topLevelMediaFields,
      };
    }

    const chunks = chunkSegments(segments, 50, 5000);
    const translationsById: Record<string, string> = {};

    if (provider === 'openai') {
      const openai = createOpenAIClient(pluginConfig);
      const model = getOpenAIModelName(pluginConfig);

      for (const chunk of chunks) {
        const prompts = buildTranslationPrompts({
          targetLocale,
          segments: chunk,
          customPrompt,
        });

        const result = await translateSegmentsWithOpenAI({
          openai,
          model,
          prompts,
        });

        Object.assign(translationsById, result.translationsById);
      }

      const translated = applySegmentTranslations(localizedData, segments, translationsById);
      return {
        ...stripComponentInstanceIds(schema, components, translated),
        ...topLevelMediaFields,
      };
    }

    const { replicate, model } = await createReplicateClient(pluginConfig);

    for (const chunk of chunks) {
      const prompts = buildTranslationPrompts({
        targetLocale,
        segments: chunk,
        customPrompt,
      });

      const result = await translateSegmentsWithReplicate({
        replicate,
        model,
        prompts,
      });

      Object.assign(translationsById, result.translationsById);
    }

    const translated = applySegmentTranslations(localizedData, segments, translationsById);
    return {
      ...stripComponentInstanceIds(schema, components, translated),
      ...topLevelMediaFields,
    };
  },
});

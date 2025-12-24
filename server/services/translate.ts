import { Core } from '@strapi/strapi';
import OpenAI from 'openai';

import {
  applySegmentTranslations,
  collectTranslatableSegments,
  extractLocalizedTopLevelFields,
  isPlainObject,
  type ComponentsDictionary,
  type Segment,
  type Schema,
} from '../utils/segments';

type PluginConfig = {
  apiKey?: string;
  apiUrl?: string;
  model?: string;
};

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

function createOpenAIClient(config: PluginConfig): OpenAI {
  const apiKey = process.env.AI_TRANSLATE_API_KEY || config.apiKey;
  const baseURL = process.env.AI_TRANSLATE_API_URL || config.apiUrl;

  if (!apiKey) {
    throw new Error('AI_TRANSLATE_API_KEY 未配置，请在环境变量或插件配置中设置');
  }

  return new OpenAI({
    apiKey,
    baseURL,
  });
}

function getModelName(config: PluginConfig): string {
  return process.env.AI_TRANSLATE_MODEL || config.model || 'gpt-4o-mini';
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

async function translateSegmentsWithAI(params: {
  openai: OpenAI;
  model: string;
  targetLocale: string;
  segments: Segment[];
  customPrompt?: string;
}): Promise<TranslateSegmentsResult> {
  const { openai, model, targetLocale, segments, customPrompt } = params;

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

  async function createCompletion(useResponseFormat: boolean) {
    return openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
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
    const openai = createOpenAIClient(pluginConfig);
    const model = getModelName(pluginConfig);

    const schema = strapi.contentType(uid) as Schema | undefined;
    if (!schema) {
      throw new Error(`找不到内容类型：${uid}`);
    }

    if (schema.pluginOptions?.i18n?.localized !== true) {
      throw new Error(`内容类型未启用 i18n：${uid}`);
    }

    const sourceDocument = await strapi.documents(uid).findOne({
      documentId,
      locale: sourceLocale,
      populate: '*',
    });

    if (!isPlainObject(sourceDocument)) {
      throw new Error('未找到源语言版本，或返回数据格式不正确');
    }

    const localizedData = extractLocalizedTopLevelFields(schema, sourceDocument);
    const components = strapi.components as ComponentsDictionary;
    const segments = collectTranslatableSegments(schema, components, localizedData, {
      includeJson: includeJson === true,
    });

    if (segments.length === 0) {
      return localizedData;
    }

    const chunks = chunkSegments(segments, 50, 12000);
    const translationsById: Record<string, string> = {};

    for (const chunk of chunks) {
      const result = await translateSegmentsWithAI({
        openai,
        model,
        targetLocale,
        segments: chunk,
        customPrompt,
      });
      Object.assign(translationsById, result.translationsById);
    }

    return applySegmentTranslations(localizedData, segments, translationsById);
  },
});

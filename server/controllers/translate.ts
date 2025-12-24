import { Core } from '@strapi/strapi';
import OpenAI from 'openai';

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function handleControllerError(ctx, error: unknown) {
  if (error instanceof OpenAI.APIError) {
    const status = typeof error.status === 'number' ? error.status : 500;

    if (status === 404) {
      ctx.throw(
        502,
        'AI 服务返回 404（Not Found）。这通常意味着你配置的 API 端点不支持 OpenAI-compatible 的 chat 接口（POST /v1/chat/completions）。请检查 Settings → Global → AI Translate 里的 API 端点，或你的代理/转发服务是否支持该接口。'
      );
      return;
    }

    if (status === 401 || status === 403) {
      ctx.throw(502, `AI 服务鉴权失败（${status}）。请检查 API Key 是否正确，或是否被环境变量覆盖。`);
      return;
    }

    ctx.throw(502, `AI 服务请求失败（${status}）：${error.message}`);
    return;
  }

  if (error instanceof Error) {
    const message = error.message?.trim() || '请求失败';

    const isBadRequest =
      message.includes('缺少参数') ||
      message.includes('不能相同') ||
      message.includes('必须') ||
      message.includes('请选择') ||
      message.includes('未配置') ||
      message.includes('未启用 i18n') ||
      message.includes('找不到内容类型') ||
      message.includes('未找到');

    ctx.throw(isBadRequest ? 400 : 500, message);
    return;
  }

  ctx.throw(500, '未知错误');
}

export default ({ strapi }: { strapi: Core.Strapi }) => ({
  health: async (ctx) => {
    ctx.body = { ok: true };
  },

  translateDocument: async (ctx) => {
    try {
      const body = isRecord(ctx.request.body) ? (ctx.request.body as Record<string, unknown>) : {};

      const uid = typeof body.uid === 'string' ? body.uid : '';
      const documentId = typeof body.documentId === 'string' ? body.documentId : '';
      const sourceLocale = typeof body.sourceLocale === 'string' ? body.sourceLocale : '';
      const targetLocale = typeof body.targetLocale === 'string' ? body.targetLocale : '';
      const prompt = typeof body.prompt === 'string' ? body.prompt : undefined;
      const includeJson = body.includeJson === true;

      const result = await strapi.plugin('ai-translate').service('translate').translateDocument({
        uid,
        documentId,
        sourceLocale,
        targetLocale,
        customPrompt: prompt,
        includeJson,
      });

      ctx.body = result;
    } catch (error: unknown) {
      handleControllerError(ctx, error);
    }
  },
});

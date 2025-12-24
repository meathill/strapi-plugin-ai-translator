import React, { useEffect, useMemo, useState } from 'react';
import {
  unstable_useContentManagerContext as useContentManagerContext,
  useFetchClient,
  useQueryParams,
} from '@strapi/strapi/admin';
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Field,
  Modal,
  SingleSelect,
  SingleSelectOption,
  Textarea,
  Typography,
} from '@strapi/design-system';
import { Magic } from '@strapi/icons';

type LocaleItem = {
  id: number;
  name: string;
  code: string;
  isDefault?: boolean;
};

type FormApi = {
  values: Record<string, unknown>;
  onChange: (eventOrPath: React.ChangeEvent<unknown> | string, value?: unknown) => void;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getLocaleFromQuery(query: unknown, rawQuery: string): string | undefined {
  if (isRecord(query)) {
    // Strapi i18n 在 CM 页面使用 query: plugins[i18n][locale]=xx
    const plugins = query.plugins;
    if (isRecord(plugins)) {
      const i18n = plugins.i18n;
      if (isRecord(i18n)) {
        const locale = i18n.locale;
        if (typeof locale === 'string') {
          return locale;
        }
      }
    }

    // 兼容：有些场景会直接使用 ?locale=xx
    const locale = query.locale;
    if (typeof locale === 'string') {
      return locale;
    }
  }

  // 兜底：如果 useQueryParams 的解析结果不是嵌套对象，直接从 rawQuery 里取
  try {
    const normalized = rawQuery.startsWith('?') ? rawQuery.slice(1) : rawQuery;
    const params = new URLSearchParams(normalized);
    return params.get('plugins[i18n][locale]') || params.get('locale') || undefined;
  } catch {
    return undefined;
  }
}

function getApiErrorMessage(err: unknown): string | undefined {
  if (!isRecord(err)) {
    return undefined;
  }
  const response = err.response;
  if (!isRecord(response)) {
    return undefined;
  }
  const data = response.data;
  if (!isRecord(data)) {
    return undefined;
  }
  const error = data.error;
  if (!isRecord(error)) {
    return undefined;
  }
  const message = error.message;
  return typeof message === 'string' ? message : undefined;
}

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem('ai-translate:debug') === '1';
}

function isValueEmpty(value: unknown): boolean {
  if (value === null || value === undefined) {
    return true;
  }
  if (typeof value === 'string') {
    return value.trim().length === 0;
  }
  if (Array.isArray(value)) {
    return value.length === 0;
  }
  return false;
}

export default function EditViewRightLinks() {
  const context = useContentManagerContext();
  const fetchClient = useFetchClient();
  const [{ query, rawQuery }] = useQueryParams<Record<string, unknown>>();

  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState('');
  const [sourceLocale, setSourceLocale] = useState('');
  const [locales, setLocales] = useState<LocaleItem[]>([]);
  const [overwrite, setOverwrite] = useState(false);
  const [includeJson, setIncludeJson] = useState(false);

  const formApi = context.form as FormApi | undefined;
  const values = formApi?.values ?? {};
  const onChange = formApi?.onChange;

  const uid = context.model;
  const documentId = context.id;
  const contentType = context.contentType;

  const queryLocale = getLocaleFromQuery(query, rawQuery) ?? '';
  const pluginLocalized = contentType?.pluginOptions?.i18n?.localized;
  const isLocalized =
    typeof pluginLocalized === 'boolean' ? pluginLocalized : Boolean(queryLocale);

  const defaultLocale = locales.find((l) => l.isDefault)?.code ?? '';
  const targetLocaleFromValues = typeof values.locale === 'string' ? values.locale : '';
  const targetLocale = targetLocaleFromValues || queryLocale || (isLocalized ? defaultLocale : '');

  const targetLocaleLabel = useMemo(() => {
    const matched = locales.find((l) => l.code === targetLocale);
    if (matched) {
      return `${matched.name}（${matched.code}）`;
    }
    return targetLocale || '未知';
  }, [locales, targetLocale]);

  if (!isLocalized) {
    return (
      <Box padding={4}>
        <Typography variant="epsilon" textColor="neutral600">
          当前 Content Type 未启用 i18n，AI Translate 不可用。
        </Typography>
      </Box>
    );
  }

  const inferredDocumentId =
    typeof documentId === 'string' && documentId.length > 0
      ? documentId
      : typeof (values as Record<string, unknown>).documentId === 'string'
        ? ((values as Record<string, unknown>).documentId as string)
        : '';

  const canTranslate = Boolean(onChange && uid && inferredDocumentId && targetLocale);

  const translateDisabledReason = !uid
    ? '无法读取内容类型（uid）'
    : !inferredDocumentId
      ? '请先保存条目（需要 documentId）'
      : !targetLocale
        ? '未识别当前目标语言（locale）'
        : !onChange
          ? '表单接口未就绪（onChange）'
          : null;

  const localeOptions = useMemo(() => {
    return locales.map((item) => ({
      label: item.isDefault ? `${item.name}（默认）` : item.name,
      value: item.code,
    }));
  }, [locales]);

  useEffect(() => {
    if (!isVisible) {
      return;
    }

    async function loadLocales() {
      try {
        const response = await fetchClient.get('/i18n/locales');
        const data = response?.data;
        if (!Array.isArray(data)) {
          return;
        }

        const normalized = data
          .filter((item): item is LocaleItem => {
            return (
              item &&
              typeof item === 'object' &&
              typeof (item as LocaleItem).code === 'string' &&
              typeof (item as LocaleItem).name === 'string'
            );
          })
          .map((item) => item);

        setLocales(normalized);

        if (!sourceLocale) {
          const defaultLocale = normalized.find((l) => l.isDefault)?.code;
          const candidate =
            defaultLocale && defaultLocale !== targetLocale
              ? defaultLocale
              : normalized.find((l) => l.code !== targetLocale)?.code;
          if (candidate) {
            setSourceLocale(candidate);
          }
        }
      } catch (err: unknown) {
        setError(getApiErrorMessage(err) || (err instanceof Error ? err.message : '读取语言列表失败'));
      }
    }

    loadLocales();
  }, [fetchClient, isVisible, sourceLocale, targetLocale]);

  async function handleTranslate() {
    setIsLoading(true);
    setError(null);

    try {
      if (!canTranslate) {
        throw new Error('无法翻译：请先保存条目，并确保已选择目标语言（locale）');
      }
      if (!sourceLocale) {
        throw new Error('请选择源语言');
      }

      const endpoint = '/ai-translate/translate-document';

      if (isDebugEnabled()) {
        console.log('[ai-translate] 请求翻译接口：', endpoint);
      }

      const response = await fetchClient.post(endpoint, {
        uid,
        documentId: inferredDocumentId,
        sourceLocale,
        targetLocale,
        prompt,
        includeJson,
      });

      const translated = response.data;
      if (!isRecord(translated)) {
        throw new Error('翻译接口返回数据不正确');
      }

      Object.keys(translated).forEach((key) => {
        const nextValue = translated[key];
        if (!overwrite && !isValueEmpty(values[key])) {
          return;
        }
        onChange(key, nextValue);
      });

      setIsVisible(false);
    } catch (err: unknown) {
      setError(getApiErrorMessage(err) || (err instanceof Error ? err.message : '翻译失败'));
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Box padding={4}>
      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase">
        AI Tools
      </Typography>

      <Box paddingTop={2}>
        <Button
          variant="secondary"
          startIcon={<Magic />}
          onClick={() => setIsVisible(true)}
          fullWidth
          disabled={!uid}
        >
          AI Translate
        </Button>
      </Box>

      <Modal.Root open={isVisible} onOpenChange={setIsVisible}>
        <Modal.Content>
          <Modal.Header closeLabel="关闭">
            <Modal.Title>AI Translate</Modal.Title>
          </Modal.Header>

          <Modal.Body>
            <Box paddingBottom={4}>
              <Typography variant="beta">目标语言（当前编辑）：{targetLocaleLabel}</Typography>
              <Typography variant="epsilon" textColor="neutral600">
                将从源语言版本读取内容并翻译，然后回填到当前表单（不自动保存）。
              </Typography>
              {translateDisabledReason && (
                <Typography variant="epsilon" textColor="danger600" style={{ marginTop: 8 }}>
                  {translateDisabledReason}
                </Typography>
              )}
            </Box>

            {error && (
              <Box paddingBottom={4}>
                <Alert closeLabel="Close" title="Error" variant="danger" onClose={() => setError(null)}>
                  {error}
                </Alert>
              </Box>
            )}

            <Box paddingBottom={4}>
              <Field.Root name="sourceLocale">
                <Field.Label>源语言</Field.Label>
                <SingleSelect
                  value={sourceLocale}
                  onChange={(value) => setSourceLocale(String(value))}
                  placeholder="请选择源语言"
                  disabled={localeOptions.length === 0}
                >
                  {localeOptions
                    .filter((option) => option.value !== targetLocale)
                    .map((option) => (
                      <SingleSelectOption key={option.value} value={option.value}>
                        {option.label}
                      </SingleSelectOption>
                    ))}
                </SingleSelect>
              </Field.Root>
            </Box>

            <Box paddingBottom={4}>
              <Checkbox checked={overwrite} onCheckedChange={(checked) => setOverwrite(checked === true)}>
                覆盖已有字段（默认只填充空字段）
              </Checkbox>
            </Box>

            <Box paddingBottom={4}>
              <Checkbox
                checked={includeJson}
                onCheckedChange={(checked) => setIncludeJson(checked === true)}
              >
                包含 JSON 字段（可能会误翻译配置/代码，谨慎开启）
              </Checkbox>
            </Box>

            <Textarea
              label="自定义指令（可选）"
              name="prompt"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              value={prompt}
              placeholder="例如：使用正式语气；技术术语保留英文；保持 Markdown 不变……"
              rows={4}
            />
          </Modal.Body>

          <Modal.Footer justifyContent="space-between" gap={2}>
            <Button onClick={() => setIsVisible(false)} variant="tertiary">
              取消
            </Button>
            <Button onClick={handleTranslate} loading={isLoading} disabled={!canTranslate}>
              翻译并回填
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </Box>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
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
import { useIntl } from 'react-intl';
import getTrad from '../../utils/get-trad';

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

type TranslateProgressMeta = {
  done: boolean;
  progress: {
    totalSegments: number;
    translatedSegments: number;
    remainingSegments: number;
    remainingChunks: number;
  };
  cache: {
    hits: number;
    writes: number;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  return undefined;
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
  if (isRecord(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return true;
    }
    if (keys.length === 1 && keys[0] === 'id') {
      return value.id === null || value.id === undefined;
    }
    if (keys.length === 1 && keys[0] === 'data') {
      return value.data === null || value.data === undefined;
    }
  }
  return false;
}

export default function EditViewRightLinks() {
  const { formatMessage } = useIntl();

  const context = useContentManagerContext();
  const fetchClient = useFetchClient();
  const [{ query, rawQuery }] = useQueryParams<Record<string, unknown>>();

  const [isVisible, setIsVisible] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressMeta, setProgressMeta] = useState<TranslateProgressMeta | null>(null);
  const cancelRequestedRef = useRef(false);
  const [isCancelling, setIsCancelling] = useState(false);

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
  const isLocalized = typeof pluginLocalized === 'boolean' ? pluginLocalized : Boolean(queryLocale);

  const defaultLocale = locales.find((l) => l.isDefault)?.code ?? '';
  const targetLocaleFromValues = typeof values.locale === 'string' ? values.locale : '';
  const targetLocale = targetLocaleFromValues || queryLocale || (isLocalized ? defaultLocale : '');

  const targetLocaleLabel = useMemo(() => {
    const matched = locales.find((l) => l.code === targetLocale);
    if (matched) {
      return formatMessage(
        { id: getTrad('editView.localeLabel'), defaultMessage: '{name} ({code})' },
        { name: matched.name, code: matched.code },
      );
    }

    return targetLocale || formatMessage({ id: getTrad('common.unknown'), defaultMessage: 'Unknown' });
  }, [formatMessage, locales, targetLocale]);

  if (!isLocalized) {
    return (
      <Box padding={4}>
        <Typography variant="epsilon" textColor="neutral600">
          {formatMessage({
            id: getTrad('editView.unavailableNoI18n'),
            defaultMessage: 'This Content Type does not have i18n enabled. AI Translate is unavailable.',
          })}
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
    ? formatMessage({
        id: getTrad('editView.disabled.uid'),
        defaultMessage: 'Cannot read content type (uid).',
      })
    : !inferredDocumentId
      ? formatMessage({
          id: getTrad('editView.disabled.documentId'),
          defaultMessage: 'Please save the entry first (requires documentId).',
        })
      : !targetLocale
        ? formatMessage({
            id: getTrad('editView.disabled.targetLocale'),
            defaultMessage: 'Target locale not detected (locale).',
          })
        : !onChange
          ? formatMessage({
              id: getTrad('editView.disabled.onChange'),
              defaultMessage: 'Form API not ready (onChange).',
            })
          : null;

  const localeOptions = useMemo(() => {
    return locales.map((item) => ({
      label: item.isDefault
        ? formatMessage(
            { id: getTrad('editView.localeOptionDefault'), defaultMessage: '{name} (default)' },
            { name: item.name },
          )
        : item.name,
      value: item.code,
    }));
  }, [formatMessage, locales]);

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
        setError(
          getApiErrorMessage(err) ||
            (err instanceof Error
              ? err.message
              : formatMessage({
                  id: getTrad('editView.error.loadLocalesFailed'),
                  defaultMessage: 'Failed to load locales.',
                })),
        );
      }
    }

    loadLocales();
  }, [fetchClient, formatMessage, isVisible, sourceLocale, targetLocale]);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && isLoading) {
      cancelRequestedRef.current = true;
      setIsCancelling(true);
      return;
    }
    setIsVisible(nextOpen);
  }

  function requestCancel() {
    cancelRequestedRef.current = true;
    setIsCancelling(true);
  }

  async function handleTranslate() {
    setIsLoading(true);
    setError(null);
    setProgressMeta(null);
    cancelRequestedRef.current = false;
    setIsCancelling(false);

    try {
      if (!canTranslate) {
        throw new Error(
          formatMessage({
            id: getTrad('editView.error.translateImpossible'),
            defaultMessage: 'Cannot translate: please save the entry and make sure the target locale is detected.',
          }),
        );
      }
      if (!sourceLocale) {
        throw new Error(
          formatMessage({
            id: getTrad('editView.error.sourceLocaleRequired'),
            defaultMessage: 'Please select a source locale.',
          }),
        );
      }

      const endpoint = '/ai-translate/translate-document-progress';

      if (isDebugEnabled()) {
        // eslint-disable-next-line no-console
        console.log('[ai-translate] 请求翻译接口：', endpoint);
      }

      let lastResultData: Record<string, unknown> | null = null;
      let loopCount = 0;
      let lastTranslatedSegments = -1;

      while (true) {
        if (cancelRequestedRef.current) {
          break;
        }

        const response = await fetchClient.post(endpoint, {
          uid,
          documentId: inferredDocumentId,
          sourceLocale,
          targetLocale,
          prompt,
          includeJson,
          maxChunks: 1,
        });

        const payload = response.data;
        if (!isRecord(payload)) {
          throw new Error(
            formatMessage({
              id: getTrad('editView.error.translateResponseInvalid'),
              defaultMessage: 'Translate API returned invalid data.',
            }),
          );
        }

        const translated = payload.data;
        const meta = payload.meta;
        if (!isRecord(translated) || !isRecord(meta)) {
          throw new Error(
            formatMessage({
              id: getTrad('editView.error.translateResponseInvalid'),
              defaultMessage: 'Translate API returned invalid data.',
            }),
          );
        }

        lastResultData = translated;

        const done = meta.done === true;
        const nextProgress = isRecord(meta.progress) ? meta.progress : {};
        const nextCache = isRecord(meta.cache) ? meta.cache : {};
        const totalSegments = getNumber(nextProgress.totalSegments) ?? 0;
        const translatedSegments = getNumber(nextProgress.translatedSegments) ?? 0;
        const remainingSegments = getNumber(nextProgress.remainingSegments) ?? 0;
        const remainingChunks = getNumber(nextProgress.remainingChunks) ?? 0;
        const hits = getNumber(nextCache.hits) ?? 0;
        const writes = getNumber(nextCache.writes) ?? 0;

        setProgressMeta({
          done,
          progress: {
            totalSegments,
            translatedSegments,
            remainingSegments,
            remainingChunks,
          },
          cache: {
            hits,
            writes,
          },
        });

        if (done) {
          break;
        }

        if (translatedSegments <= lastTranslatedSegments) {
          loopCount += 1;
        } else {
          lastTranslatedSegments = translatedSegments;
          loopCount = 0;
        }

        if (loopCount >= 5) {
          throw new Error(
            formatMessage({
              id: getTrad('editView.error.translateStuck'),
              defaultMessage:
                'Translation seems stuck (no progress in multiple rounds). Please try again or check your AI endpoint settings.',
            }),
          );
        }
      }

      if (cancelRequestedRef.current) {
        return;
      }

      if (!lastResultData) {
        throw new Error(
          formatMessage({
            id: getTrad('editView.error.translateResponseInvalid'),
            defaultMessage: 'Translate API returned invalid data.',
          }),
        );
      }

      const latestValues = (formApi?.values ?? values) as Record<string, unknown>;

      Object.keys(lastResultData).forEach((key) => {
        const nextValue = lastResultData?.[key];
        if (!overwrite && !isValueEmpty(latestValues[key])) {
          return;
        }
        onChange(key, nextValue);
      });

      setIsVisible(false);
    } catch (err: unknown) {
      setError(
        getApiErrorMessage(err) ||
          (err instanceof Error
            ? err.message
            : formatMessage({
                id: getTrad('editView.error.translateFailed'),
                defaultMessage: 'Translation failed.',
              })),
      );
    } finally {
      setIsLoading(false);
      setIsCancelling(false);
    }
  }

  return (
    <Box padding={4}>
      <Typography variant="sigma" textColor="neutral600" textTransform="uppercase">
        {formatMessage({ id: getTrad('editView.sectionTitle'), defaultMessage: 'AI Tools' })}
      </Typography>

      <Box paddingTop={2}>
        <Button variant="secondary" startIcon={<Magic />} onClick={() => setIsVisible(true)} fullWidth disabled={!uid}>
          {formatMessage({ id: getTrad('editView.openButton'), defaultMessage: 'AI Translate' })}
        </Button>
      </Box>

      <Modal.Root open={isVisible} onOpenChange={handleOpenChange}>
        <Modal.Content>
          <Modal.Header closeLabel={formatMessage({ id: getTrad('common.close'), defaultMessage: 'Close' })}>
            <Modal.Title>
              {formatMessage({ id: getTrad('editView.modal.title'), defaultMessage: 'AI Translate' })}
            </Modal.Title>
          </Modal.Header>

          <Modal.Body>
            <Box paddingBottom={4}>
              <Typography variant="beta">
                {formatMessage(
                  {
                    id: getTrad('editView.modal.targetLocale'),
                    defaultMessage: 'Target locale (currently editing): {label}',
                  },
                  { label: targetLocaleLabel },
                )}
              </Typography>
              <Typography variant="epsilon" textColor="neutral600">
                {formatMessage({
                  id: getTrad('editView.modal.description'),
                  defaultMessage:
                    'It will read the content from the source locale version, translate it, then fill it back into the current form (it will not save automatically).',
                })}
              </Typography>
              {translateDisabledReason && (
                <Typography variant="epsilon" textColor="danger600" style={{ marginTop: 8 }}>
                  {translateDisabledReason}
                </Typography>
              )}
            </Box>

            {error && (
              <Box paddingBottom={4}>
                <Alert
                  closeLabel={formatMessage({ id: getTrad('common.close'), defaultMessage: 'Close' })}
                  title={formatMessage({ id: getTrad('common.error'), defaultMessage: 'Error' })}
                  variant="danger"
                  onClose={() => setError(null)}
                >
                  {error}
                </Alert>
              </Box>
            )}

            {progressMeta && (
              <Box paddingBottom={4}>
                <Alert
                  title={formatMessage({
                    id: getTrad('editView.progress.title'),
                    defaultMessage: 'Translation progress',
                  })}
                  variant={progressMeta.done ? 'success' : 'default'}
                >
                  <Typography variant="epsilon">
                    {formatMessage(
                      {
                        id: getTrad('editView.progress.segments'),
                        defaultMessage: 'Segments: {translated}/{total} (remaining: {remaining}, chunks: {chunks})',
                      },
                      {
                        translated: progressMeta.progress.translatedSegments,
                        total: progressMeta.progress.totalSegments,
                        remaining: progressMeta.progress.remainingSegments,
                        chunks: progressMeta.progress.remainingChunks,
                      },
                    )}
                  </Typography>
                  <Typography variant="epsilon" textColor="neutral600">
                    {formatMessage(
                      {
                        id: getTrad('editView.progress.cache'),
                        defaultMessage: 'Cache: {hits} hits, {writes} writes',
                      },
                      { hits: progressMeta.cache.hits, writes: progressMeta.cache.writes },
                    )}
                  </Typography>
                  {isCancelling && (
                    <Typography variant="epsilon" textColor="neutral600">
                      {formatMessage({
                        id: getTrad('editView.progress.cancelling'),
                        defaultMessage: 'Cancelling…',
                      })}
                    </Typography>
                  )}
                </Alert>
              </Box>
            )}

            <Box paddingBottom={4}>
              <Field.Root name="sourceLocale">
                <Field.Label>
                  {formatMessage({ id: getTrad('editView.sourceLocale.label'), defaultMessage: 'Source locale' })}
                </Field.Label>
                <SingleSelect
                  value={sourceLocale}
                  onChange={(value) => setSourceLocale(String(value))}
                  placeholder={formatMessage({
                    id: getTrad('editView.sourceLocale.placeholder'),
                    defaultMessage: 'Select a source locale',
                  })}
                  disabled={localeOptions.length === 0 || isLoading}
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
              <Checkbox
                checked={overwrite}
                onCheckedChange={(checked) => setOverwrite(checked === true)}
                disabled={isLoading}
              >
                {formatMessage({
                  id: getTrad('editView.overwrite.label'),
                  defaultMessage: 'Overwrite existing fields (default: only fill empty fields)',
                })}
              </Checkbox>
            </Box>

            <Box paddingBottom={4}>
              <Checkbox
                checked={includeJson}
                onCheckedChange={(checked) => setIncludeJson(checked === true)}
                disabled={isLoading}
              >
                {formatMessage({
                  id: getTrad('editView.includeJson.label'),
                  defaultMessage: 'Include JSON fields (may translate config/code; use with caution)',
                })}
              </Checkbox>
            </Box>

            <Textarea
              label={formatMessage({
                id: getTrad('editView.prompt.label'),
                defaultMessage: 'Custom instructions (optional)',
              })}
              name="prompt"
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPrompt(e.target.value)}
              value={prompt}
              placeholder={formatMessage({
                id: getTrad('editView.prompt.placeholder'),
                defaultMessage: 'e.g. Use a formal tone; keep technical terms in English; preserve Markdown…',
              })}
              rows={4}
              disabled={isLoading}
            />
          </Modal.Body>

          <Modal.Footer justifyContent="space-between" gap={2}>
            <Button
              onClick={() => {
                if (isLoading) {
                  requestCancel();
                  return;
                }
                setIsVisible(false);
              }}
              variant="tertiary"
            >
              {isLoading
                ? formatMessage({ id: getTrad('editView.button.stop'), defaultMessage: 'Stop' })
                : formatMessage({ id: getTrad('common.cancel'), defaultMessage: 'Cancel' })}
            </Button>
            <Button onClick={handleTranslate} loading={isLoading} disabled={!canTranslate || isLoading}>
              {formatMessage({
                id: getTrad('editView.button.translateAndFill'),
                defaultMessage: 'Translate & fill',
              })}
            </Button>
          </Modal.Footer>
        </Modal.Content>
      </Modal.Root>
    </Box>
  );
}

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';
import {
  Alert,
  Box,
  Button,
  Field,
  Modal,
  SingleSelect,
  SingleSelectOption,
  TextInput,
  Typography,
} from '@strapi/design-system';
import { useIntl } from 'react-intl';
import buyMeACoffeeQrCodePng from '../../../../qr-code.png';
import getTrad from '../../utils/get-trad';

type ValueSource = 'env' | 'settings' | 'config' | 'default';

type Provider = 'openai' | 'replicate';

type SettingsResponseData = {
  stored: {
    provider: Provider;
    openai: {
      apiUrl: string;
      model: string;
      apiKeySet: boolean;
      apiKeyLength: number;
    };
    replicate: {
      model: string;
      apiTokenSet: boolean;
      apiTokenLength: number;
    };
  };
  env: {
    providerSet: boolean;
    openai: {
      apiKeySet: boolean;
      apiUrlSet: boolean;
      modelSet: boolean;
    };
    replicate: {
      apiTokenSet: boolean;
      modelSet: boolean;
    };
  };
  effective: {
    provider: Provider;
    providerSource: ValueSource;
    openai: {
      apiUrl: string;
      apiUrlSource: ValueSource;
      model: string;
      modelSource: ValueSource;
      apiKeySet: boolean;
      apiKeyLength: number;
      apiKeySource: ValueSource;
    };
    replicate: {
      model: string;
      modelSource: ValueSource;
      apiTokenSet: boolean;
      apiTokenLength: number;
      apiTokenSource: ValueSource;
    };
  };
};

type SettingsResponse = {
  data: SettingsResponseData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
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
  return typeof message === 'string' && message.trim().length > 0 ? message : undefined;
}

export default function SettingsPage() {
  const { formatMessage } = useIntl();

  const fetchClient = useFetchClient();
  const { toggleNotification } = useNotification();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCacheModalOpen, setIsCacheModalOpen] = useState(false);
  const [isClearingCache, setIsClearingCache] = useState(false);

  const [settings, setSettings] = useState<SettingsResponseData | null>(null);

  const [provider, setProvider] = useState<Provider>('openai');

  const [openaiApiUrl, setOpenaiApiUrl] = useState('');
  const [openaiModel, setOpenaiModel] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');

  const [replicateModel, setReplicateModel] = useState('');
  const [replicateApiToken, setReplicateApiToken] = useState('');

  function formatSource(source: ValueSource): string {
    switch (source) {
      case 'env':
        return formatMessage({
          id: getTrad('settings.source.env'),
          defaultMessage: 'Environment variable',
        });
      case 'settings':
        return formatMessage({
          id: getTrad('settings.source.settings'),
          defaultMessage: 'Settings page',
        });
      case 'config':
        return formatMessage({
          id: getTrad('settings.source.config'),
          defaultMessage: 'config/plugins.ts',
        });
      case 'default':
        return formatMessage({
          id: getTrad('settings.source.default'),
          defaultMessage: 'Default',
        });
      default:
        return formatMessage({ id: getTrad('common.unknown'), defaultMessage: 'Unknown' });
    }
  }

  function formatProvider(value: Provider): string {
    return value === 'replicate'
      ? formatMessage({
          id: getTrad('settings.providerName.replicate'),
          defaultMessage: 'Replicate',
        })
      : formatMessage({
          id: getTrad('settings.providerName.openai'),
          defaultMessage: 'OpenAI-compatible',
        });
  }

  const notConfiguredLabel = useMemo(() => {
    return formatMessage({ id: getTrad('common.notConfigured'), defaultMessage: 'Not configured' });
  }, [formatMessage]);

  const defaultLabel = useMemo(() => {
    return formatMessage({ id: getTrad('common.default'), defaultMessage: 'Default' });
  }, [formatMessage]);

  function formatSecretPlaceholder(isSet: boolean, length: number): string {
    if (!isSet) {
      return notConfiguredLabel;
    }

    return formatMessage(
      { id: getTrad('common.configuredLength'), defaultMessage: 'Configured (length: {length})' },
      { length },
    );
  }

  const envWarning = useMemo(() => {
    if (!settings) {
      return null;
    }

    const warnings: string[] = [];

    if (settings.env.providerSet) {
      warnings.push(
        formatMessage(
          {
            id: getTrad('settings.envOverride.provider'),
            defaultMessage: 'Detected environment variable {name}. Provider saved in Settings page will be ignored.',
          },
          { name: 'AI_TRANSLATE_PROVIDER' },
        ),
      );
    }

    if (settings.env.openai.apiKeySet) {
      warnings.push(
        formatMessage(
          {
            id: getTrad('settings.envOverride.openai.apiKey'),
            defaultMessage:
              'Detected environment variable {name}. OpenAI API Key saved in Settings page will be ignored.',
          },
          { name: 'AI_TRANSLATE_API_KEY' },
        ),
      );
    }
    if (settings.env.openai.apiUrlSet) {
      warnings.push(
        formatMessage(
          {
            id: getTrad('settings.envOverride.openai.apiUrl'),
            defaultMessage:
              'Detected environment variable {name}. OpenAI API endpoint saved in Settings page will be ignored.',
          },
          { name: 'AI_TRANSLATE_API_URL' },
        ),
      );
    }
    if (settings.env.openai.modelSet) {
      warnings.push(
        formatMessage(
          {
            id: getTrad('settings.envOverride.openai.model'),
            defaultMessage:
              'Detected environment variable {name}. OpenAI model saved in Settings page will be ignored.',
          },
          { name: 'AI_TRANSLATE_MODEL' },
        ),
      );
    }

    if (settings.env.replicate.apiTokenSet) {
      warnings.push(
        formatMessage(
          {
            id: getTrad('settings.envOverride.replicate.apiToken'),
            defaultMessage:
              'Detected environment variable {name}. Replicate API Token saved in Settings page will be ignored.',
          },
          { name: 'AI_TRANSLATE_REPLICATE_API_TOKEN' },
        ),
      );
    }
    if (settings.env.replicate.modelSet) {
      warnings.push(
        formatMessage(
          {
            id: getTrad('settings.envOverride.replicate.model'),
            defaultMessage:
              'Detected environment variable {name}. Replicate model saved in Settings page will be ignored.',
          },
          { name: 'AI_TRANSLATE_REPLICATE_MODEL' },
        ),
      );
    }

    return warnings.length > 0 ? warnings.join('\n') : null;
  }, [formatMessage, settings]);

  const load = useCallback(
    async function load() {
      setIsLoading(true);
      setError(null);

      try {
        const response = (await fetchClient.get('/ai-translate/settings')) as SettingsResponse;
        const data = response?.data;

        if (!data || typeof data !== 'object' || !('stored' in data)) {
          throw new Error(
            formatMessage({
              id: getTrad('settings.error.invalidResponse'),
              defaultMessage: 'Invalid response payload.',
            }),
          );
        }

        setSettings(data);

        setProvider(data.stored.provider ?? 'openai');

        setOpenaiApiUrl(data.stored.openai.apiUrl ?? '');
        setOpenaiModel(data.stored.openai.model ?? '');
        setOpenaiApiKey('');

        setReplicateModel(data.stored.replicate.model ?? '');
        setReplicateApiToken('');
      } catch (err: unknown) {
        setError(
          getApiErrorMessage(err) ||
            (err instanceof Error
              ? err.message
              : formatMessage({
                  id: getTrad('settings.error.loadFailed'),
                  defaultMessage: 'Failed to load settings.',
                })),
        );
      } finally {
        setIsLoading(false);
      }
    },
    [fetchClient, formatMessage],
  );

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(
    async function handleSave() {
      setIsSaving(true);
      setError(null);

      try {
        const payload: Record<string, unknown> = {
          provider,
          apiUrl: openaiApiUrl,
          model: openaiModel,
          replicateModel,
        };

        if (openaiApiKey.trim().length > 0) {
          payload.apiKey = openaiApiKey.trim();
        }

        if (replicateApiToken.trim().length > 0) {
          payload.replicateApiToken = replicateApiToken.trim();
        }

        await fetchClient.put('/ai-translate/settings', payload);

        toggleNotification({
          type: 'success',
          message: formatMessage({
            id: getTrad('settings.notification.saved'),
            defaultMessage: 'Settings saved.',
          }),
        });

        await load();
      } catch (err: unknown) {
        toggleNotification({
          type: 'danger',
          message: formatMessage({
            id: getTrad('settings.notification.saveFailed'),
            defaultMessage: 'Save failed.',
          }),
        });
        setError(
          getApiErrorMessage(err) ||
            (err instanceof Error
              ? err.message
              : formatMessage({
                  id: getTrad('settings.error.saveFailed'),
                  defaultMessage: 'Failed to save settings.',
                })),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [
      fetchClient,
      formatMessage,
      load,
      openaiApiKey,
      openaiApiUrl,
      openaiModel,
      provider,
      replicateApiToken,
      replicateModel,
      toggleNotification,
    ],
  );

  const handleClearOpenAiApiKey = useCallback(
    async function handleClearOpenAiApiKey() {
      setIsSaving(true);
      setError(null);

      try {
        await fetchClient.put('/ai-translate/settings', { apiKey: '' });

        toggleNotification({
          type: 'success',
          message: formatMessage({
            id: getTrad('settings.notification.clearedOpenaiApiKey'),
            defaultMessage: 'OpenAI API Key cleared.',
          }),
        });

        await load();
      } catch (err: unknown) {
        toggleNotification({
          type: 'danger',
          message: formatMessage({
            id: getTrad('settings.notification.clearFailed'),
            defaultMessage: 'Clear failed.',
          }),
        });
        setError(
          getApiErrorMessage(err) ||
            (err instanceof Error
              ? err.message
              : formatMessage({
                  id: getTrad('settings.error.clearFailed'),
                  defaultMessage: 'Failed to clear API Key.',
                })),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [fetchClient, formatMessage, load, toggleNotification],
  );

  const handleClearReplicateApiToken = useCallback(
    async function handleClearReplicateApiToken() {
      setIsSaving(true);
      setError(null);

      try {
        await fetchClient.put('/ai-translate/settings', { replicateApiToken: '' });

        toggleNotification({
          type: 'success',
          message: formatMessage({
            id: getTrad('settings.notification.clearedReplicateApiToken'),
            defaultMessage: 'Replicate API Token cleared.',
          }),
        });

        await load();
      } catch (err: unknown) {
        toggleNotification({
          type: 'danger',
          message: formatMessage({
            id: getTrad('settings.notification.clearFailed'),
            defaultMessage: 'Clear failed.',
          }),
        });
        setError(
          getApiErrorMessage(err) ||
            (err instanceof Error
              ? err.message
              : formatMessage({
                  id: getTrad('settings.error.clearFailed'),
                  defaultMessage: 'Failed to clear API Token.',
                })),
        );
      } finally {
        setIsSaving(false);
      }
    },
    [fetchClient, formatMessage, load, toggleNotification],
  );

  const handleConfirmClearTranslationCache = useCallback(
    async function handleConfirmClearTranslationCache() {
      setIsClearingCache(true);
      setError(null);

      try {
        const response = await fetchClient.post('/ai-translate/cache/clear', {
          includePreviousVersions: true,
        });

        const data = response?.data as unknown;
        const clearedBuckets =
          isRecord(data) && typeof data.clearedBuckets === 'number' ? data.clearedBuckets : undefined;

        toggleNotification({
          type: 'success',
          message: formatMessage(
            {
              id: getTrad('settings.cache.notification.cleared'),
              defaultMessage: 'Translation cache cleared (buckets cleared: {buckets}).',
            },
            { buckets: typeof clearedBuckets === 'number' ? clearedBuckets : 0 },
          ),
        });

        setIsCacheModalOpen(false);
      } catch (err: unknown) {
        toggleNotification({
          type: 'danger',
          message: formatMessage({
            id: getTrad('settings.cache.notification.clearFailed'),
            defaultMessage: 'Failed to clear translation cache.',
          }),
        });
        setError(
          getApiErrorMessage(err) ||
            (err instanceof Error
              ? err.message
              : formatMessage({
                  id: getTrad('settings.cache.error.clearFailed'),
                  defaultMessage: 'Failed to clear translation cache.',
                })),
        );
      } finally {
        setIsClearingCache(false);
      }
    },
    [fetchClient, formatMessage, toggleNotification],
  );

  if (isLoading) {
    return <Page.Loading />;
  }

  return (
    <Page.Main tabIndex={-1}>
      <Layouts.Header
        title={formatMessage({ id: getTrad('settings.title'), defaultMessage: 'AI Translate' })}
        subtitle={formatMessage({
          id: getTrad('settings.subtitle'),
          defaultMessage: 'Configure translation provider, credentials, model, and endpoint.',
        })}
        primaryAction={
          <Button loading={isSaving} onClick={handleSave} disabled={isSaving}>
            {formatMessage({ id: getTrad('common.save'), defaultMessage: 'Save' })}
          </Button>
        }
      />

      <Layouts.Content>
        <Box paddingBottom={4}>
          <Typography variant="epsilon" textColor="neutral600">
            {formatMessage({
              id: getTrad('settings.securityNotice'),
              defaultMessage:
                'Note: Saving secrets to the database reduces security. In production, environment variables are recommended. For safety, the server will not return the key/token contents, only whether it is configured and its length.',
            })}
          </Typography>
        </Box>

        {envWarning && (
          <Box paddingBottom={4}>
            <Alert
              closeLabel={formatMessage({ id: getTrad('common.close'), defaultMessage: 'Close' })}
              title={formatMessage({
                id: getTrad('settings.envOverride.title'),
                defaultMessage: 'Environment variables override',
              })}
              variant="warning"
            >
              <Typography style={{ whiteSpace: 'pre-line' }}>{envWarning}</Typography>
            </Alert>
          </Box>
        )}

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

        <Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
          <Box paddingBottom={4}>
            <Typography variant="delta">
              {formatMessage({ id: getTrad('settings.provider.sectionTitle'), defaultMessage: 'Provider' })}
            </Typography>
          </Box>

          <Box paddingBottom={4}>
            <Field.Root name="provider">
              <Field.Label>
                {formatMessage({ id: getTrad('settings.provider.label'), defaultMessage: 'AI provider' })}
              </Field.Label>
              <SingleSelect value={provider} onChange={(value) => setProvider(value as Provider)}>
                <SingleSelectOption value="openai">
                  {formatMessage({
                    id: getTrad('settings.provider.option.openai'),
                    defaultMessage: 'OpenAI-compatible (Chat Completions)',
                  })}
                </SingleSelectOption>
                <SingleSelectOption value="replicate">
                  {formatMessage({
                    id: getTrad('settings.provider.option.replicate'),
                    defaultMessage: 'Replicate (replicate.run)',
                  })}
                </SingleSelectOption>
              </SingleSelect>
              <Field.Hint>
                {formatMessage({
                  id: getTrad('settings.provider.hint'),
                  defaultMessage:
                    'OpenAI-compatible uses `POST /v1/chat/completions`; Replicate uses the official SDK to run models.',
                })}
              </Field.Hint>
            </Field.Root>
          </Box>

          {provider === 'openai' && (
            <>
              <Box paddingBottom={4}>
                <Typography variant="delta">
                  {formatMessage({
                    id: getTrad('settings.openai.sectionTitle'),
                    defaultMessage: 'OpenAI-compatible',
                  })}
                </Typography>
              </Box>

              <Box paddingBottom={4}>
                <Field.Root name="openaiApiUrl">
                  <Field.Label>
                    {formatMessage({
                      id: getTrad('settings.openai.apiUrl.label'),
                      defaultMessage: 'API endpoint (baseURL)',
                    })}
                  </Field.Label>
                  <TextInput
                    placeholder={formatMessage({
                      id: getTrad('settings.openai.apiUrl.placeholder'),
                      defaultMessage: 'e.g. https://api.openai.com/v1',
                    })}
                    value={openaiApiUrl}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenaiApiUrl(e.target.value)}
                  />
                  <Field.Hint>
                    {formatMessage({
                      id: getTrad('settings.openai.apiUrl.hint'),
                      defaultMessage:
                        'Leave blank to use the SDK default. If you use a proxy/forwarding service, enter its OpenAI-compatible baseURL.',
                    })}
                  </Field.Hint>
                </Field.Root>
              </Box>

              <Box paddingBottom={4}>
                <Field.Root name="openaiModel">
                  <Field.Label>
                    {formatMessage({
                      id: getTrad('settings.openai.model.label'),
                      defaultMessage: 'Model name',
                    })}
                  </Field.Label>
                  <TextInput
                    placeholder={formatMessage({
                      id: getTrad('settings.openai.model.placeholder'),
                      defaultMessage: 'e.g. gpt-4o-mini',
                    })}
                    value={openaiModel}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenaiModel(e.target.value)}
                  />
                  <Field.Hint>
                    {formatMessage({
                      id: getTrad('settings.openai.model.hint'),
                      defaultMessage: 'Leave blank to use the default model (gpt-4o-mini).',
                    })}
                  </Field.Hint>
                </Field.Root>
              </Box>

              <Box paddingBottom={4}>
                <Field.Root name="openaiApiKey">
                  <Field.Label>
                    {formatMessage({
                      id: getTrad('settings.openai.apiKey.label'),
                      defaultMessage: 'API Key',
                    })}
                  </Field.Label>
                  <TextInput
                    type="password"
                    placeholder={formatSecretPlaceholder(
                      settings?.stored.openai.apiKeySet === true,
                      settings?.stored.openai.apiKeyLength ?? 0,
                    )}
                    value={openaiApiKey}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setOpenaiApiKey(e.target.value)}
                  />
                  <Field.Hint>
                    {formatMessage({
                      id: getTrad('settings.openai.apiKey.hint'),
                      defaultMessage:
                        'Leave blank to keep the existing value. To change it, enter a new key. You can also click "Clear OpenAI API Key" below.',
                    })}
                  </Field.Hint>
                </Field.Root>
              </Box>

              <Box paddingTop={2}>
                <Button variant="danger-light" onClick={handleClearOpenAiApiKey} disabled={isSaving}>
                  {formatMessage({
                    id: getTrad('settings.openai.clearApiKey'),
                    defaultMessage: 'Clear OpenAI API Key',
                  })}
                </Button>
              </Box>
            </>
          )}

          {provider === 'replicate' && (
            <>
              <Box paddingBottom={4}>
                <Typography variant="delta">
                  {formatMessage({
                    id: getTrad('settings.replicate.sectionTitle'),
                    defaultMessage: 'Replicate',
                  })}
                </Typography>
              </Box>

              <Box paddingBottom={4}>
                <Field.Root name="replicateModel">
                  <Field.Label>
                    {formatMessage({
                      id: getTrad('settings.replicate.model.label'),
                      defaultMessage: 'Model (model id)',
                    })}
                  </Field.Label>
                  <TextInput
                    placeholder={formatMessage({
                      id: getTrad('settings.replicate.model.placeholder'),
                      defaultMessage: 'e.g. meta/meta-llama-3-70b-instruct',
                    })}
                    value={replicateModel}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReplicateModel(e.target.value)}
                  />
                  <Field.Hint>
                    {formatMessage({
                      id: getTrad('settings.replicate.model.hint'),
                      defaultMessage: 'Enter Replicate model identifier (owner/name or owner/name:version).',
                    })}
                  </Field.Hint>
                </Field.Root>
              </Box>

              <Box paddingBottom={4}>
                <Field.Root name="replicateApiToken">
                  <Field.Label>
                    {formatMessage({
                      id: getTrad('settings.replicate.apiToken.label'),
                      defaultMessage: 'API Token',
                    })}
                  </Field.Label>
                  <TextInput
                    type="password"
                    placeholder={formatSecretPlaceholder(
                      settings?.stored.replicate.apiTokenSet === true,
                      settings?.stored.replicate.apiTokenLength ?? 0,
                    )}
                    value={replicateApiToken}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setReplicateApiToken(e.target.value)}
                  />
                  <Field.Hint>
                    {formatMessage({
                      id: getTrad('settings.replicate.apiToken.hint'),
                      defaultMessage:
                        'Leave blank to keep the existing value. To change it, enter a new token. You can also click "Clear Replicate API Token" below.',
                    })}
                  </Field.Hint>
                </Field.Root>
              </Box>

              <Box paddingTop={2}>
                <Button variant="danger-light" onClick={handleClearReplicateApiToken} disabled={isSaving}>
                  {formatMessage({
                    id: getTrad('settings.replicate.clearApiToken'),
                    defaultMessage: 'Clear Replicate API Token',
                  })}
                </Button>
              </Box>
            </>
          )}
        </Box>

        {settings && (
          <Box paddingTop={6}>
            <Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
              <Box paddingBottom={4}>
                <Typography variant="delta">
                  {formatMessage({
                    id: getTrad('settings.effective.sectionTitle'),
                    defaultMessage: 'Effective configuration',
                  })}
                </Typography>
              </Box>

              <Typography variant="epsilon" textColor="neutral700">
                {formatMessage(
                  {
                    id: getTrad('settings.effective.providerLine'),
                    defaultMessage: 'Provider: {provider} (source: {source})',
                  },
                  {
                    provider: formatProvider(settings.effective.provider),
                    source: formatSource(settings.effective.providerSource),
                  },
                )}
              </Typography>

              {settings.effective.provider === 'openai' && (
                <>
                  <Typography variant="epsilon" textColor="neutral700">
                    {formatMessage(
                      {
                        id: getTrad('settings.effective.openai.apiUrlLine'),
                        defaultMessage: 'OpenAI API endpoint: {value} (source: {source})',
                      },
                      {
                        value: settings.effective.openai.apiUrl || defaultLabel,
                        source: formatSource(settings.effective.openai.apiUrlSource),
                      },
                    )}
                  </Typography>
                  <Typography variant="epsilon" textColor="neutral700">
                    {formatMessage(
                      {
                        id: getTrad('settings.effective.openai.modelLine'),
                        defaultMessage: 'OpenAI model: {value} (source: {source})',
                      },
                      {
                        value: settings.effective.openai.model,
                        source: formatSource(settings.effective.openai.modelSource),
                      },
                    )}
                  </Typography>
                  <Typography variant="epsilon" textColor="neutral700">
                    {settings.effective.openai.apiKeySet
                      ? formatMessage(
                          {
                            id: getTrad('settings.effective.openai.apiKey.setLine'),
                            defaultMessage: 'OpenAI API Key: Configured (length: {length}, source: {source})',
                          },
                          {
                            length: settings.effective.openai.apiKeyLength,
                            source: formatSource(settings.effective.openai.apiKeySource),
                          },
                        )
                      : formatMessage({
                          id: getTrad('settings.effective.openai.apiKey.unsetLine'),
                          defaultMessage: 'OpenAI API Key: Not configured',
                        })}
                  </Typography>
                </>
              )}

              {settings.effective.provider === 'replicate' && (
                <>
                  <Typography variant="epsilon" textColor="neutral700">
                    {formatMessage(
                      {
                        id: getTrad('settings.effective.replicate.modelLine'),
                        defaultMessage: 'Replicate model: {value} (source: {source})',
                      },
                      {
                        value: settings.effective.replicate.model || notConfiguredLabel,
                        source: formatSource(settings.effective.replicate.modelSource),
                      },
                    )}
                  </Typography>
                  <Typography variant="epsilon" textColor="neutral700">
                    {settings.effective.replicate.apiTokenSet
                      ? formatMessage(
                          {
                            id: getTrad('settings.effective.replicate.apiToken.setLine'),
                            defaultMessage: 'Replicate API Token: Configured (length: {length}, source: {source})',
                          },
                          {
                            length: settings.effective.replicate.apiTokenLength,
                            source: formatSource(settings.effective.replicate.apiTokenSource),
                          },
                        )
                      : formatMessage({
                          id: getTrad('settings.effective.replicate.apiToken.unsetLine'),
                          defaultMessage: 'Replicate API Token: Not configured',
                        })}
                  </Typography>
                </>
              )}
            </Box>
          </Box>
        )}

        <Box paddingTop={6}>
          <Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
            <Box paddingBottom={2}>
              <Typography variant="delta">
                {formatMessage({
                  id: getTrad('settings.cache.sectionTitle'),
                  defaultMessage: 'Translation cache',
                })}
              </Typography>
            </Box>

            <Typography variant="epsilon" textColor="neutral700">
              {formatMessage({
                id: getTrad('settings.cache.description'),
                defaultMessage:
                  'This plugin persists translated segments in Strapi store (database) to enable stop/continue and reuse completed batches. If you want to remove the cached translations, clear the cache below.',
              })}
            </Typography>

            <Box paddingTop={4}>
              <Button
                variant="danger-light"
                onClick={() => setIsCacheModalOpen(true)}
                disabled={isSaving || isClearingCache}
              >
                {formatMessage({
                  id: getTrad('settings.cache.clearButton'),
                  defaultMessage: 'Clear translation cache',
                })}
              </Button>
            </Box>
          </Box>
        </Box>

        <Box paddingTop={6}>
          <Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
            <Box paddingBottom={2}>
              <Typography variant="delta">
                {formatMessage({
                  id: getTrad('settings.support.sectionTitle'),
                  defaultMessage: 'Support the author',
                })}
              </Typography>
            </Box>

            <Typography variant="epsilon" textColor="neutral700">
              {formatMessage({
                id: getTrad('settings.support.descriptionPrefix'),
                defaultMessage: 'If this plugin helps you, consider buying me a coffee: ',
              })}
              <a href="https://buymeacoffee.com/meathill" target="_blank" rel="noopener noreferrer">
                buymeacoffee.com/meathill
              </a>
            </Typography>

            <Box paddingTop={4} display="flex" justifyContent="center">
              <img
                src={buyMeACoffeeQrCodePng}
                alt={formatMessage({
                  id: getTrad('settings.support.qrAlt'),
                  defaultMessage: 'Buy Me a Coffee QR code',
                })}
                style={{ width: 220, maxWidth: '100%', borderRadius: 8 }}
              />
            </Box>
          </Box>
        </Box>

        <Modal.Root open={isCacheModalOpen} onOpenChange={setIsCacheModalOpen}>
          <Modal.Content>
            <Modal.Header closeLabel={formatMessage({ id: getTrad('common.close'), defaultMessage: 'Close' })}>
              <Modal.Title>
                {formatMessage({
                  id: getTrad('settings.cache.confirm.title'),
                  defaultMessage: 'Clear translation cache?',
                })}
              </Modal.Title>
            </Modal.Header>

            <Modal.Body>
              <Typography variant="epsilon" textColor="neutral700">
                {formatMessage({
                  id: getTrad('settings.cache.confirm.description'),
                  defaultMessage:
                    'This will delete cached translated segments stored in your database. It cannot be undone. You can still translate again afterwards.',
                })}
              </Typography>
            </Modal.Body>

            <Modal.Footer justifyContent="space-between" gap={2}>
              <Button onClick={() => setIsCacheModalOpen(false)} variant="tertiary" disabled={isClearingCache}>
                {formatMessage({ id: getTrad('common.cancel'), defaultMessage: 'Cancel' })}
              </Button>
              <Button onClick={handleConfirmClearTranslationCache} variant="danger" loading={isClearingCache}>
                {formatMessage({
                  id: getTrad('settings.cache.confirm.confirmButton'),
                  defaultMessage: 'Clear cache',
                })}
              </Button>
            </Modal.Footer>
          </Modal.Content>
        </Modal.Root>
      </Layouts.Content>
    </Page.Main>
  );
}

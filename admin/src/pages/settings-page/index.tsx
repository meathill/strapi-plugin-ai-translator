import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Layouts, Page, useFetchClient, useNotification } from '@strapi/strapi/admin';
import { Alert, Box, Button, Field, TextInput, Typography } from '@strapi/design-system';

type SettingsResponseData = {
  stored: {
    apiUrl: string;
    model: string;
    apiKeyMasked: string;
    apiKeySet: boolean;
  };
  env: {
    apiKeySet: boolean;
    apiUrlSet: boolean;
    modelSet: boolean;
  };
  effective: {
    apiUrl: string;
    apiUrlSource: 'env' | 'settings' | 'config' | 'default';
    model: string;
    modelSource: 'env' | 'settings' | 'config' | 'default';
    apiKeySet: boolean;
    apiKeySource: 'env' | 'settings' | 'config' | 'default';
  };
};

type SettingsResponse = {
  data: SettingsResponseData;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getErrorMessage(err: unknown): string {
  if (!isRecord(err)) {
    return '请求失败';
  }

  const response = err.response;
  if (!isRecord(response)) {
    return '请求失败';
  }

  const data = response.data;
  if (!isRecord(data)) {
    return '请求失败';
  }

  const error = data.error;
  if (!isRecord(error)) {
    return '请求失败';
  }

  const message = error.message;
  return typeof message === 'string' && message.trim().length > 0 ? message : '请求失败';
}

function formatSource(source: SettingsResponseData['effective']['apiUrlSource']): string {
  switch (source) {
    case 'env':
      return '环境变量';
    case 'settings':
      return 'Settings 页面';
    case 'config':
      return 'config/plugins.ts';
    case 'default':
      return '默认值';
    default:
      return '未知';
  }
}

export default function SettingsPage() {
  const fetchClient = useFetchClient();
  const { toggleNotification } = useNotification();

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [settings, setSettings] = useState<SettingsResponseData | null>(null);

  const [apiUrl, setApiUrl] = useState('');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');

  const envWarning = useMemo(() => {
    if (!settings) {
      return null;
    }

    const warnings: string[] = [];

    if (settings.env.apiKeySet) {
      warnings.push('检测到环境变量 AI_TRANSLATE_API_KEY：Settings 页面里保存的 API Key 不会生效。');
    }
    if (settings.env.apiUrlSet) {
      warnings.push('检测到环境变量 AI_TRANSLATE_API_URL：Settings 页面里保存的 API 端点不会生效。');
    }
    if (settings.env.modelSet) {
      warnings.push('检测到环境变量 AI_TRANSLATE_MODEL：Settings 页面里保存的模型名不会生效。');
    }

    return warnings.length > 0 ? warnings.join('\n') : null;
  }, [settings]);

  const load = useCallback(async function load() {
    setIsLoading(true);
    setError(null);

    try {
      const response = (await fetchClient.get('/ai-translate/settings')) as SettingsResponse;
      const data = response?.data;

      if (!data || typeof data !== 'object' || !('stored' in data)) {
        throw new Error('返回数据格式不正确');
      }

      setSettings(data);
      setApiUrl(data.stored.apiUrl ?? '');
      setModel(data.stored.model ?? '');
      setApiKey('');
    } catch (err: unknown) {
      setError(getErrorMessage(err) || (err instanceof Error ? err.message : '读取设置失败'));
    } finally {
      setIsLoading(false);
    }
  }, [fetchClient]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSave = useCallback(async function handleSave() {
    setIsSaving(true);
    setError(null);

    try {
      const payload: Record<string, unknown> = {
        apiUrl,
        model,
      };

      if (apiKey.trim().length > 0) {
        payload.apiKey = apiKey.trim();
      }

      await fetchClient.put('/ai-translate/settings', payload);

      toggleNotification({
        type: 'success',
        message: '设置已保存',
      });

      await load();
    } catch (err: unknown) {
      toggleNotification({
        type: 'danger',
        message: '保存失败',
      });
      setError(getErrorMessage(err) || (err instanceof Error ? err.message : '保存失败'));
    } finally {
      setIsSaving(false);
    }
  }, [apiKey, apiUrl, fetchClient, load, model, toggleNotification]);

  const handleClearApiKey = useCallback(async function handleClearApiKey() {
    setIsSaving(true);
    setError(null);

    try {
      await fetchClient.put('/ai-translate/settings', { apiKey: '' });

      toggleNotification({
        type: 'success',
        message: 'API Key 已清除',
      });

      await load();
    } catch (err: unknown) {
      toggleNotification({
        type: 'danger',
        message: '清除失败',
      });
      setError(getErrorMessage(err) || (err instanceof Error ? err.message : '清除失败'));
    } finally {
      setIsSaving(false);
    }
  }, [fetchClient, load, toggleNotification]);

  if (isLoading) {
    return <Page.Loading />;
  }

  return (
    <Page.Main tabIndex={-1}>
      <Layouts.Header
        title="AI Translate"
        subtitle="配置翻译服务（API Key / 模型 / API 端点）"
        primaryAction={
          <Button loading={isSaving} onClick={handleSave} disabled={isSaving}>
            保存
          </Button>
        }
      />
      <Layouts.Content>
        <Box paddingBottom={4}>
          <Typography variant="epsilon" textColor="neutral600">
            注意：将 API Key 保存到数据库会降低密钥安全性。生产环境建议使用环境变量（AI_TRANSLATE_API_KEY）。
          </Typography>
        </Box>

        {envWarning && (
          <Box paddingBottom={4}>
            <Alert closeLabel="Close" title="环境变量覆盖" variant="warning">
              <Typography style={{ whiteSpace: 'pre-line' }}>{envWarning}</Typography>
            </Alert>
          </Box>
        )}

        {error && (
          <Box paddingBottom={4}>
            <Alert closeLabel="Close" title="错误" variant="danger" onClose={() => setError(null)}>
              {error}
            </Alert>
          </Box>
        )}

        <Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
          <Box paddingBottom={4}>
            <Typography variant="delta">连接设置</Typography>
          </Box>

          <Box paddingBottom={4}>
            <Field.Root name="apiUrl">
              <Field.Label>API 端点（baseURL）</Field.Label>
              <TextInput
                placeholder="例如：https://api.openai.com/v1"
                value={apiUrl}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiUrl(e.target.value)}
              />
              <Field.Hint>
                留空表示使用 SDK 默认值；如果你使用代理/转发服务，请填入对应的 OpenAI-compatible baseURL。
              </Field.Hint>
            </Field.Root>
          </Box>

          <Box paddingBottom={4}>
            <Field.Root name="model">
              <Field.Label>模型名称</Field.Label>
              <TextInput
                placeholder="例如：gpt-4o-mini"
                value={model}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setModel(e.target.value)}
              />
              <Field.Hint>留空则使用默认模型（gpt-4o-mini）。</Field.Hint>
            </Field.Root>
          </Box>

          <Box paddingBottom={4}>
            <Field.Root name="apiKey">
              <Field.Label>API Key</Field.Label>
              <TextInput
                type="password"
                placeholder={settings?.stored.apiKeySet ? `已配置：${settings.stored.apiKeyMasked}` : '未配置'}
                value={apiKey}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setApiKey(e.target.value)}
              />
              <Field.Hint>
                不输入则保持现有值不变；如需修改请输入新的 key。你也可以点击下面的“清除 API Key”。
              </Field.Hint>
            </Field.Root>
          </Box>

          <Box paddingTop={2}>
            <Button variant="danger-light" onClick={handleClearApiKey} disabled={isSaving}>
              清除 API Key
            </Button>
          </Box>
        </Box>

        {settings && (
          <Box paddingTop={6}>
            <Box background="neutral0" padding={6} shadow="filterShadow" hasRadius>
              <Box paddingBottom={4}>
                <Typography variant="delta">当前生效配置</Typography>
              </Box>
              <Typography variant="epsilon" textColor="neutral700">
                API 端点：{settings.effective.apiUrl || '默认'}（来源：{formatSource(settings.effective.apiUrlSource)}）
              </Typography>
              <Typography variant="epsilon" textColor="neutral700">
                模型：{settings.effective.model}（来源：{formatSource(settings.effective.modelSource)}）
              </Typography>
              <Typography variant="epsilon" textColor="neutral700">
                API Key：{settings.effective.apiKeySet ? `已配置（来源：${formatSource(settings.effective.apiKeySource)}）` : '未配置'}
              </Typography>
            </Box>
          </Box>
        )}
      </Layouts.Content>
    </Page.Main>
  );
}

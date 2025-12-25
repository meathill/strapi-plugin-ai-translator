import React from 'react';
import pluginPkg from '../../package.json';
import pluginId from './pluginId';
import Initializer from './components/Initializer';
import EditViewRightLinks from './components/EditViewRightLinks';

const name = pluginPkg.strapi.name;

type TradOptions = Record<string, string>;

type SidePanelDefinition = {
  title: string;
  content: React.ReactNode;
};

type SidePanelComponent = (props: unknown) => SidePanelDefinition;

type ContentManagerPlugin = {
  apis?: {
    addEditViewSidePanel?: (panels: SidePanelComponent[]) => void;
  };
  injectComponent?: (
    view: string,
    zone: string,
    component: { name: string; Component: React.ComponentType }
  ) => void;
};

type StrapiAdminApp = {
  addSettingsLink?: (
    sectionId: string,
    link: {
      id: string;
      to: string;
      intlLabel: { id: string; defaultMessage: string };
      permissions: unknown[];
      Component: () => Promise<{ default: React.ComponentType }>;
    }
  ) => void;
  registerPlugin: (plugin: {
    id: string;
    initializer: React.ComponentType;
    isReady: boolean;
    name: string;
  }) => void;
  getPlugin: (pluginId: string) => unknown;
  locales: string[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function prefixPluginTranslations(trad: TradOptions, currentPluginId: string): TradOptions {
  if (!currentPluginId) {
    throw new TypeError("pluginId can't be empty");
  }

  return Object.keys(trad).reduce((acc, currentKey) => {
    acc[`${currentPluginId}.${currentKey}`] = trad[currentKey];
    return acc;
  }, {} as TradOptions);
}

function isDebugEnabled(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  try {
    return window.localStorage.getItem('ai-translate:debug') === '1';
  } catch {
    return false;
  }
}

function debugLog(message: string, details?: unknown) {
  if (!isDebugEnabled()) {
    return;
  }
  // eslint-disable-next-line no-console
  console.info(`[${pluginId}] ${message}`, details);
}

const AiTranslateSidePanel: SidePanelComponent = () => {
  return {
    title: 'AI Translate',
    content: <EditViewRightLinks />,
  };
};

async function importTranslationsForLocale(locale: string): Promise<TradOptions> {
  try {
    const { default: data } = await import(`./translations/${locale}.json`);
    return data as TradOptions;
  } catch {
    // fallback
  }

  const baseLocale = locale.split('-')[0];
  if (baseLocale && baseLocale !== locale) {
    try {
      const { default: data } = await import(`./translations/${baseLocale}.json`);
      return data as TradOptions;
    } catch {
      // ignore
    }
  }

  return {};
}

export default {
  register(app: unknown) {
    if (!isRecord(app) || typeof app.registerPlugin !== 'function') {
      return;
    }

    (app as StrapiAdminApp).registerPlugin({
      id: pluginId,
      initializer: Initializer,
      isReady: false,
      name,
    });

    const addSettingsLink = (app as StrapiAdminApp).addSettingsLink;
    if (typeof addSettingsLink === 'function') {
      addSettingsLink('global', {
        id: 'ai-translate-settings',
        to: 'ai-translate',
        intlLabel: {
          id: `${pluginId}.settings.title`,
          defaultMessage: 'AI Translate',
        },
        permissions: [],
        async Component() {
          const { default: SettingsPage } = await import('./pages/settings-page');
          return { default: SettingsPage };
        },
      });
      debugLog('已添加 Settings 链接');
    }

    debugLog('已注册插件');
  },

  bootstrap(app: unknown) {
    if (!isRecord(app) || typeof app.getPlugin !== 'function') {
      return;
    }

    const cm = (app as StrapiAdminApp).getPlugin('content-manager');
    if (!isRecord(cm)) {
      debugLog('未找到 content-manager 插件');
      return;
    }

    const addEditViewSidePanel = (cm as ContentManagerPlugin).apis?.addEditViewSidePanel;
    if (typeof addEditViewSidePanel === 'function') {
      addEditViewSidePanel([AiTranslateSidePanel]);
      debugLog('已通过 addEditViewSidePanel 注入侧边栏面板');
      return;
    }

    const injectComponent = (cm as ContentManagerPlugin).injectComponent;
    if (typeof injectComponent === 'function') {
      injectComponent('editView', 'right-links', {
        name: 'ai-translate-button',
        Component: EditViewRightLinks,
      });
      debugLog('已通过 injectComponent 注入 editView.right-links');
      return;
    }

    // eslint-disable-next-line no-console
    console.warn(
      `[${pluginId}] 无法注入到 Content Manager：未找到 addEditViewSidePanel/injectComponent（可在浏览器 localStorage 设置 ai-translate:debug=1 查看更多信息）`
    );
  },

  async registerTrads(app: unknown) {
    if (!isRecord(app)) {
      return Promise.resolve([]);
    }

    const locales = Array.isArray((app as StrapiAdminApp).locales)
      ? (app as StrapiAdminApp).locales
      : [];

    const importedTrads = await Promise.all(
      locales
        .filter((locale): locale is string => typeof locale === 'string')
        .map(async (locale) => {
          const data = await importTranslationsForLocale(locale);
          return {
            data: prefixPluginTranslations(data, pluginId),
            locale,
          };
        })
    );

    return Promise.resolve(importedTrads);
  },
};

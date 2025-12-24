'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DIST_SERVER_PATH = path.join(__dirname, 'dist', 'strapi-server.js');
const FORCE_TS = process.env.AI_TRANSLATE_FORCE_TS === '1';

function getDefaultExport(mod) {
  return mod && mod.__esModule ? mod.default : mod;
}

function loadPluginFactory() {
  // 默认优先使用构建产物（dist），避免 TS 运行时编译带来的不确定性。
  // 如果你希望继续直接运行 TS（无需每次改动都构建），启动时设置：AI_TRANSLATE_FORCE_TS=1
  if (!FORCE_TS && fs.existsSync(DIST_SERVER_PATH)) {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(DIST_SERVER_PATH);
    return getDefaultExport(mod);
  }

  // Strapi v5 插件加载器只会读取 `.js`（默认 `./strapi-server.js`），不会直接加载 `.ts`
  // 这里用 Strapi 自带的依赖 esbuild-register 来支持 require TS。
  const strapiPackageJsonPath = require.resolve('@strapi/strapi/package.json');
  const strapiRoot = path.dirname(strapiPackageJsonPath);

  const esbuildRegisterPath = require.resolve('esbuild-register/dist/node', {
    paths: [strapiRoot],
  });

  const { register } = require(esbuildRegisterPath);
  const { unregister } = register({
    extensions: ['.js', '.mjs', '.ts'],
  });

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('./strapi-server.ts');

  unregister();

  return getDefaultExport(mod);
}

module.exports = loadPluginFactory();

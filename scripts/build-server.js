'use strict';

const fs = require('node:fs');
const path = require('node:path');

function getPluginRoot() {
  return path.resolve(__dirname, '..');
}

function resolveEsbuild() {
  try {
    // 如果项目里直接可用，优先使用（更符合用户环境）
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('esbuild');
  } catch {
    // 兜底：从 Strapi 的依赖里解析（pnpm 下更稳）
    const strapiPackageJsonPath = require.resolve('@strapi/strapi/package.json');
    const strapiRoot = path.dirname(strapiPackageJsonPath);

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require(require.resolve('esbuild', { paths: [strapiRoot] }));
  }
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    watch: args.has('--watch'),
  };
}

async function buildOnce(esbuild, entryFile, outFile) {
  await esbuild.build({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    sourcemap: true,
    logLevel: 'info',
    external: ['@strapi/strapi', 'openai'],
  });
}

async function buildWatch(esbuild, entryFile, outFile) {
  const context = await esbuild.context({
    entryPoints: [entryFile],
    outfile: outFile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: ['node18'],
    sourcemap: true,
    logLevel: 'info',
    external: ['@strapi/strapi', 'openai'],
  });

  await context.watch();
  // 保持进程不退出：watch 模式用于本地开发
  // eslint-disable-next-line no-console
  console.log('[ai-translate] 已进入 watch 模式：修改 server 代码会自动重建 dist/strapi-server.js');
}

async function main() {
  const args = parseArgs(process.argv);

  const pluginRoot = getPluginRoot();
  const entryFile = path.join(pluginRoot, 'strapi-server.ts');
  const outDir = path.join(pluginRoot, 'dist');
  const outFile = path.join(outDir, 'strapi-server.js');

  if (!fs.existsSync(entryFile)) {
    throw new Error(`找不到入口文件：${entryFile}`);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const esbuild = resolveEsbuild();

  if (args.watch) {
    await buildWatch(esbuild, entryFile, outFile);
    return;
  }

  await buildOnce(esbuild, entryFile, outFile);
  // eslint-disable-next-line no-console
  console.log('[ai-translate] 构建完成：', path.relative(process.cwd(), outFile));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[ai-translate] 构建失败：', err);
  process.exitCode = 1;
});

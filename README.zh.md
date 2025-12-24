# Strapi AI 智能翻译插件 (AI Translate)

这是一个专为 Strapi v5 设计的插件，通过 AI 大模型（使用 OpenAI 官方 SDK 及兼容接口）帮助你在内容管理器（Content Manager）中一键将内容翻译成多种语言。

## 功能特性

- **无缝集成**：在启用国际化（i18n）的内容编辑页面侧边栏，自动添加“AI 翻译”按钮。
- **从源语言拉取内容**：在目标语言编辑页选择“源语言”，插件会读取源语言版本的内容并翻译后回填（适用于新建 localization 为空的场景）。
- **支持组件/重复组件/Blocks**：按 schema 递归提取可翻译文本并回填，尽量不破坏结构。
- **支持自定义 Prompt**：你可以输入额外的指令，例如“使用正式语气”、“技术术语保留英文”等。
- **安全默认值**：默认只填充空字段，不自动写库；最终由你点击 Save 保存。
- **灵活的后端支持**：原生支持 OpenAI 官方模型（如 GPT-3.5, GPT-4, GPT-5.2），也支持任何兼容 OpenAI 格式的第三方 API 转发服务。

## 安装指南

### 1. 安装依赖

在你的 Strapi 项目根目录下：

```bash
# 如果是从本地文件夹安装（开发模式）
pnpm add ./src/plugins/ai-translate 

# 或者如果已经发布到 npm
pnpm add strapi-plugin-ai-translate
```

> **注意**：Strapi v5 内置 i18n（`@strapi/i18n`）。本插件仅在内容类型启用 i18n 后才会显示入口。

### 2. 启用插件

在 Strapi 的配置文件 `config/plugins.ts` 中注册：

```typescript
export default ({ env }) => ({
  // ... 其他插件配置
  'ai-translate': {
    enabled: true,
    resolve: './src/plugins/ai-translate', // 如果是从 npm 安装，请删除此行
    config: {
      // 你可以在这里设置配置，但建议使用环境变量来管理密钥
    }
  },
});
```

### 3. 配置环境变量

在项目根目录的 `.env` 文件中配置 AI 服务信息：

```env
# 必填：你的 AI 接口密钥
AI_TRANSLATE_API_KEY=sk-your-api-key-here

# 选填：自定义 API 请求地址（默认为 OpenAI 官方地址）
# 如果你使用代理或其他兼容服务（如 Azure, 智谱 AI, DeepSeek 等），请修改此项
# AI_TRANSLATE_API_URL=https://api.openai.com/v1

# 选填：指定模型（默认为 gpt-4o-mini）
AI_TRANSLATE_MODEL=gpt-4o-mini
```

### 4. 在后台 Settings 页面配置（可选）

你也可以在 Strapi Admin 的 **Settings → Global → AI Translate** 中配置：

- API Key
- 模型名称
- API 端点（baseURL）

说明：

- 这些设置会保存到 Strapi 的数据库（core store）。
- **环境变量优先**：如果你设置了 `AI_TRANSLATE_API_KEY / AI_TRANSLATE_API_URL / AI_TRANSLATE_MODEL`，Settings 页面里保存的值会被覆盖。
- 生产环境建议使用环境变量管理密钥，不建议在后台保存 API Key。

## 使用方法

1. 进入 **内容管理器 (Content Manager)**。
2. 打开一个已启用 **多语言 (i18n)** 的内容条目。
3. 切换到你想要的 **目标语言版本（locale）**（如果还没有该语言版本，请先在右上角 i18n 面板创建）。
4. 在右侧侧边栏中找到 **"AI Translate"** 按钮，点击打开对话框。
5. 选择 **源语言**（通常选择默认语言或内容最完整的语言版本）。
6. （可选）设置：
   - **覆盖已有字段**：默认只填充空字段，避免覆盖你手工编辑的内容。
   - **包含 JSON 字段**：默认关闭，避免误翻译配置/代码类 JSON。
7. （可选）填写自定义指令（Prompt）。
8. 点击 **翻译并回填**。
9. 检查翻译结果并点击 **Save** 保存。

## 开发与独立发布

### 本地开发

1. 启动 Strapi 的开发模式并开启 Admin 监听：`pnpm dev -- --watch-admin`。
2. 直接修改 `src/plugins/ai-translate` 下的文件。
3. 所有的服务端代码修改会自动重启应用，前端代码修改会触发热重载。

### 最小化测试

本插件包含一个不依赖 Strapi 运行时的最小测试，用于验证“按 schema 递归提取可翻译文本 + 回填”的逻辑：

```bash
node --test src/plugins/ai-translate/server/utils/segments.test.ts
```

### 独立打包发布

如果你希望将此插件发布到 NPM 供他人使用：

1. **准备工作**：检查 `package.json` 中的 `name`, `version`, `description`, `author` 等信息是否正确。
2. **构建代码**：
   - 建议在插件目录下配置 TypeScript 编译。
   - Strapi 插件通常以源码形式发布，但为了兼容性，建议包含 `dist` 目录。
3. **执行发布**：
   ```bash
   cd src/plugins/ai-translate
   npm publish --access public
   ```

## 常见问题排查

- **看不到 “AI Translate” 按钮/面板**：
  1) 确认你在 **Content Manager 的条目编辑页**（不是 Content-Type Builder），右侧通常能看到 i18n 的 locale 切换。
  2) 确认该 Content Type 已启用 **Internationalization (i18n)**。
  3) 确认你是在项目的 `container_src/` 目录下启动 Strapi，并重建 Admin：`pnpm dev -- --watch-admin`。
  4) 如仍无效，清理缓存后再启动：删除 `container_src/.tmp`、`container_src/.cache`、`container_src/dist`。
  5) 开启前端调试：浏览器控制台执行 `localStorage.setItem('ai-translate:debug','1')`，刷新后查看控制台是否打印 `[ai-translate] 已通过 addEditViewSidePanel 注入侧边栏面板`。
- **提示“未找到源语言版本”**：请确认该条目在源语言下已经存在并已保存（draft 也可以）。
- **401/403 错误**：请检查 `.env` 中的 `AI_TRANSLATE_API_KEY` 是否配置正确。
- **JSON 解析失败**：AI 返回的内容可能包含了 Markdown 格式。插件已经处理了常见的代码块包装，如果依然失败，请尝试使用更先进的模型或精简自定义 Prompt。
- **翻译请求报 404（Not Found）或一直失败**：
  1) 先在 **Settings → Global → AI Translate** 查看“当前生效配置”，确认是否被环境变量覆盖。
  2) 如果你使用了代理/转发服务，确保它支持 OpenAI-compatible 的 `POST /v1/chat/completions`（本插件目前使用 chat.completions）。
  3) 确保你配置的 baseURL 包含 `/v1`（例如 `https://api.openai.com/v1`）。
  4) 如果你把 baseURL 指到一个不支持 chat 接口的服务，常见表现就是 AI 请求被打成 404。

- **后端改了代码但接口没变化**：
  1) 重启 Strapi（仅重建 Admin 不会刷新后端路由）。
  2) 如果你使用了 dist（推荐）：运行 `pnpm -C container_src build:ai-translate` 后再重启。
  3) 开发期可用 `pnpm -C container_src build:ai-translate:watch` 自动重建 dist。

- **探活接口**：`GET /ai-translate/health` 应返回 `{ ok: true }`。若 404，通常表示插件服务端未被加载或未重启。

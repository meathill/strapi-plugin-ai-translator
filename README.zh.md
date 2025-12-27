# AI 翻译（Strapi v5）

把 Strapi i18n 条目一键翻译成其他语言——直接在 Content Manager 里完成。

## 为什么你会喜欢

- **在编辑器里完成翻译**：右侧边栏一键翻译，不用复制粘贴到外部工具。
- **默认更安全**：只回填表单（不会自动保存）；默认只填充空字段，避免覆盖你手工改过的内容。
- **结构感知**：支持 **组件 / 重复组件 / Blocks** 等嵌套结构的递归翻译。
- **媒体友好**：自动复制源语言中的媒体字段（图片/文件），减少手动重新关联；并翻译媒体的 **alt（alternativeText）/caption**。
- **可中断/可继续（缓存 + 分批 + 自动续跑）**：
  - 自动分批翻译（每批约 **5000 字符**），更不容易触发超时。
  - 每批翻译完成后都会**写入缓存**（Strapi store / 数据库），因此你可以**随时停止**，之后**继续翻译**。
  - 如果中途失败也不用重来：再次发起翻译会复用已完成的批次（更省时间，也更省钱）。
- **多 Provider 支持**：
  - **OpenAI 兼容接口**（Chat Completions）
  - **Replicate**（官方 SDK）
- **后台界面多语言**：默认英文，跟随 Strapi Admin 语言设置（English / 中文）。

## 即将支持（开发中）

- **图片翻译**（WIP）
- **向作者购买 Token**（WIP）

## 快速开始

### 1）安装

```bash
pnpm add strapi-plugin-ai-translate
```

### 2）启用插件

在 `config/plugins.ts` 中：

```ts
export default () => ({
  'ai-translate': {
    enabled: true,
  },
});
```

然后重启 Strapi（必要时重建 Admin 面板）。

### 3）配置

在 Strapi Admin：**Settings → Global → AI Translate**

- 选择 **Provider**（OpenAI 兼容 / Replicate）
- 设置 **API Key / Token**
- （可选）设置 **模型名** 与 **API 端点（baseURL）**

> 生产环境建议使用环境变量管理密钥。出于安全考虑，服务端不会返回密钥内容，只会返回“是否已配置”和“长度”。

## 使用方法

1. 打开 **内容管理器（Content Manager）**
2. 打开一个已启用 **i18n** 的内容条目
3. 切换到你要填充的 **目标语言（target locale）**
4. 右侧边栏打开 **AI Translate / AI 翻译**
5. 选择 **源语言（source locale）**，可选填写指令，然后点击 **翻译并回填**
6. 检查结果后点击 **保存（Save）**

## 缓存与继续（重要）

为了让大内容翻译更稳定（也为后续“图片翻译”等长耗时能力做准备），本插件内置了**持久化缓存**：

- **缓存存在哪里**：Strapi 的 `store`（数据库）。
- **缓存的是什么**：翻译后的文本片段（不是 API key）。
- **带来的好处**：可中断/可继续；失败后重试会复用已完成批次。

如果你的内容比较敏感，请评估是否接受把翻译后的文本写入数据库；缓存清理相关说明见 `DEPLOYMENT.md`。

你可以在 **Settings → Global → AI Translate** 中一键清空翻译缓存。

## 支持作者

如果这个插件帮到了你，欢迎请我喝杯咖啡：

- https://buymeacoffee.com/meathill

![Buy Me a Coffee 二维码](./qr-code.png)

## 文档（面向贡献者/维护者）

- 测试说明：`TESTING.md`
- 部署/发布说明：`DEPLOYMENT.md`

# AI Translate (Strapi v5)

Translate your Strapi i18n entries with AI — directly inside the Content Manager.

## Why you’ll like it

- **In-editor workflow**: translate from the entry edit view (right sidebar), no copy/paste.
- **Safe by default**: fills the form only (does not auto-save). By default, it only fills empty fields.
- **Structure-aware**: handles nested fields such as **components / repeatable components / Blocks**.
- **Long content friendly**: auto-batches translation requests (≈ **5000 chars per batch**).
- **Multiple AI providers**:
  - **OpenAI-compatible** (Chat Completions)
  - **Replicate** (official SDK)
- **Admin UI i18n**: English by default, follows Strapi Admin language (English / 中文).

## Coming soon

- **Image translation** (WIP)
- **Buy tokens from the author** (WIP)

## Quick start

### 1) Install

```bash
pnpm add strapi-plugin-ai-translate
```

### 2) Enable the plugin

In `config/plugins.ts`:

```ts
export default () => ({
  'ai-translate': {
    enabled: true,
  },
});
```

Restart Strapi (and rebuild the admin panel if needed).

### 3) Configure

In Strapi Admin: **Settings → Global → AI Translate**

- Choose **Provider** (OpenAI-compatible / Replicate)
- Set **API Key / Token**
- (Optional) set **Model** and **API endpoint (baseURL)**

> For production, environment variables are recommended. The server will never return the secret value — only whether it’s configured and its length.

## How to use

1. Open **Content Manager**
2. Open an entry in a Content Type with **i18n enabled**
3. Switch to the **target locale** you want to fill
4. In the right sidebar, open **AI Translate**
5. Pick a **source locale**, optionally add instructions, then click **Translate & fill**
6. Review the changes and click **Save**

## Support

If this plugin helps you, consider buying me a coffee:

- https://buymeacoffee.com/meathill

![Buy Me a Coffee QR code](./qr-code.png)

## Docs (for contributors)

- Testing guide: `TESTING.md`
- Deployment / publish guide: `DEPLOYMENT.md`

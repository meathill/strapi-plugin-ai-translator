# Strapi Plugin AI Translate

A Strapi v5 plugin that leverages AI (via OpenAI-compatible APIs) to automatically translate your content into different languages directly from the Content Manager.

## Features

- **Seamless Integration**: Adds a "AI Translate" button to the Edit View sidebar of any Content Type with i18n enabled.
- **Source-locale powered**: Pick a source locale and translate into the currently edited locale (works even when the target localization is empty).
- **Schema-aware recursion**: Traverses components / repeatable components / Blocks to translate nested text without breaking structures.
- **Customizable**: Allows custom prompts for tone, style, or specific instructions.
- **Safe by default**: Fills the form (does not auto-save); by default only fills empty fields.
- **Flexible Backend**: Compatible with OpenAI (GPT-3.5, GPT-4, GPT-5.2) and other OpenAI-compatible APIs.

## Installation

### 1. Install Dependencies

In your Strapi project root:

```bash
# If you are installing from a local folder (development)
pnpm add ./src/plugins/ai-translate 
# OR if you published it to npm
pnpm add strapi-plugin-ai-translate
```

> **Note**: Strapi v5 ships with i18n (`@strapi/i18n`). This plugin only shows up for content-types with i18n enabled.

### 2. Enable the Plugin

Add the plugin configuration to `config/plugins.ts`:

```typescript
export default ({ env }) => ({
  // ... other plugins
  'ai-translate': {
    enabled: true,
    resolve: './src/plugins/ai-translate', // Or remove this line if installed from npm
    config: {
      // Optional: You can set config here, but Environment Variables are recommended for secrets
      // apiKey: env('AI_TRANSLATE_API_KEY'),
    }
  },
});
```

### 3. Configuration

You must configure the AI provider credentials. The recommended way is using a `.env` file in your Strapi project root:

```env
# Required: Your API Key
AI_TRANSLATE_API_KEY=sk-your-api-key-here

# Optional: Custom API URL (defaults to OpenAI)
# Use this for proxies or other providers like Azure, local LLMs, etc.
# AI_TRANSLATE_API_URL=https://api.openai.com/v1

# Optional: Model selection (defaults to gpt-4o-mini)
AI_TRANSLATE_MODEL=gpt-4o-mini
```

### 4. Configure via Admin Settings (optional)

You can also configure the provider in Strapi Admin: **Settings → Global → AI Translate**.

Notes:

- These values are stored in Strapi core store (database).
- **Environment variables win**: `AI_TRANSLATE_API_KEY / AI_TRANSLATE_API_URL / AI_TRANSLATE_MODEL` will override the saved settings.
- For production, prefer environment variables for secrets.

## Usage

1. Go to the **Content Manager**.
2. Create or Edit an entry for a Content Type that has **Internationalization (i18n)** enabled.
3. Switch to the **target locale** you want to fill (create the localization first if needed).
4. In the right-hand sidebar, click **"AI Translate"**.
5. Select a **source locale** (usually your default locale).
6. (Optional) Toggle:
   - **Overwrite existing fields** (default is off)
   - **Include JSON fields** (default is off)
7. (Optional) Add custom instructions.
8. Click **Translate & fill**.
9. Review and save your entry.

## Development & Publishing

### Local Development

1. Run Strapi in watch mode: `pnpm dev -- --watch-admin`.
2. Edit files in `src/plugins/ai-translate`.
3. The admin panel should rebuild automatically (or you may need to restart the server for server-side changes).

### Testing (minimal)

This plugin includes a small, Strapi-independent test for the schema traversal & patching logic:

```bash
node --test src/plugins/ai-translate/server/utils/segments.test.ts
```

### Packaging for NPM

To share this plugin with the community or use it in other projects:

1. **Prepare**: Ensure `package.json` fields (name, version, description, author) are correct.
2. **Build**: Run the build command inside the plugin folder (if you added a build script) or ensure your Strapi build process handles it. 
   *Usually, Strapi plugins are published as source, but compiling TypeScript to `dist` is recommended for wider compatibility.*
   
   To setup a build process for the plugin independently:
   - Add `@strapi/typescript-utils` and `typescript` to devDependencies.
   - Add a `build` script: "build": "tsc".
   - Ensure `tsconfig.json` exists.

3. **Publish**:
   ```bash
   cd src/plugins/ai-translate
   npm publish --access public
   ```

### Troubleshooting

- **Can't see the “AI Translate” button/panel**:
  1) Make sure you're in the **Content Manager entry edit view** (not the Content-Type Builder).
  2) Ensure the Content Type has **i18n enabled**.
  3) Rebuild the admin: run `pnpm dev -- --watch-admin` from `container_src/`.
  4) If needed, clear caches and rebuild: remove `container_src/.tmp`, `container_src/.cache`, `container_src/dist`.
  5) Enable frontend debug: `localStorage.setItem('ai-translate:debug','1')`, refresh and check the browser console.
- **"Source locale not found"**: Ensure the entry exists in the source locale and has been saved (draft is fine).
- **401/403 Errors**: Check your `AI_TRANSLATE_API_KEY`.
- **JSON Parsing Error**: The AI model might have returned text that isn't valid JSON. Try a smarter model or refine the prompt.

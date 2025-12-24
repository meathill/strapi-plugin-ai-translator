import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applySegmentTranslations,
  collectTranslatableSegments,
  extractLocalizedTopLevelFields,
  type ComponentsDictionary,
  type Schema,
} from './segments.ts';

test('extractLocalizedTopLevelFields 只返回 localized=true 的顶层字段', () => {
  const schema: Schema = {
    pluginOptions: { i18n: { localized: true } },
    attributes: {
      title: { type: 'string', pluginOptions: { i18n: { localized: true } } },
      slug: { type: 'uid' },
      seo: { type: 'component', component: 'shared.seo', pluginOptions: { i18n: { localized: true } } },
      hasText2Image: { type: 'boolean', pluginOptions: { i18n: { localized: false } } },
    },
  };

  const data = {
    title: 'Hello',
    slug: 'hello',
    seo: { metaTitle: 'Hello', metaDescription: 'Desc', shareImage: { id: 1 } },
    hasText2Image: true,
  };

  assert.deepEqual(extractLocalizedTopLevelFields(schema, data), {
    title: 'Hello',
    seo: { metaTitle: 'Hello', metaDescription: 'Desc', shareImage: { id: 1 } },
  });
});

test('collectTranslatableSegments 支持组件/重复组件/blocks，并跳过 media 等非文本字段', () => {
  const schema: Schema = {
    pluginOptions: { i18n: { localized: true } },
    attributes: {
      title: { type: 'string', pluginOptions: { i18n: { localized: true } } },
      seo: { type: 'component', component: 'shared.seo', pluginOptions: { i18n: { localized: true } } },
      features: {
        type: 'component',
        component: 'features.feature-item',
        repeatable: true,
        pluginOptions: { i18n: { localized: true } },
      },
      contentBlocks: { type: 'blocks', pluginOptions: { i18n: { localized: true } } },
    },
  };

  const components: ComponentsDictionary = {
    'shared.seo': {
      attributes: {
        metaTitle: { type: 'string' },
        metaDescription: { type: 'text' },
        shareImage: { type: 'media' },
      },
    },
    'features.feature-item': {
      attributes: {
        title: { type: 'string' },
        content: { type: 'richtext' },
        icon: { type: 'media' },
      },
    },
  };

  const localizedData = {
    title: 'Hello',
    seo: { metaTitle: 'Meta', metaDescription: 'Desc', shareImage: { id: 1 } },
    features: [
      { title: 'A', content: 'A1', icon: { id: 2 } },
      { title: 'B', content: 'B1', icon: { id: 3 } },
    ],
    contentBlocks: [
      { type: 'paragraph', children: [{ text: 'Hello blocks' }] },
      { type: 'paragraph', children: [{ text: 'Second line' }] },
    ],
  };

  const segments = collectTranslatableSegments(schema, components, localizedData);
  const paths = segments.map((s) => s.path.join('.'));

  assert.ok(paths.includes('title'));
  assert.ok(paths.includes('seo.metaTitle'));
  assert.ok(paths.includes('seo.metaDescription'));
  assert.ok(paths.includes('features.0.title'));
  assert.ok(paths.includes('features.0.content'));
  assert.ok(paths.includes('features.1.title'));
  assert.ok(paths.includes('features.1.content'));
  assert.ok(paths.includes('contentBlocks.0.children.0.text'));
  assert.ok(paths.includes('contentBlocks.1.children.0.text'));

  // media 字段不应进入 segments
  assert.ok(!paths.some((p) => p.includes('shareImage')));
  assert.ok(!paths.some((p) => p.includes('icon')));
});

test('collectTranslatableSegments 默认不翻译 json 字段，includeJson=true 时才翻译', () => {
  const schema: Schema = {
    pluginOptions: { i18n: { localized: true } },
    attributes: {
      settings: { type: 'json', pluginOptions: { i18n: { localized: true } } },
    },
  };

  const components: ComponentsDictionary = {};

  const localizedData = {
    settings: {
      title: 'Hello',
      nested: { description: 'World' },
      list: ['A', 'B'],
    },
  };

  const segmentsDefault = collectTranslatableSegments(schema, components, localizedData, {
    includeJson: false,
  });
  assert.equal(segmentsDefault.length, 0);

  const segmentsIncluded = collectTranslatableSegments(schema, components, localizedData, {
    includeJson: true,
  });
  const paths = segmentsIncluded.map((s) => s.path.join('.'));

  assert.ok(paths.includes('settings.title'));
  assert.ok(paths.includes('settings.nested.description'));
  assert.ok(paths.includes('settings.list.0'));
  assert.ok(paths.includes('settings.list.1'));
});

test('applySegmentTranslations 能按 path 把翻译结果回填到原结构', () => {
  const localizedData = {
    title: 'Hello',
    seo: { metaTitle: 'Meta', metaDescription: 'Desc' },
  };

  const segments = [
    { id: '0', path: ['title'], text: 'Hello' },
    { id: '1', path: ['seo', 'metaTitle'], text: 'Meta' },
  ];

  const translated = applySegmentTranslations(localizedData, segments, {
    '0': '你好',
    '1': '元标题',
  });

  assert.deepEqual(translated, {
    title: '你好',
    seo: { metaTitle: '元标题', metaDescription: 'Desc' },
  });
});

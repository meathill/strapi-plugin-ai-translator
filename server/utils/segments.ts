export type PathSegment = string | number;
export type Path = PathSegment[];

type I18nPluginOptions = {
  i18n?: {
    localized?: boolean;
  };
};

export type Attribute =
  | {
      type:
        | 'string'
        | 'text'
        | 'richtext'
        | 'blocks'
        | 'json'
        | 'uid'
        | 'email'
        | 'enumeration'
        | 'boolean'
        | 'integer'
        | 'biginteger'
        | 'float'
        | 'decimal'
        | 'date'
        | 'datetime'
        | 'time'
        | 'media'
        | 'relation';
      pluginOptions?: I18nPluginOptions;
      [key: string]: unknown;
    }
  | {
      type: 'component';
      component: string;
      repeatable?: boolean;
      pluginOptions?: I18nPluginOptions;
      [key: string]: unknown;
    }
  | {
      type: 'dynamiczone';
      components: string[];
      pluginOptions?: I18nPluginOptions;
      [key: string]: unknown;
    };

export type Schema = {
  pluginOptions?: I18nPluginOptions;
  attributes?: Record<string, Attribute>;
};

export type ComponentsDictionary = Record<string, Schema | undefined>;

export type Segment = {
  id: string;
  path: Path;
  text: string;
};

export type CollectOptions = {
  includeJson?: boolean;
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  if (Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

export function isAttributeLocalized(attribute: Attribute | undefined): boolean {
  return attribute?.pluginOptions?.i18n?.localized === true;
}

export function extractLocalizedTopLevelFields(
  schema: Schema,
  data: Record<string, unknown>
): Record<string, unknown> {
  const attributes = schema.attributes ?? {};
  const result: Record<string, unknown> = {};

  for (const [key, attribute] of Object.entries(attributes)) {
    if (!isAttributeLocalized(attribute)) {
      continue;
    }
    if (!(key in data)) {
      continue;
    }
    result[key] = data[key];
  }

  return result;
}

export function collectTranslatableSegments(
  schema: Schema,
  components: ComponentsDictionary,
  localizedData: Record<string, unknown>,
  options: CollectOptions = {}
): Segment[] {
  const attributes = schema.attributes ?? {};
  const segments: Segment[] = [];
  let nextId = 0;

  function pushSegment(path: Path, text: string) {
    const trimmed = text.trim();
    if (trimmed.length === 0) {
      return;
    }
    segments.push({
      id: String(nextId),
      path,
      text,
    });
    nextId += 1;
  }

  function walkBlocks(value: unknown, basePath: Path) {
    if (typeof value === 'string') {
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walkBlocks(item, [...basePath, index]);
      });
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        const childPath = [...basePath, key];
        if (key === 'text' && typeof child === 'string') {
          pushSegment(childPath, child);
          continue;
        }
        walkBlocks(child, childPath);
      }
    }
  }

  function walkJson(value: unknown, basePath: Path) {
    if (typeof value === 'string') {
      pushSegment(basePath, value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => {
        walkJson(item, [...basePath, index]);
      });
      return;
    }
    if (isPlainObject(value)) {
      for (const [key, child] of Object.entries(value)) {
        walkJson(child, [...basePath, key]);
      }
    }
  }

  function walkByAttribute(attribute: Attribute, value: unknown, basePath: Path) {
    if (value === null || value === undefined) {
      return;
    }

    switch (attribute.type) {
      case 'string':
      case 'text':
      case 'richtext': {
        if (typeof value === 'string') {
          pushSegment(basePath, value);
        }
        return;
      }
      case 'blocks': {
        walkBlocks(value, basePath);
        return;
      }
      case 'json': {
        if (options.includeJson) {
          walkJson(value, basePath);
        }
        return;
      }
      case 'component': {
        const componentSchema = components[attribute.component];
        if (!componentSchema?.attributes) {
          return;
        }

        if (attribute.repeatable) {
          if (!Array.isArray(value)) {
            return;
          }
          value.forEach((item, index) => {
            walkSchema(componentSchema, item, [...basePath, index]);
          });
          return;
        }

        walkSchema(componentSchema, value, basePath);
        return;
      }
      case 'dynamiczone': {
        if (!Array.isArray(value)) {
          return;
        }
        value.forEach((item, index) => {
          if (!isPlainObject(item)) {
            return;
          }
          const componentUid = item.__component;
          if (typeof componentUid !== 'string') {
            return;
          }
          const componentSchema = components[componentUid];
          if (!componentSchema?.attributes) {
            return;
          }
          walkSchema(componentSchema, item, [...basePath, index]);
        });
        return;
      }
      default:
        return;
    }
  }

  function walkSchema(currentSchema: Schema, value: unknown, basePath: Path) {
    if (!isPlainObject(value)) {
      return;
    }
    const currentAttributes = currentSchema.attributes ?? {};
    for (const [key, attribute] of Object.entries(currentAttributes)) {
      const childValue = value[key];
      walkByAttribute(attribute, childValue, [...basePath, key]);
    }
  }

  for (const [key, attribute] of Object.entries(attributes)) {
    if (!isAttributeLocalized(attribute)) {
      continue;
    }
    walkByAttribute(attribute, localizedData[key], [key]);
  }

  return segments;
}

export function applySegmentTranslations<T extends Record<string, unknown>>(
  localizedData: T,
  segments: Segment[],
  translationsById: Record<string, string>
): T {
  const result = structuredClone(localizedData) as T;

  function getChild(container: unknown, key: PathSegment): unknown {
    if (Array.isArray(container) && typeof key === 'number') {
      return container[key];
    }
    if (isPlainObject(container) && typeof key === 'string') {
      return container[key];
    }
    return undefined;
  }

  function setChild(container: unknown, key: PathSegment, value: unknown): boolean {
    if (Array.isArray(container) && typeof key === 'number') {
      container[key] = value;
      return true;
    }
    if (isPlainObject(container) && typeof key === 'string') {
      container[key] = value;
      return true;
    }
    return false;
  }

  for (const segment of segments) {
    const translated = translationsById[segment.id];
    if (typeof translated !== 'string') {
      continue;
    }

    let current: unknown = result;
    for (let i = 0; i < segment.path.length - 1; i += 1) {
      const part = segment.path[i];
      current = getChild(current, part);
    }
    if (current === null || current === undefined) {
      continue;
    }
    const lastPart = segment.path[segment.path.length - 1];
    setChild(current, lastPart, translated);
  }

  return result;
}

import pluginId from '../pluginId';

export default function getTrad(key: string): string {
  return `${pluginId}.${key}`;
}

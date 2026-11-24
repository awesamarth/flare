/** In-memory MMKV for tests. */
export function createMMKV() {
  const data = new Map<string, string | number | boolean>();
  return {
    set: (key: string, value: string | number | boolean) =>
      data.set(key, value),
    getString: (key: string) => {
      const value = data.get(key);
      return typeof value === 'string' ? value : undefined;
    },
    remove: (key: string) => data.delete(key),
    clearAll: () => data.clear(),
  };
}

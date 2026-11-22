import { createMMKV } from 'react-native-mmkv';

/**
 * Photo bytes for chat, kept out of the chat history store so that stays
 * small. Oldest photos are evicted past the cap; the message then shows a
 * placeholder.
 */
const store = createMMKV({ id: 'flare-media' });
const INDEX_KEY = '__index';
const MAX_ITEMS = 40;

function readIndex(): string[] {
  try {
    const raw = store.getString(INDEX_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function putMedia(id: string, base64: string, mime: string) {
  store.set(id, `data:${mime};base64,${base64}`);
  const index = readIndex().filter(existing => existing !== id);
  index.push(id);
  while (index.length > MAX_ITEMS) {
    const old = index.shift();
    if (old) {
      store.remove(old);
    }
  }
  store.set(INDEX_KEY, JSON.stringify(index));
}

/** A data URI for <Image>, or undefined if evicted. */
export function getMedia(id: string): string | undefined {
  return store.getString(id);
}

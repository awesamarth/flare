import { DataStore } from '@offline-protocol/mesh-sdk';
import { createMMKV } from 'react-native-mmkv';
import { useGroups, type EventMap, type LngLatQuad } from '../state/groups';
import { useProfile } from '../state/profile';
import { useRuntime } from '../state/runtime';
import { FlareNative } from './native';

/**
 * The organiser's venue map, pinned over the street map.
 *
 * One member calibrates it; the corners and a reference to the image go in a
 * replicated group document, and the image bytes travel as a DataStore
 * attachment (pulled from a member who has them, at most 1 MiB in a group).
 * Every member that has the bytes serves them, so the map spreads even when
 * the person who set it is out of range.
 */
const DOC = 'eventmap';
const COLLECTION = 'overlay';
const KEY_IMAGE = 'image';
const KEY_META = 'meta';
export const MAX_EVENT_MAP_BYTES = 1024 * 1024;

const bytesStore = createMMKV({ id: 'flare-attachments' });
let store: DataStore | null = null;
const getStore = () => (store ??= new DataStore());

/** Members already asked for a hash, so a miss moves on to someone else. */
const asked = new Map<string, Set<string>>();

const byteLength = (base64: string) =>
  Math.floor((base64.length * 3) / 4) -
  (base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0);

const fileNameFor = (hash: string, mime: string) =>
  `eventmap-${hash.replace(/[^A-Za-z0-9]/g, '').slice(-48)}.${
    mime === 'image/png' ? 'png' : 'jpg'
  }`;

function parseCorners(value: unknown): LngLatQuad | null {
  if (!Array.isArray(value) || value.length !== 4) {
    return null;
  }
  for (const point of value) {
    if (
      !Array.isArray(point) ||
      point.length !== 2 ||
      typeof point[0] !== 'number' ||
      typeof point[1] !== 'number' ||
      Math.abs(point[0]) > 180 ||
      Math.abs(point[1]) > 90
    ) {
      return null;
    }
  }
  return value as LngLatQuad;
}

type Meta = {
  corners: LngLatQuad;
  by: string;
  byName?: string;
  ts: number;
  mime: string;
};

function parseMeta(raw: string): Meta | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const corners = parseCorners(v.corners);
    if (!corners || typeof v.by !== 'string' || typeof v.ts !== 'number') {
      return null;
    }
    return {
      corners,
      by: v.by,
      byName: typeof v.byName === 'string' ? v.byName.slice(0, 32) : undefined,
      ts: Math.min(v.ts, Date.now()),
      mime: v.mime === 'image/png' ? 'image/png' : 'image/jpeg',
    };
  } catch {
    return null;
  }
}

async function ensureFile(
  hash: string,
  mime: string,
): Promise<string | undefined> {
  const base64 = bytesStore.getString(hash);
  if (!base64 || !FlareNative) {
    return undefined;
  }
  const uri = await FlareNative.writeFile(fileNameFor(hash, mime), base64);
  return normalizeFileUri(uri);
}

/** MapLibre needs file:///path; some platforms hand back file:/path. */
export function normalizeFileUri(uri: string): string {
  return uri.replace(/^file:\/(?!\/)/, 'file:///');
}

function update(groupId: string, eventMap: EventMap | null) {
  if (useGroups.getState().groups[groupId]) {
    useGroups.getState().upsertGroup({ id: groupId, eventMap });
  }
}

/** Ask a member who might have the bytes, skipping ones already asked. */
async function requestBytes(groupId: string, hash: string, preferred: string) {
  const self = useProfile.getState().address;
  const group = useGroups.getState().groups[groupId];
  if (!group) {
    return;
  }
  const tried = asked.get(hash) ?? new Set<string>();
  asked.set(hash, tried);
  const neighbors = useRuntime.getState().neighbors;
  const candidates = [preferred, ...Object.keys(group.members)]
    .filter(a => a && a !== self && !tried.has(a))
    // Someone in direct range answers fastest.
    .sort((a, b) => Number(!!neighbors[b]) - Number(!!neighbors[a]));
  const next = candidates[0];
  if (!next) {
    return;
  }
  tried.add(next);
  await getStore().fetchAttachmentFrom(groupId, next, hash);
}

/** Pull the group's event map into the store, fetching the image if needed. */
export async function loadEventMap(groupId: string) {
  if (!useGroups.getState().groups[groupId]) {
    return;
  }
  try {
    const s = getStore();
    const metaValue = await s.mapGet(groupId, DOC, COLLECTION, KEY_META);
    const meta = metaValue?.kind === 'text' ? parseMeta(metaValue.value) : null;
    const image = await s.mapGet(groupId, DOC, COLLECTION, KEY_IMAGE);
    if (!meta || image?.kind !== 'attachment') {
      update(groupId, null);
      return;
    }
    const uri = await ensureFile(image.hash, meta.mime);
    update(groupId, { ...meta, hash: image.hash, uri });
    if (!uri) {
      await requestBytes(groupId, image.hash, meta.by);
    }
  } catch (error) {
    console.warn('[flare] could not read event map', error);
  }
}

export async function loadAllEventMaps() {
  for (const groupId of Object.keys(useGroups.getState().groups)) {
    await loadEventMap(groupId);
  }
}

/** Save a calibrated event map locally and share it with the group. */
export async function setEventMap(
  groupId: string,
  base64: string,
  mime: string,
  corners: LngLatQuad,
) {
  const size = byteLength(base64);
  if (size > MAX_EVENT_MAP_BYTES) {
    throw new Error(
      'That image is too large to share (over 1 MB). Try a smaller or cropped one.',
    );
  }
  if (!FlareNative) {
    throw new Error('File storage is unavailable on this build.');
  }
  const s = getStore();
  const hash = await s.attachmentHash(base64);
  bytesStore.set(hash, base64);
  const uri = await ensureFile(hash, mime);
  const { address, name } = useProfile.getState();
  const meta: Meta = {
    corners,
    by: address ?? '',
    byName: name ?? undefined,
    ts: Date.now(),
    mime,
  };
  await s.mapSet(groupId, DOC, COLLECTION, KEY_IMAGE, {
    kind: 'attachment',
    hash,
    size,
    name: fileNameFor(hash, mime),
    mime,
  });
  await s.mapSet(groupId, DOC, COLLECTION, KEY_META, {
    kind: 'text',
    value: JSON.stringify(meta),
  });
  await s.flush(groupId, DOC);
  update(groupId, { ...meta, hash, uri });
}

export async function clearEventMap(groupId: string) {
  const s = getStore();
  await s.mapDelete(groupId, DOC, COLLECTION, KEY_IMAGE);
  await s.mapDelete(groupId, DOC, COLLECTION, KEY_META);
  await s.flush(groupId, DOC);
  update(groupId, null);
}

// --- Event handlers, wired up in mesh.ts -----------------------------------

export function isEventMapDoc(docId: string) {
  return docId === DOC;
}

/** A member wants our copy of the bytes. */
export async function onAttachmentRequested(
  spaceId: string,
  peerId: string,
  hash: string,
) {
  const s = getStore();
  const base64 = bytesStore.getString(hash);
  if (base64 && useGroups.getState().groups[spaceId]) {
    await s.provideAttachment(spaceId, peerId, hash, base64);
  } else {
    await s.declineAttachment(spaceId, peerId, hash);
  }
}

export async function onAttachmentReceived(
  spaceId: string,
  hash: string,
  data: string,
) {
  const current = useGroups.getState().groups[spaceId]?.eventMap;
  if (!current || current.hash !== hash) {
    return;
  }
  bytesStore.set(hash, data);
  asked.delete(hash);
  const uri = await ensureFile(hash, current.mime);
  update(spaceId, { ...current, uri });
}

export async function onAttachmentUnavailable(spaceId: string, hash: string) {
  const current = useGroups.getState().groups[spaceId]?.eventMap;
  if (current && current.hash === hash && !current.uri) {
    await requestBytes(spaceId, hash, current.by);
  }
}

/** A peer came back in range: retry missing images. */
export function retryMissingEventMaps() {
  for (const [groupId, group] of Object.entries(useGroups.getState().groups)) {
    const map = group.eventMap;
    if (map && !map.uri) {
      asked.delete(map.hash);
      requestBytes(groupId, map.hash, map.by).catch(() => {});
    }
  }
}

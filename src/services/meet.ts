import { DataStore } from '@offline-protocol/mesh-sdk';
import { useGroups, type MeetPoint } from '../state/groups';
import { useProfile } from '../state/profile';
import { useRuntime } from '../state/runtime';

/**
 * The group's meeting point lives in a replicated document (space = group
 * id), so anyone who joins later, or was out of range when it was set, still
 * gets it when they next meet any member. Stored as one JSON value so it's
 * replaced whole (last writer wins) rather than merged field by field.
 */
const DOC = 'meet';
const COLLECTION = 'pin';
const KEY = 'current';

let store: DataStore | null = null;
const getStore = () => (store ??= new DataStore());

function parse(raw: string): MeetPoint | null {
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (
      typeof v.lat === 'number' &&
      typeof v.lon === 'number' &&
      Math.abs(v.lat) <= 90 &&
      Math.abs(v.lon) <= 180 &&
      typeof v.acc === 'number' &&
      typeof v.label === 'string' &&
      v.label.length <= 60 &&
      typeof v.by === 'string' &&
      typeof v.ts === 'number'
    ) {
      return {
        lat: v.lat,
        lon: v.lon,
        acc: v.acc,
        label: v.label,
        when: typeof v.when === 'string' ? v.when.slice(0, 30) : undefined,
        by: v.by,
        byName:
          typeof v.byName === 'string' ? v.byName.slice(0, 32) : undefined,
        ts: Math.min(v.ts, Date.now()),
      };
    }
  } catch {
    // Not ours or corrupt: treat as no meeting point.
  }
  return null;
}

/** Pull the latest meeting point for a group into the store. */
export async function loadMeet(groupId: string) {
  if (!useGroups.getState().groups[groupId]) {
    return;
  }
  try {
    const value = await getStore().mapGet(groupId, DOC, COLLECTION, KEY);
    const meet = value?.kind === 'text' ? parse(value.value) : null;
    useGroups.getState().upsertGroup({ id: groupId, meet });
  } catch (error) {
    console.warn('[flare] could not read meeting point', error);
  }
}

export async function loadAllMeets() {
  for (const groupId of Object.keys(useGroups.getState().groups)) {
    await loadMeet(groupId);
  }
}

/** Pin the meeting point where this phone is right now. */
export async function setMeetHere(
  groupId: string,
  label: string,
  when?: string,
) {
  const position = useRuntime.getState().position;
  if (!position) {
    throw new Error('No GPS fix yet. Wait for location, then try again.');
  }
  const { address, name } = useProfile.getState();
  const meet: MeetPoint = {
    lat: position.lat,
    lon: position.lon,
    acc: position.acc,
    label: label.trim().slice(0, 60) || 'Meeting point',
    when: when?.trim().slice(0, 30) || undefined,
    by: address ?? '',
    byName: name ?? undefined,
    ts: Date.now(),
  };
  await write(groupId, JSON.stringify(meet));
  useGroups.getState().upsertGroup({ id: groupId, meet });
}

export async function clearMeet(groupId: string) {
  await write(groupId, JSON.stringify({ cleared: true, ts: Date.now() }));
  useGroups.getState().upsertGroup({ id: groupId, meet: null });
}

async function write(groupId: string, json: string) {
  const s = getStore();
  await s.mapSet(groupId, DOC, COLLECTION, KEY, { kind: 'text', value: json });
  // Nothing replicates until flushed.
  await s.flush(groupId, DOC);
}

export const MEET_DOC = DOC;

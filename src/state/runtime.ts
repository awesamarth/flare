import { create } from 'zustand';
import { omitKey } from '../lib/omit';
import type { Proximity } from '../lib/proximity';
import type { LocationFix } from '../protocol/envelope';

export type MeshStatus =
  | 'idle'
  | 'starting'
  | 'running'
  | 'bluetooth_off'
  | 'permission_denied'
  | 'error';

export type Neighbor = {
  id: string;
  transport: string;
  rssi?: number;
  seenAt: number;
};

export type HeadingQuality = 'good' | 'fair' | 'poor';

export type HeadingReading = {
  /** Degrees clockwise from true north (magnetic if true north unknown). */
  deg: number;
  quality: HeadingQuality;
  ts: number;
};

export type Alert = {
  id: string;
  title: string;
  body: string;
  tone: 'info' | 'danger';
  /** Where tapping the alert should go. */
  target?: { groupId?: string; address?: string };
};

type RuntimeState = {
  meshStatus: MeshStatus;
  meshError?: string;
  neighbors: Record<string, Neighbor>;
  /** Live Bluetooth signal to linked peers, keyed by address. */
  proximity: Record<string, Proximity>;
  transport?: string;

  position?: LocationFix;
  locationStatus: 'idle' | 'waiting' | 'ok' | 'denied' | 'off' | 'error';
  heading?: HeadingReading;
  headingAvailable: boolean;
  /** "Allow all the time" granted, so location keeps sharing in a pocket. */
  backgroundLocation: boolean;

  alerts: Alert[];

  set: (patch: Partial<Omit<RuntimeState, 'set'>>) => void;
  upsertNeighbor: (neighbor: Neighbor) => void;
  removeNeighbor: (id: string) => void;
  setProximity: (id: string, p: Proximity) => void;
  pushAlert: (alert: Alert) => void;
  dismissAlert: (id: string) => void;
};

export const useRuntime = create<RuntimeState>()(set => ({
  meshStatus: 'idle',
  neighbors: {},
  proximity: {},
  locationStatus: 'idle',
  headingAvailable: true,
  backgroundLocation: false,
  alerts: [],

  set: patch => set(patch),
  upsertNeighbor: neighbor =>
    set(state => ({
      neighbors: { ...state.neighbors, [neighbor.id]: neighbor },
    })),
  removeNeighbor: id =>
    set(state => ({
      neighbors: omitKey(state.neighbors, id),
      proximity: omitKey(state.proximity, id),
    })),
  setProximity: (id, p) =>
    set(state => ({ proximity: { ...state.proximity, [id]: p } })),
  pushAlert: alert =>
    set(state => ({ alerts: [...state.alerts.slice(-4), alert] })),
  dismissAlert: id =>
    set(state => ({ alerts: state.alerts.filter(a => a.id !== id) })),
}));

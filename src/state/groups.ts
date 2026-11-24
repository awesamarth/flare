import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '../lib/storage';
import { omitKey } from '../lib/omit';
import type { LocationFix } from '../protocol/envelope';

export type SosState = {
  id: string;
  active: boolean;
  ts: number;
  loc?: LocationFix;
};

export type Member = {
  address: string;
  name?: string;
  color?: string;
  /** Latest location fix we have for them. */
  loc?: LocationFix;
  /** When we last received anything from them (our clock). */
  lastHeardAt?: number;
  sos?: SosState;
  /** They paused location sharing at this time (sender clock). */
  locPausedAt?: number;
};

/** A shared meeting point, synced to everyone in the group. */
export type MeetPoint = {
  lat: number;
  lon: number;
  acc: number;
  label: string;
  /** Free text, e.g. "11:30 pm". */
  when?: string;
  by: string;
  byName?: string;
  ts: number;
};

/** [lng, lat] for the image's top-left, top-right, bottom-right, bottom-left. */
export type LngLatQuad = [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
];

/** The organiser's venue map pinned over the street map, shared with the group. */
export type EventMap = {
  hash: string;
  mime: string;
  corners: LngLatQuad;
  by: string;
  byName?: string;
  ts: number;
  /** Local file:// URL once we hold the image bytes. */
  uri?: string;
};

export type JoinRequest = {
  address: string;
  name: string;
  color: string;
  requestedAt: number;
};

export type Group = {
  id: string;
  name: string;
  isAdmin: boolean;
  adminAddress?: string;
  myColor: string;
  createdAt: number;
  /** Other members, keyed by address. Never contains this device. */
  members: Record<string, Member>;
  joinRequests: Record<string, JoinRequest>;
  /** Whether this device currently has an SOS raised in the group. */
  mySos?: boolean;
  meet?: MeetPoint | null;
  eventMap?: EventMap | null;
};

export type PendingJoin = {
  groupId: string;
  groupName: string;
  adminAddress: string;
  requestedAt: number;
  status: 'sent' | 'rejected';
};

type GroupsState = {
  groups: Record<string, Group>;
  /** The group shown on the radar. */
  activeGroupId: string | null;
  setActiveGroup: (groupId: string) => void;
  pendingJoins: Record<string, PendingJoin>;
  upsertGroup: (group: Partial<Group> & Pick<Group, 'id'>) => void;
  removeGroup: (groupId: string) => void;
  /** Reconcile membership with the SDK's member list. */
  syncMembers: (
    groupId: string,
    addresses: string[],
    me: string | null,
  ) => void;
  updateMember: (
    groupId: string,
    address: string,
    patch: Partial<Omit<Member, 'address'>>,
  ) => void;
  setMyColor: (groupId: string, color: string) => void;
  addJoinRequest: (groupId: string, request: JoinRequest) => void;
  removeJoinRequest: (groupId: string, address: string) => void;
  addPendingJoin: (join: PendingJoin) => void;
  setPendingJoinStatus: (
    groupId: string,
    status: PendingJoin['status'],
  ) => void;
  removePendingJoin: (groupId: string) => void;
};

export const useGroups = create<GroupsState>()(
  persist(
    set => ({
      groups: {},
      pendingJoins: {},
      activeGroupId: null,

      setActiveGroup: groupId => set({ activeGroupId: groupId }),

      upsertGroup: group =>
        set(state => {
          const existing = state.groups[group.id];
          const next: Group = existing
            ? { ...existing, ...group }
            : {
                name: 'Group',
                isAdmin: false,
                myColor: '#00D084',
                createdAt: Date.now(),
                members: {},
                joinRequests: {},
                ...group,
              };
          return { groups: { ...state.groups, [group.id]: next } };
        }),

      removeGroup: groupId =>
        set(state => {
          return {
            groups: omitKey(state.groups, groupId),
            activeGroupId:
              state.activeGroupId === groupId ? null : state.activeGroupId,
          };
        }),

      syncMembers: (groupId, addresses, me) =>
        set(state => {
          const group = state.groups[groupId];
          if (!group) {
            return state;
          }
          const members: Record<string, Member> = {};
          for (const address of addresses) {
            if (address && address !== me) {
              members[address] = group.members[address] ?? { address };
            }
          }
          return {
            groups: { ...state.groups, [groupId]: { ...group, members } },
          };
        }),

      updateMember: (groupId, address, patch) =>
        set(state => {
          const group = state.groups[groupId];
          if (!group) {
            return state;
          }
          const member = group.members[address] ?? { address };
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                members: {
                  ...group.members,
                  [address]: { ...member, ...patch },
                },
              },
            },
          };
        }),

      setMyColor: (groupId, color) =>
        set(state => {
          const group = state.groups[groupId];
          return group
            ? {
                groups: {
                  ...state.groups,
                  [groupId]: { ...group, myColor: color },
                },
              }
            : state;
        }),

      addJoinRequest: (groupId, request) =>
        set(state => {
          const group = state.groups[groupId];
          if (!group || group.members[request.address]) {
            return state;
          }
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                joinRequests: {
                  ...group.joinRequests,
                  [request.address]: request,
                },
              },
            },
          };
        }),

      removeJoinRequest: (groupId, address) =>
        set(state => {
          const group = state.groups[groupId];
          if (!group) {
            return state;
          }
          return {
            groups: {
              ...state.groups,
              [groupId]: {
                ...group,
                joinRequests: omitKey(group.joinRequests, address),
              },
            },
          };
        }),

      addPendingJoin: join =>
        set(state => ({
          pendingJoins: { ...state.pendingJoins, [join.groupId]: join },
        })),

      setPendingJoinStatus: (groupId, status) =>
        set(state => {
          const join = state.pendingJoins[groupId];
          return join
            ? {
                pendingJoins: {
                  ...state.pendingJoins,
                  [groupId]: { ...join, status },
                },
              }
            : state;
        }),

      removePendingJoin: groupId =>
        set(state => {
          return { pendingJoins: omitKey(state.pendingJoins, groupId) };
        }),
    }),
    { name: 'groups', storage: persistStorage },
  ),
);

/** Colors already used by others in the group. */
export function takenColors(group: Group): Set<string> {
  const taken = new Set<string>();
  for (const member of Object.values(group.members)) {
    if (member.color) {
      taken.add(member.color);
    }
  }
  return taken;
}

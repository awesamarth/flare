import { Platform, Vibration } from 'react-native';
import {
  ContentType,
  MessagePriority,
  OfflineProtocol,
  type GroupInfoEvent,
  type GroupMemberAddedEvent,
  type GroupMemberRemovedEvent,
  type GroupMessageReceivedEvent,
  type MessageReceivedEvent,
  type ProtocolConfig,
  type ProtocolEvent,
} from '@offline-protocol/mesh-sdk';
import { putMedia } from '../lib/media';
import { RssiSmoother } from '../lib/proximity';
import { shortAddress, makeId } from '../lib/time';
import {
  decodeDirect,
  decodeGroup,
  decodePhotoCaption,
  encodeDirect,
  encodeGroup,
  encodePhotoCaption,
  type LocationFix,
} from '../protocol/envelope';
import { buildGroupLink, buildPersonLink, parseLink } from '../protocol/links';
import { takenColors, useGroups } from '../state/groups';
import {
  directConv,
  groupConv,
  useMessages,
  type ConversationId,
} from '../state/messages';
import { useProfile } from '../state/profile';
import { useRuntime } from '../state/runtime';
import { MEMBER_COLORS } from '../theme';
import { startBatteryReporting } from './battery';
import {
  isEventMapDoc,
  loadAllEventMaps,
  loadEventMap,
  onAttachmentReceived,
  onAttachmentRequested,
  onAttachmentUnavailable,
  retryMissingEventMaps,
} from './eventmap';
import { loadAllMeets, loadMeet, MEET_DOC } from './meet';
import { notifySystem } from './notify';
import { requestAndroidPermissions } from './permissions';

function buildConfig(): ProtocolConfig {
  return {
    appId: 'flare',
    profile: 'main',
    transports: {
      ble: {
        enabled: true,
        advertiseNodeHash: useProfile.getState().advertiseNodeHash,
      },
      // Android: Wi-Fi Direct groups formed without a system dialog. iOS: the
      // local network and AWDL. Faster than Bluetooth when it's available.
      // Fast links: a Wi-Fi network between two phones for photos. Both sides
      // must agree. Android shows no prompt, so it accepts any; iOS shows a
      // join prompt each time, so it only takes links it asked for.
      wifiDirect: {
        enabled: true,
        autoAccept: true,
        fastLink: Platform.OS === 'android' ? 'any' : 'requestedOnly',
      },
    },
  };
}

const smoothers = new Map<string, RssiSmoother>();
const lastProximityPush = new Map<string, number>();

let protocol: OfflineProtocol | null = null;
let starting: Promise<void> | null = null;
let syncTimer: ReturnType<typeof setInterval> | null = null;
let activeConversation: ConversationId | null = null;

const announceTimers = new Map<string, ReturnType<typeof setTimeout>>();

const me = () => useProfile.getState().address;
const runtime = () => useRuntime.getState();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Lets the chat screen suppress unread counts for what's on screen. */
export function setActiveConversation(conv: ConversationId | null) {
  activeConversation = conv;
  if (conv) {
    useMessages.getState().markRead(conv);
  }
}

/** Battery level (0-100) for the SDK's relay and transport decisions. */
function reportBattery(level: number, charging: boolean) {
  if (protocol && isMeshRunning()) {
    protocol
      .setBatteryState(Math.round(Math.min(100, Math.max(0, level))), charging)
      .then(() => runtime().set({ battery: { level, charging, at: Date.now() } }))
      .catch(() => {});
  }
}

export function isMeshRunning(): boolean {
  return protocol !== null && runtime().meshStatus === 'running';
}

function requireProtocol(): OfflineProtocol {
  if (!protocol || runtime().meshStatus !== 'running') {
    throw new Error('Mesh is not running yet.');
  }
  return protocol;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startMesh(): Promise<void> {
  if (starting) {
    return starting;
  }
  if (isMeshRunning()) {
    return Promise.resolve();
  }
  starting = (async () => {
    runtime().set({ meshStatus: 'starting', meshError: undefined });

    const permissions = await requestAndroidPermissions();
    if (!permissions.bluetooth) {
      runtime().set({ meshStatus: 'permission_denied' });
      return;
    }

    if (!protocol) {
      protocol = new OfflineProtocol(buildConfig());
      attachListeners(protocol);
    }

    // iOS reports Bluetooth state asynchronously and can't enable it for us,
    // so only gate on it on Android.
    if (Platform.OS === 'android') {
      const enabled = await protocol.isBluetoothEnabled().catch(() => true);
      if (!enabled) {
        const turnedOn = await protocol.requestEnableBluetooth().catch(() => false);
        if (!turnedOn) {
          runtime().set({ meshStatus: 'bluetooth_off' });
          return;
        }
      }
    }

    await protocol.start();
    const address = await protocol.localAddress();
    if (address) {
      useProfile.getState().setAddress(address);
    }
    runtime().set({ meshStatus: 'running' });
    startBatteryReporting(reportBattery);

    await syncGroupsFromMesh();
    await loadAllMeets();
    await loadAllEventMaps();
    for (const groupId of Object.keys(useGroups.getState().groups)) {
      scheduleAnnounce(groupId);
    }
    if (!syncTimer) {
      syncTimer = setInterval(() => {
        syncGroupsFromMesh().catch(() => {});
      }, 30_000);
    }
  })()
    .catch(error => {
      runtime().set({ meshStatus: 'error', meshError: errorMessage(error) });
    })
    .finally(() => {
      starting = null;
    });
  return starting;
}

/** Tear down and start again, e.g. after a config setting changed. */
export async function restartMesh(): Promise<void> {
  if (starting) {
    await starting;
  }
  const old = protocol;
  protocol = null;
  runtime().set({ meshStatus: 'idle', neighbors: {}, proximity: {} });
  if (old) {
    await old.stop().catch(() => {});
    await old.destroy().catch(() => {});
  }
  await startMesh();
}

// ---------------------------------------------------------------------------
// Event handling
// ---------------------------------------------------------------------------

type EventOf<K extends ProtocolEvent['type']> = Extract<ProtocolEvent, { type: K }>;

function on<K extends ProtocolEvent['type']>(
  p: OfflineProtocol,
  type: K,
  handler: (event: EventOf<K>) => void | Promise<void>,
) {
  p.on<EventOf<K>>(type, event => {
    Promise.resolve(handler(event)).catch(error => {
      console.warn(`[flare] ${type} handler failed`, error);
    });
  });
}

function attachListeners(p: OfflineProtocol) {
  on(p, 'identity_ready', event => {
    useProfile.getState().setAddress(event.address);
  });
  on(p, 'neighbor_discovered', event => {
    if (!runtime().neighbors[event.peer_id]) {
      retryMissingEventMaps();
    }
    runtime().upsertNeighbor({
      id: event.peer_id,
      transport: event.transport,
      rssi: event.rssi,
      seenAt: Date.now(),
    });
  });
  on(p, 'neighbor_lost', event => {
    runtime().removeNeighbor(event.peer_id);
    smoothers.delete(event.peer_id);
  });
  // Live Bluetooth signal to linked peers; only emitted while we listen.
  on(p, 'peer_rssi', event => {
    const now = Date.now();
    let smoother = smoothers.get(event.peer_id);
    if (!smoother) {
      smoother = new RssiSmoother();
      smoothers.set(event.peer_id, smoother);
    }
    const reading = smoother.push(event.rssi, now);
    // Up to 4 readings a second per peer; the UI needs ~2.
    if (now - (lastProximityPush.get(event.peer_id) ?? 0) >= 450) {
      lastProximityPush.set(event.peer_id, now);
      runtime().setProximity(event.peer_id, reading);
    }
  });
  on(p, 'data_changed', event => {
    if (event.doc_id === MEET_DOC) {
      return loadMeet(event.space_id);
    }
    if (isEventMapDoc(event.doc_id)) {
      return loadEventMap(event.space_id);
    }
  });
  on(p, 'data_attachment_requested', event =>
    onAttachmentRequested(event.space_id, event.peer_id, event.hash),
  );
  on(p, 'data_attachment_received', event =>
    onAttachmentReceived(event.space_id, event.hash, event.data),
  );
  on(p, 'data_attachment_unavailable', event =>
    onAttachmentUnavailable(event.space_id, event.hash),
  );
  on(p, 'data_doc_removed', event => {
    if (event.doc_id === MEET_DOC && useGroups.getState().groups[event.space_id]) {
      useGroups.getState().upsertGroup({ id: event.space_id, meet: null });
    }
  });
  on(p, 'transport_switched', event => runtime().set({ transport: event.to }));
  on(p, 'mesh_stopped_by_user', () => runtime().set({ meshStatus: 'idle' }));

  on(p, 'message_received', handleDirectMessage);
  on(p, 'group_message_received', handleGroupMessage);

  on(p, 'group_created', event => refreshGroup(event.group_id, event.name));
  on(p, 'group_member_added', (event: GroupMemberAddedEvent) =>
    refreshGroup(event.group_id, event.group_name),
  );
  on(p, 'group_member_removed', handleMemberRemoved);
  on(p, 'group_info', (event: GroupInfoEvent) => {
    const groups = useGroups.getState();
    if (!groups.groups[event.group_id]) {
      return;
    }
    groups.upsertGroup({ id: event.group_id, name: event.name });
    groups.syncMembers(
      event.group_id,
      event.members.map(m => m.user_id),
      me(),
    );
  });
  on(p, 'group_renamed', event =>
    useGroups.getState().upsertGroup({ id: event.group_id, name: event.new_name }),
  );

  on(p, 'message_delivered', event =>
    useMessages.getState().onMeshDelivered(event.message_id),
  );
  on(p, 'message_failed', event =>
    useMessages.getState().onMeshFailed(event.message_id),
  );
  on(p, 'message_undeliverable', event =>
    useMessages.getState().onMeshFailed(event.message_id),
  );
  on(p, 'media_send_failed', event => useMessages.getState().onMeshFailed(event.file_id));
  on(p, 'file_received', event => {
    const sender = event.sender;
    if (!sender || sender === me() || !event.content_type?.startsWith('image')) {
      return;
    }
    const caption = decodePhotoCaption(event.caption);
    const groups = useGroups.getState().groups;
    // A group photo only lands in the group if the sender is actually in it.
    const groupId =
      caption?.g && groups[caption.g]?.members[sender] ? caption.g : undefined;
    const conv = groupId ? groupConv(groupId) : directConv(sender);
    const id = `${sender}:${caption?.id ?? event.file_id}`;
    const mime = event.media_metadata?.mime_type ?? 'image/jpeg';
    putMedia(id, event.file_data, mime);
    useMessages.getState().add(
      conv,
      {
        id,
        from: sender,
        text: 'Photo',
        ts: clampTs(caption?.ts ?? event.timestamp ?? Date.now()),
        mine: false,
        kind: 'photo',
        mediaId: id,
        width: event.media_metadata?.width,
        height: event.media_metadata?.height,
      },
      activeConversation !== conv,
    );
    if (activeConversation !== conv) {
      alert(`${nameFor(sender, groupId)} sent a photo`, '', 'info', groupId ? { groupId } : { address: sender });
    }
  });
}

function alert(
  title: string,
  body: string,
  tone: 'info' | 'danger',
  target?: { groupId?: string; address?: string },
) {
  runtime().pushAlert({ id: makeId(), title, body, tone, target });
  notifySystem(title, body, tone, target).catch(() => {});
  Vibration.vibrate(tone === 'danger' ? [0, 500, 200, 500, 200, 500] : 250);
}

/** Never trust a remote timestamp from the future. */
const clampTs = (ts: number) => Math.min(ts, Date.now());

function nameFor(address: string, groupId?: string): string {
  const groups = useGroups.getState().groups;
  if (groupId) {
    const name = groups[groupId]?.members[address]?.name;
    if (name) {
      return name;
    }
  }
  for (const group of Object.values(groups)) {
    const name = group.members[address]?.name;
    if (name) {
      return name;
    }
  }
  return useMessages.getState().directPeers[address]?.name ?? shortAddress(address);
}

async function handleGroupMessage(event: GroupMessageReceivedEvent) {
  const sender = event.sender;
  if (!sender || sender === me()) {
    return;
  }
  const payload = decodeGroup(event.content);
  if (!payload) {
    return;
  }
  const groupId = event.group_id;
  if (!useGroups.getState().groups[groupId]) {
    await refreshGroup(groupId);
    if (!useGroups.getState().groups[groupId]) {
      return;
    }
  }
  const groups = useGroups.getState();
  const now = Date.now();
  groups.updateMember(groupId, sender, { lastHeardAt: now });
  const conv = groupConv(groupId);
  const messages = useMessages.getState();

  switch (payload.k) {
    case 'chat':
      messages.add(
        conv,
        {
          id: `${sender}:${payload.id}`,
          from: sender,
          text: payload.text,
          ts: clampTs(payload.ts),
          mine: false,
          kind: 'chat',
        },
        activeConversation !== conv,
      );
      break;

    case 'loc': {
      const current = groups.groups[groupId]?.members[sender]?.loc;
      const ts = clampTs(payload.ts);
      if (!current || ts > current.ts) {
        groups.updateMember(groupId, sender, {
          loc: { lat: payload.lat, lon: payload.lon, acc: payload.acc, ts },
        });
      }
      break;
    }

    case 'profile':
      groups.updateMember(groupId, sender, {
        name: payload.name,
        color: payload.color,
      });
      resolveColorClash(groupId, sender, payload.color);
      break;

    case 'ping': {
      if (payload.to && payload.to !== me()) {
        break;
      }
      const name = nameFor(sender, groupId);
      messages.add(
        conv,
        {
          id: `${sender}:${payload.id}`,
          from: sender,
          text: `${name} pinged you`,
          ts: clampTs(payload.ts),
          mine: false,
          kind: 'ping',
        },
        activeConversation !== conv,
      );
      alert(`${name} pinged you`, groups.groups[groupId]?.name ?? '', 'info', {
        groupId,
      });
      break;
    }

    case 'sos': {
      const name = nameFor(sender, groupId);
      groups.updateMember(groupId, sender, {
        sos: {
          id: payload.id,
          active: payload.active,
          ts: clampTs(payload.ts),
          loc: payload.loc,
        },
        ...(payload.loc ? { loc: { ...payload.loc, ts: clampTs(payload.loc.ts) } } : {}),
      });
      messages.add(
        conv,
        {
          id: `${sender}:${payload.id}:${payload.active ? 'on' : 'off'}`,
          from: sender,
          text: payload.active ? `${name} needs help (SOS)` : `${name} is OK now`,
          ts: clampTs(payload.ts),
          mine: false,
          kind: 'sos',
        },
        activeConversation !== conv,
      );
      if (payload.active) {
        alert(`SOS from ${name}`, 'Tap to see where they are', 'danger', {
          groupId,
        });
      }
      break;
    }
  }
}

async function handleDirectMessage(event: MessageReceivedEvent) {
  const sender = event.sender;
  if (!sender || sender === me()) {
    return;
  }
  const payload = decodeDirect(event.content);
  if (!payload) {
    return;
  }
  const messages = useMessages.getState();
  const groups = useGroups.getState();

  switch (payload.k) {
    case 'chat': {
      const conv = directConv(sender);
      messages.add(
        conv,
        {
          id: `${sender}:${payload.id || event.message_id}`,
          from: sender,
          text: payload.text,
          ts: clampTs(payload.ts),
          mine: false,
          kind: 'chat',
        },
        activeConversation !== conv,
      );
      if (activeConversation !== conv) {
        alert(nameFor(sender), payload.text.slice(0, 80), 'info', {
          address: sender,
        });
      }
      break;
    }

    case 'ping':
      alert(`${nameFor(sender)} pinged you`, '', 'info', { address: sender });
      break;

    case 'join_req': {
      const group = groups.groups[payload.g];
      if (!group || !group.isAdmin || group.members[sender]) {
        return;
      }
      messages.setDirectPeer(sender, { name: payload.name, color: payload.color });
      groups.addJoinRequest(payload.g, {
        address: sender,
        name: payload.name,
        color: payload.color,
        requestedAt: Date.now(),
      });
      alert(`${payload.name} wants to join`, group.name, 'info', {
        groupId: payload.g,
      });
      break;
    }

    case 'join_res': {
      const pending = groups.pendingJoins[payload.g];
      if (!pending || pending.adminAddress !== sender) {
        return;
      }
      if (!payload.ok) {
        groups.setPendingJoinStatus(payload.g, 'rejected');
        alert('Join request declined', pending.groupName, 'info');
      }
      break;
    }
  }
}

function handleMemberRemoved(event: GroupMemberRemovedEvent) {
  const groups = useGroups.getState();
  const group = groups.groups[event.group_id];
  if (!group) {
    return;
  }
  if (event.user_id === me()) {
    groups.removeGroup(event.group_id);
    alert('Removed from group', group.name, 'info');
    return;
  }
  refreshGroup(event.group_id).catch(() => {});
}

/**
 * Pull the SDK's view of a group into our store. Creates it locally when we
 * have just been added (the admin approved our join request).
 */
async function refreshGroup(groupId: string, nameHint?: string) {
  if (!protocol) {
    return;
  }
  const info = await protocol.meshGetGroupInfo(groupId);
  if (!info) {
    return;
  }
  const self = me();
  const groups = useGroups.getState();
  const existing = groups.groups[groupId];
  const pending = groups.pendingJoins[groupId];
  const previousMembers = existing ? Object.keys(existing.members) : [];

  groups.upsertGroup({
    id: groupId,
    name: info.groupName || existing?.name || pending?.groupName || nameHint || 'Group',
    ...(existing
      ? {}
      : {
          isAdmin: false,
          adminAddress: pending?.adminAddress,
          myColor: useProfile.getState().color,
          createdAt: Date.now(),
        }),
  });
  groups.syncMembers(groupId, info.memberIds, self);

  if (self) {
    const role = await protocol.meshGetMemberRole(groupId, self).catch(() => null);
    if (role) {
      groups.upsertGroup({ id: groupId, isAdmin: role.toLowerCase() === 'admin' });
    }
  }

  if (!existing) {
    if (pending) {
      groups.removePendingJoin(groupId);
    }
    alert(`You're in ${info.groupName || pending?.groupName || 'the group'}`, '', 'info', {
      groupId,
    });
    scheduleAnnounce(groupId);
    return;
  }
  const added = info.memberIds.some(
    id => id !== self && !previousMembers.includes(id),
  );
  if (added) {
    // New people need our name, color and position.
    scheduleAnnounce(groupId);
  }
}

async function syncGroupsFromMesh() {
  if (!protocol) {
    return;
  }
  const ids = await protocol.meshListGroups();
  for (const id of ids) {
    await refreshGroup(id).catch(() => {});
  }
}

/**
 * Two members picked the same color. The one with the lower address keeps
 * it; the other moves to the first free color. Deterministic on both sides.
 */
function resolveColorClash(groupId: string, other: string, color: string) {
  const self = me();
  const group = useGroups.getState().groups[groupId];
  if (!self || !group || group.myColor !== color || other > self) {
    return;
  }
  const taken = takenColors(group);
  const preferred = useProfile.getState().color;
  const next = !taken.has(preferred)
    ? preferred
    : MEMBER_COLORS.find(c => !taken.has(c));
  if (next && next !== group.myColor) {
    useGroups.getState().setMyColor(groupId, next);
    scheduleAnnounce(groupId);
  }
}

// ---------------------------------------------------------------------------
// Outgoing
// ---------------------------------------------------------------------------

/** Send our profile (and last fix) to a group, debounced. */
export function scheduleAnnounce(groupId: string) {
  const existing = announceTimers.get(groupId);
  if (existing) {
    clearTimeout(existing);
  }
  announceTimers.set(
    groupId,
    setTimeout(() => {
      announceTimers.delete(groupId);
      announce(groupId).catch(() => {});
    }, 1500),
  );
}

async function announce(groupId: string) {
  if (!isMeshRunning() || !protocol) {
    return;
  }
  const group = useGroups.getState().groups[groupId];
  const { name } = useProfile.getState();
  if (!group || !name || Object.keys(group.members).length === 0) {
    return;
  }
  await protocol.meshSendGroupMessage(
    groupId,
    encodeGroup({ k: 'profile', name, color: group.myColor, ts: Date.now() }),
    'medium',
  );
  const position = runtime().position;
  if (position) {
    await protocol.meshSendGroupMessage(
      groupId,
      encodeGroup({ k: 'loc', ...position }),
      'low',
    );
  }
}

/** Share a location fix with every group that has someone else in it. */
export async function broadcastLocation(fix: LocationFix): Promise<boolean> {
  if (!isMeshRunning() || !protocol) {
    return false;
  }
  const groups = Object.values(useGroups.getState().groups).filter(
    g => Object.keys(g.members).length > 0,
  );
  let sent = false;
  for (const group of groups) {
    try {
      await protocol.meshSendGroupMessage(
        group.id,
        encodeGroup({ k: 'loc', ...fix }),
        'low',
      );
      sent = true;
    } catch (error) {
      console.warn('[flare] location broadcast failed', error);
    }
  }
  return sent;
}

export async function createGroup(name: string): Promise<string> {
  const p = requireProtocol();
  const info = await p.meshCreateGroup(name.trim());
  useGroups.getState().upsertGroup({
    id: info.groupId,
    name: info.groupName || name.trim(),
    isAdmin: true,
    adminAddress: me() ?? undefined,
    myColor: useProfile.getState().color,
    createdAt: Date.now(),
  });
  return info.groupId;
}

export async function leaveGroup(groupId: string) {
  const p = requireProtocol();
  await p.meshLeaveGroup(groupId);
  useGroups.getState().removeGroup(groupId);
  useMessages.getState().removeConversation(groupConv(groupId));
}

export async function groupInviteLink(groupId: string): Promise<string> {
  const p = requireProtocol();
  const group = useGroups.getState().groups[groupId];
  if (!group) {
    throw new Error('Unknown group.');
  }
  const invite = await p.createInvite(useProfile.getState().name ?? undefined, false);
  return buildGroupLink(groupId, group.name, invite);
}

export async function personalLink(): Promise<string> {
  const p = requireProtocol();
  const invite = await p.createInvite(useProfile.getState().name ?? undefined, false);
  return buildPersonLink(invite);
}

export type ScanOutcome =
  | { kind: 'join_requested'; groupName: string }
  | { kind: 'already_member'; groupId: string }
  | { kind: 'person'; address: string; name?: string }
  | { kind: 'added'; groupId: string; name?: string };

/**
 * Act on a scanned QR. With `addToGroupId`, a personal code adds that person
 * to the group (flow b). Without it, a group code sends a join request to the
 * group's admin (flow a), and a personal code is returned for the UI to use.
 */
export async function handleScan(
  value: string,
  addToGroupId?: string,
): Promise<ScanOutcome> {
  const p = requireProtocol();
  const link = parseLink(value);
  if (!link) {
    throw new Error("That QR code isn't a Flare code.");
  }
  const info = await p.parseInvite(link.invite).catch(() => {
    throw new Error('This code could not be verified.');
  });
  if (info.address === me()) {
    throw new Error("That's your own code.");
  }
  const petname = info.petname ?? undefined;
  if (petname) {
    useMessages.getState().setDirectPeer(info.address, { name: petname });
  }

  if (link.type === 'person') {
    if (addToGroupId) {
      await addMember(addToGroupId, info.address, petname);
      return { kind: 'added', groupId: addToGroupId, name: petname };
    }
    return { kind: 'person', address: info.address, name: petname };
  }

  const groups = useGroups.getState();
  if (groups.groups[link.groupId]) {
    return { kind: 'already_member', groupId: link.groupId };
  }
  const { name, color } = useProfile.getState();
  await p.sendMessage({
    recipient: info.address,
    content: encodeDirect({
      k: 'join_req',
      g: link.groupId,
      name: name ?? 'Someone',
      color,
      ts: Date.now(),
    }),
    priority: MessagePriority.High,
  });
  groups.addPendingJoin({
    groupId: link.groupId,
    groupName: link.groupName,
    adminAddress: info.address,
    requestedAt: Date.now(),
    status: 'sent',
  });
  return { kind: 'join_requested', groupName: link.groupName };
}

export async function addMember(groupId: string, address: string, name?: string) {
  const p = requireProtocol();
  try {
    await p.meshInviteToGroup(groupId, address);
  } catch (error) {
    throw new Error(
      `Couldn't add them yet. Make sure they're nearby with Flare open, then try again. (${errorMessage(error)})`,
    );
  }
  const groups = useGroups.getState();
  groups.updateMember(groupId, address, name ? { name } : {});
  groups.removeJoinRequest(groupId, address);
  await refreshGroup(groupId).catch(() => {});
}

export async function approveJoin(groupId: string, address: string) {
  const request = useGroups.getState().groups[groupId]?.joinRequests[address];
  await addMember(groupId, address, request?.name);
  if (request) {
    useGroups.getState().updateMember(groupId, address, {
      name: request.name,
      color: request.color,
    });
  }
}

export async function declineJoin(groupId: string, address: string) {
  useGroups.getState().removeJoinRequest(groupId, address);
  const p = protocol;
  if (p && isMeshRunning()) {
    await p
      .sendMessage({
        recipient: address,
        content: encodeDirect({ k: 'join_res', g: groupId, ok: false, ts: Date.now() }),
        priority: MessagePriority.Medium,
      })
      .catch(() => {});
  }
}

export async function sendChat(conv: ConversationId, text: string, retryId?: string) {
  const body = text.trim();
  if (!body) {
    return;
  }
  const messages = useMessages.getState();
  const id = retryId ?? makeId();
  const ts = Date.now();
  if (retryId) {
    messages.patch(conv, id, { status: 'sending', delivered: 0 });
  } else {
    messages.add(
      conv,
      { id, from: me() ?? '', text: body, ts, mine: true, kind: 'chat', status: 'sending' },
      false,
    );
  }

  try {
    const p = requireProtocol();
    if (conv.startsWith('g:')) {
      const groupId = conv.slice(2);
      const meshIds = await p.meshSendGroupMessage(
        groupId,
        encodeGroup({ k: 'chat', id, text: body, ts }),
        'high',
      );
      messages.linkMeshIds(conv, id, meshIds);
      messages.patch(conv, id, {
        status: meshIds.length > 0 ? 'sent' : 'nobody',
        recipients: meshIds.length,
        delivered: 0,
      });
    } else {
      const recipient = conv.slice(2);
      const meshId = await p.sendMessage({
        recipient,
        content: encodeDirect({ k: 'chat', id, text: body, ts }),
        priority: MessagePriority.High,
      });
      messages.linkMeshIds(conv, id, [meshId]);
      messages.patch(conv, id, { status: 'sent', recipients: 1, delivered: 0 });
    }
  } catch (error) {
    console.warn('[flare] send failed', error);
    messages.patch(conv, id, { status: 'failed' });
  }
}

export type OutgoingPhoto = {
  base64: string;
  mime: string;
  width?: number;
  height?: number;
};

/**
 * Photos go 1:1 (the SDK has no group media), so a group photo is one send
 * per member. Asks for a Wi-Fi fast link to peers we're linked to directly;
 * the transfer uses it if it comes up, Bluetooth otherwise.
 */
export async function sendPhoto(conv: ConversationId, photo: OutgoingPhoto) {
  const p = requireProtocol();
  const messages = useMessages.getState();
  const id = makeId();
  const ts = Date.now();
  const groupId = conv.startsWith('g:') ? conv.slice(2) : undefined;
  const recipients = groupId
    ? Object.keys(useGroups.getState().groups[groupId]?.members ?? {})
    : [conv.slice(2)];

  putMedia(id, photo.base64, photo.mime);
  messages.add(
    conv,
    {
      id,
      from: me() ?? '',
      text: 'Photo',
      ts,
      mine: true,
      kind: 'photo',
      mediaId: id,
      width: photo.width,
      height: photo.height,
      status: recipients.length ? 'sending' : 'nobody',
      recipients: recipients.length,
      delivered: 0,
    },
    false,
  );

  const neighbors = runtime().neighbors;
  const fileName = `${id}.${photo.mime === 'image/png' ? 'png' : 'jpg'}`;
  const fileIds: string[] = [];
  for (const recipient of recipients) {
    if (neighbors[recipient]) {
      p.requestFastLink(recipient).catch(() => {});
    }
    try {
      fileIds.push(
        await p.sendMedia({
          recipient,
          fileData: photo.base64,
          fileName,
          contentType: ContentType.Image,
          mediaMetadata: {
            mimeType: photo.mime,
            fileName,
            fileSize: Math.floor((photo.base64.length * 3) / 4),
            width: photo.width,
            height: photo.height,
          },
          caption: encodePhotoCaption({ id, g: groupId, ts }),
        }),
      );
    } catch (error) {
      console.warn('[flare] photo send failed', error);
    }
  }
  messages.linkMeshIds(conv, id, fileIds);
  if (recipients.length) {
    messages.patch(conv, id, { status: fileIds.length ? 'sent' : 'failed' });
  }
}

export async function sendPing(groupId: string, to?: string) {
  const p = requireProtocol();
  const id = makeId();
  await p.meshSendGroupMessage(
    groupId,
    encodeGroup({ k: 'ping', id, to, ts: Date.now() }),
    'high',
  );
  const name = to ? nameFor(to, groupId) : 'everyone';
  useMessages.getState().add(
    groupConv(groupId),
    { id, from: me() ?? '', text: `You pinged ${name}`, ts: Date.now(), mine: true, kind: 'ping' },
    false,
  );
}

export async function sendSos(groupId: string, active: boolean) {
  const p = requireProtocol();
  const id = makeId();
  await p.meshSendGroupMessage(
    groupId,
    encodeGroup({ k: 'sos', id, active, loc: runtime().position, ts: Date.now() }),
    'critical',
  );
  useGroups.getState().upsertGroup({ id: groupId, mySos: active });
  useMessages.getState().add(
    groupConv(groupId),
    {
      id,
      from: me() ?? '',
      text: active ? 'You sent an SOS' : 'You cancelled your SOS',
      ts: Date.now(),
      mine: true,
      kind: 'sos',
    },
    false,
  );
}

export async function getMeshDiagnostics() {
  const p = protocol;
  if (!p || !isMeshRunning()) {
    return null;
  }
  const [transports, blePeers] = await Promise.all([
    p.getActiveTransports().catch(() => []),
    p.getBLePeerCount().catch(() => null),
  ]);
  return { transports, blePeers };
}

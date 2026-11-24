/**
 * Mesh logic with the SDK mocked: incoming group/direct payloads, joins,
 * delivery state, scanning. Events are fed through the handlers the service
 * registers with `protocol.on`, the same path the real SDK uses.
 */
import { Vibration } from 'react-native';
import { encodeDirect, encodeGroup } from '../src/protocol/envelope';
import { buildGroupLink, buildPersonLink } from '../src/protocol/links';
import {
  broadcastLocation,
  broadcastLocationOff,
  handleScan,
  sendChat,
  startMesh,
  stopMesh,
} from '../src/services/mesh';
import { useGroups, type Group } from '../src/state/groups';
import { groupConv, useMessages } from '../src/state/messages';
import { useProfile } from '../src/state/profile';
import { useRuntime } from '../src/state/runtime';

const ME = 'off1me';
const ADMIN = 'off1admin';
const BOB = 'off1bob';
const AMY = 'off1amy'; // sorts before ME
const ZED = 'off1zed'; // sorts after ME
const G = 'group:test';

type Handler = (event: unknown) => unknown;
const mockHandlers = new Map<string, Handler[]>();
const mockProtocol = {
  on: jest.fn((type: string, handler: Handler) => {
    mockHandlers.set(type, [...(mockHandlers.get(type) ?? []), handler]);
  }),
  start: jest.fn(async () => {}),
  stop: jest.fn(async () => {}),
  destroy: jest.fn(async () => {}),
  localAddress: jest.fn(async () => 'off1me'),
  isBluetoothEnabled: jest.fn(async () => true),
  meshListGroups: jest.fn(async () => [] as string[]),
  meshGetGroupInfo: jest.fn(async (_id: string) => null as unknown),
  meshGetMemberRole: jest.fn(async () => 'member'),
  meshSendGroupMessage: jest.fn(async () => ['m1', 'm2']),
  sendMessage: jest.fn(async () => 'dm1'),
  parseInvite: jest.fn(async (_blob: string) => ({
    address: 'off1admin',
    petname: 'Admin' as string | null,
    public_key: [],
    signed: false,
  })),
  setBatteryState: jest.fn(async () => {}),
};
const mockStore = {
  mapGet: jest.fn(async () => null),
  mapSet: jest.fn(async () => {}),
  flush: jest.fn(async () => {}),
};

jest.mock('@offline-protocol/mesh-sdk', () => ({
  OfflineProtocol: jest.fn(() => mockProtocol),
  DataStore: jest.fn(() => mockStore),
  MessagePriority: { Low: 0, Medium: 1, High: 2, Critical: 3 },
  ContentType: { Image: 'image' },
}));

jest.mock('../src/services/permissions', () => ({
  requestAndroidPermissions: async () => ({ bluetooth: true, location: true }),
}));

/** Let the async handlers (and anything they await) settle. */
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await new Promise<void>(resolve => setImmediate(() => resolve()));
  }
};

async function emit(type: string, event: Record<string, unknown>) {
  for (const handler of mockHandlers.get(type) ?? []) {
    handler({ type, ...event });
  }
  await flush();
}

const groupMessage = (sender: string, content: string, groupId = G) =>
  emit('group_message_received', {
    group_id: groupId,
    sender,
    content,
    timestamp: '0',
    message_id: 'x',
  });

const directMessage = (sender: string, content: string) =>
  emit('message_received', {
    message_id: 'd',
    sender,
    recipient: ME,
    content,
    hop_count: 1,
    transport: 'BLE',
    timestamp: 0,
    lamport_clock: 0,
  });

function seedGroup(patch: Partial<Group> = {}) {
  useGroups.setState({
    groups: {
      [G]: {
        id: G,
        name: 'Crew',
        isAdmin: false,
        myColor: '#00D084',
        createdAt: 1,
        members: { [BOB]: { address: BOB } },
        joinRequests: {},
        ...patch,
      },
    },
    pendingJoins: {},
    activeGroupId: G,
  });
}

const member = (address: string) =>
  useGroups.getState().groups[G]?.members[address];
const messagesIn = (groupId = G) =>
  useMessages.getState().conversations[groupConv(groupId)] ?? [];

beforeAll(async () => {
  jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  useProfile.setState({ name: 'Me', color: '#00D084', shareLocation: true });
  await startMesh();
});

beforeEach(() => {
  jest.clearAllMocks();
  seedGroup();
  useMessages.setState({
    conversations: {},
    unread: {},
    directPeers: {},
    meshIndex: {},
  });
  useRuntime.setState({ alerts: [] });
  useProfile.setState({ shareLocation: true, color: '#00D084' });
});

afterAll(async () => {
  await stopMesh();
});

describe('startup', () => {
  it('runs the mesh and learns our address', () => {
    expect(useRuntime.getState().meshStatus).toBe('running');
    expect(useProfile.getState().address).toBe(ME);
  });
});

describe('locations', () => {
  it('keeps only newer fixes', async () => {
    await groupMessage(
      BOB,
      encodeGroup({ k: 'loc', lat: 1, lon: 1, acc: 5, ts: 1000 }),
    );
    await groupMessage(
      BOB,
      encodeGroup({ k: 'loc', lat: 2, lon: 2, acc: 5, ts: 500 }),
    );
    expect(member(BOB)?.loc).toMatchObject({ lat: 1, ts: 1000 });
    expect(member(BOB)?.lastHeardAt).toBeDefined();
  });

  it('never trusts a timestamp from the future', async () => {
    const future = Date.now() + 10 ** 9;
    await groupMessage(
      BOB,
      encodeGroup({ k: 'loc', lat: 1, lon: 1, acc: 5, ts: future }),
    );
    expect(member(BOB)?.loc?.ts).toBeLessThanOrEqual(Date.now());
  });

  it('drops the position on pause and ignores fixes from before it', async () => {
    await groupMessage(
      BOB,
      encodeGroup({ k: 'loc', lat: 1, lon: 1, acc: 5, ts: 1000 }),
    );
    await groupMessage(BOB, encodeGroup({ k: 'loc_off', ts: 2000 }));
    expect(member(BOB)?.loc).toBeUndefined();
    expect(member(BOB)?.locPausedAt).toBe(2000);

    await groupMessage(
      BOB,
      encodeGroup({ k: 'loc', lat: 9, lon: 9, acc: 5, ts: 1500 }),
    );
    expect(member(BOB)?.loc).toBeUndefined();

    await groupMessage(
      BOB,
      encodeGroup({ k: 'loc', lat: 3, lon: 3, acc: 5, ts: 3000 }),
    );
    expect(member(BOB)?.loc).toMatchObject({ lat: 3 });
    expect(member(BOB)?.locPausedAt).toBeUndefined();
  });

  it('does not broadcast while sharing is paused, and announces the pause', async () => {
    useProfile.setState({ shareLocation: false });
    expect(await broadcastLocation({ lat: 1, lon: 1, acc: 5, ts: 1 })).toBe(
      false,
    );
    await broadcastLocationOff();
    const calls = mockProtocol.meshSendGroupMessage.mock.calls as unknown as [
      string,
      string,
    ][];
    const sent = calls.map(c => JSON.parse(c[1]));
    expect(sent).toEqual([expect.objectContaining({ k: 'loc_off' })]);
  });

  it('skips groups with nobody else in them', async () => {
    seedGroup({ members: {} });
    expect(await broadcastLocation({ lat: 1, lon: 1, acc: 5, ts: 1 })).toBe(
      false,
    );
    expect(mockProtocol.meshSendGroupMessage).not.toHaveBeenCalled();
  });
});

describe('group messages', () => {
  it('adds chat and counts it unread', async () => {
    await groupMessage(
      BOB,
      encodeGroup({ k: 'chat', id: 'c1', text: 'hi', ts: 10 }),
    );
    expect(messagesIn()).toEqual([
      expect.objectContaining({ text: 'hi', mine: false }),
    ]);
    expect(useMessages.getState().unread[groupConv(G)]).toBe(1);
  });

  it('ignores our own echoes and malformed payloads', async () => {
    await groupMessage(
      ME,
      encodeGroup({ k: 'chat', id: 'c1', text: 'me', ts: 10 }),
    );
    await groupMessage(BOB, '{"v":1,"s":"g","k":"chat"}');
    await groupMessage(BOB, 'plain text');
    expect(messagesIn()).toEqual([]);
  });

  it('ignores groups we are not in', async () => {
    mockProtocol.meshGetGroupInfo.mockResolvedValueOnce(null);
    await groupMessage(
      BOB,
      encodeGroup({ k: 'chat', id: 'c1', text: 'x', ts: 1 }),
      'group:other',
    );
    expect(useGroups.getState().groups['group:other']).toBeUndefined();
  });

  it('raises a danger alert for SOS', async () => {
    await groupMessage(
      BOB,
      encodeGroup({ k: 'sos', id: 's1', active: true, ts: 10 }),
    );
    expect(member(BOB)?.sos?.active).toBe(true);
    expect(useRuntime.getState().alerts).toEqual([
      expect.objectContaining({ tone: 'danger', target: { groupId: G } }),
    ]);
    expect(messagesIn()[0]).toMatchObject({ kind: 'sos' });
  });

  it('only alerts on pings meant for us', async () => {
    await groupMessage(
      BOB,
      encodeGroup({ k: 'ping', id: 'p1', to: 'off1someone', ts: 1 }),
    );
    expect(useRuntime.getState().alerts).toEqual([]);
    await groupMessage(
      BOB,
      encodeGroup({ k: 'ping', id: 'p2', to: ME, ts: 2 }),
    );
    expect(useRuntime.getState().alerts).toHaveLength(1);
  });

  it('gives up our color when a lower address picked it too', async () => {
    seedGroup({
      members: {
        [AMY]: { address: AMY },
        [BOB]: { address: BOB, color: '#4C8DFF' },
      },
    });
    await groupMessage(
      AMY,
      encodeGroup({ k: 'profile', name: 'Amy', color: '#00D084', ts: 1 }),
    );
    const group = useGroups.getState().groups[G];
    expect(group?.myColor).not.toBe('#00D084');
    expect(group?.myColor).not.toBe('#4C8DFF'); // Bob has that one
  });

  it('keeps our color when a higher address picked it', async () => {
    seedGroup({ members: { [ZED]: { address: ZED } } });
    await groupMessage(
      ZED,
      encodeGroup({ k: 'profile', name: 'Zed', color: '#00D084', ts: 1 }),
    );
    expect(useGroups.getState().groups[G]?.myColor).toBe('#00D084');
  });
});

describe('joining', () => {
  const joinReq = encodeDirect({
    k: 'join_req',
    g: G,
    name: 'Zed',
    color: '#FF4FA3',
    ts: 1,
  });

  it('queues a join request for groups we administer', async () => {
    seedGroup({ isAdmin: true });
    await directMessage('off1zed', joinReq);
    expect(
      useGroups.getState().groups[G]?.joinRequests['off1zed'],
    ).toMatchObject({
      name: 'Zed',
    });
  });

  it('ignores join requests when we are not admin, or from members', async () => {
    await directMessage('off1zed', joinReq);
    seedGroup({ isAdmin: true });
    await directMessage(
      BOB,
      encodeDirect({ k: 'join_req', g: G, name: 'B', color: '#FF4FA3', ts: 1 }),
    );
    expect(useGroups.getState().groups[G]?.joinRequests).toEqual({});
  });

  it('sends a join request when scanning a group code', async () => {
    useGroups.setState({ groups: {}, pendingJoins: {} });
    await handleScan(buildGroupLink('group:new', 'New crew', 'blob'));
    const [[sent]] = mockProtocol.sendMessage.mock.calls as unknown as [
      [{ recipient: string; content: string }],
    ];
    expect(sent.recipient).toBe(ADMIN);
    expect(JSON.parse(sent.content)).toMatchObject({
      k: 'join_req',
      g: 'group:new',
      name: 'Me',
    });
    expect(useGroups.getState().pendingJoins['group:new']).toMatchObject({
      status: 'sent',
    });
  });

  it('only accepts a decline from the admin we asked', async () => {
    useGroups.setState({
      groups: {},
      pendingJoins: {
        'group:new': {
          groupId: 'group:new',
          groupName: 'New',
          adminAddress: ADMIN,
          requestedAt: 1,
          status: 'sent',
        },
      },
    });
    const decline = encodeDirect({
      k: 'join_res',
      g: 'group:new',
      ok: false,
      ts: 1,
    });
    await directMessage(BOB, decline);
    expect(useGroups.getState().pendingJoins['group:new']?.status).toBe('sent');
    await directMessage(ADMIN, decline);
    expect(useGroups.getState().pendingJoins['group:new']?.status).toBe(
      'rejected',
    );
  });

  it('creates the group once the admin adds us', async () => {
    useGroups.setState({
      groups: {},
      pendingJoins: {
        'group:new': {
          groupId: 'group:new',
          groupName: 'New',
          adminAddress: ADMIN,
          requestedAt: 1,
          status: 'sent',
        },
      },
    });
    mockProtocol.meshGetGroupInfo.mockResolvedValueOnce({
      groupId: 'group:new',
      groupName: 'New crew',
      memberIds: [ADMIN, ME],
      epoch: 1,
      createdAt: 1,
    });
    await emit('group_member_added', {
      group_id: 'group:new',
      user_id: ME,
      added_by: ADMIN,
    });
    const group = useGroups.getState().groups['group:new'];
    expect(group).toMatchObject({ name: 'New crew', isAdmin: false });
    expect(Object.keys(group?.members ?? {})).toEqual([ADMIN]);
    expect(useGroups.getState().pendingJoins['group:new']).toBeUndefined();
  });

  it('refuses our own code and non-Flare codes', async () => {
    mockProtocol.parseInvite.mockResolvedValueOnce({
      address: ME,
      petname: null,
      public_key: [],
      signed: false,
    });
    await expect(handleScan(buildPersonLink('blob'))).rejects.toThrow(
      /own code/,
    );
    await expect(handleScan('https://example.com')).rejects.toThrow(
      /isn't a Flare code/,
    );
  });
});

describe('sending chat', () => {
  it('marks a message to an empty group as having nobody to receive it', async () => {
    seedGroup({ members: {} });
    mockProtocol.meshSendGroupMessage.mockResolvedValueOnce([]);
    await sendChat(groupConv(G), 'hello?');
    expect(messagesIn()[0]).toMatchObject({ status: 'nobody' });
  });

  it('tracks delivery per member', async () => {
    await sendChat(groupConv(G), 'hey');
    expect(messagesIn()[0]).toMatchObject({
      status: 'sent',
      recipients: 2,
      delivered: 0,
    });
    await emit('message_delivered', {
      message_id: 'm1',
      latency_ms: 1,
      hop_count: 1,
      transport: 'BLE',
    });
    expect(messagesIn()[0]).toMatchObject({
      status: 'delivered',
      delivered: 1,
    });
  });

  it('marks a failed send so it can be retried', async () => {
    mockProtocol.meshSendGroupMessage.mockRejectedValueOnce(new Error('boom'));
    await sendChat(groupConv(G), 'oops');
    expect(messagesIn()[0]).toMatchObject({ status: 'failed' });
  });
});

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { omitKey } from '../lib/omit';
import { persistStorage } from '../lib/storage';

/** `g:<groupId>` for group chats, `d:<address>` for direct chats. */
export type ConversationId = `g:${string}` | `d:${string}`;

export const groupConv = (groupId: string): ConversationId => `g:${groupId}`;
export const directConv = (address: string): ConversationId => `d:${address}`;

/** `nobody`: a group message with no other members to send it to. */
export type DeliveryStatus = 'sending' | 'sent' | 'delivered' | 'failed' | 'nobody';

export type ChatMessage = {
  id: string;
  /** Sender address; empty for system notes. */
  from: string;
  text: string;
  ts: number;
  mine: boolean;
  kind: 'chat' | 'ping' | 'sos' | 'system' | 'photo';
  /** For photos: key into the media store, plus size for layout. */
  mediaId?: string;
  width?: number;
  height?: number;
  status?: DeliveryStatus;
  /** For group sends: how many members confirmed delivery, out of how many. */
  delivered?: number;
  recipients?: number;
};

export type DirectPeer = { name?: string; color?: string };

const MAX_PER_CONVERSATION = 300;
const MAX_INDEX = 3000;

type MessagesState = {
  conversations: Record<string, ChatMessage[]>;
  unread: Record<string, number>;
  directPeers: Record<string, DirectPeer>;
  /** SDK message id -> where our copy lives, for delivery receipts. */
  meshIndex: Record<string, { conv: ConversationId; id: string }>;
  add: (conv: ConversationId, message: ChatMessage, countUnread: boolean) => void;
  patch: (
    conv: ConversationId,
    id: string,
    patch: Partial<ChatMessage>,
  ) => void;
  linkMeshIds: (conv: ConversationId, id: string, meshIds: string[]) => void;
  onMeshDelivered: (meshId: string) => void;
  onMeshFailed: (meshId: string) => void;
  markRead: (conv: ConversationId) => void;
  setDirectPeer: (address: string, peer: DirectPeer) => void;
  removeConversation: (conv: ConversationId) => void;
};

function updateMessage(
  list: ChatMessage[] | undefined,
  id: string,
  fn: (m: ChatMessage) => ChatMessage,
): ChatMessage[] | undefined {
  if (!list) {
    return undefined;
  }
  const index = list.findIndex(m => m.id === id);
  if (index < 0) {
    return undefined;
  }
  const next = list.slice();
  next[index] = fn(list[index]);
  return next;
}

export const useMessages = create<MessagesState>()(
  persist(
    (set, get) => ({
      conversations: {},
      unread: {},
      directPeers: {},
      meshIndex: {},

      add: (conv, message, countUnread) =>
        set(state => {
          const list = state.conversations[conv] ?? [];
          if (message.id && list.some(m => m.id === message.id)) {
            return state;
          }
          const next = [...list, message]
            .sort((a, b) => a.ts - b.ts)
            .slice(-MAX_PER_CONVERSATION);
          return {
            conversations: { ...state.conversations, [conv]: next },
            unread: countUnread
              ? { ...state.unread, [conv]: (state.unread[conv] ?? 0) + 1 }
              : state.unread,
          };
        }),

      patch: (conv, id, patch) =>
        set(state => {
          const next = updateMessage(state.conversations[conv], id, m => ({
            ...m,
            ...patch,
          }));
          return next
            ? { conversations: { ...state.conversations, [conv]: next } }
            : state;
        }),

      linkMeshIds: (conv, id, meshIds) =>
        set(state => {
          const meshIndex = { ...state.meshIndex };
          for (const meshId of meshIds) {
            meshIndex[meshId] = { conv, id };
          }
          const keys = Object.keys(meshIndex);
          if (keys.length > MAX_INDEX) {
            for (const key of keys.slice(0, keys.length - MAX_INDEX)) {
              delete meshIndex[key];
            }
          }
          return { meshIndex };
        }),

      onMeshDelivered: meshId => {
        const ref = get().meshIndex[meshId];
        if (!ref) {
          return;
        }
        set(state => {
          const next = updateMessage(state.conversations[ref.conv], ref.id, m => {
            const delivered = (m.delivered ?? 0) + 1;
            const recipients = m.recipients ?? 1;
            return {
              ...m,
              delivered: Math.min(delivered, recipients),
              status: 'delivered',
            };
          });
          const meshIndex = omitKey(state.meshIndex, meshId);
          return next
            ? {
                conversations: { ...state.conversations, [ref.conv]: next },
                meshIndex,
              }
            : { meshIndex };
        });
      },

      onMeshFailed: meshId => {
        const ref = get().meshIndex[meshId];
        if (!ref) {
          return;
        }
        set(state => {
          const next = updateMessage(state.conversations[ref.conv], ref.id, m =>
            // A group message that reached someone is not a failure overall.
            m.status === 'delivered' ? m : { ...m, status: 'failed' },
          );
          const meshIndex = omitKey(state.meshIndex, meshId);
          return next
            ? {
                conversations: { ...state.conversations, [ref.conv]: next },
                meshIndex,
              }
            : { meshIndex };
        });
      },

      markRead: conv =>
        set(state =>
          state.unread[conv]
            ? { unread: { ...state.unread, [conv]: 0 } }
            : state,
        ),

      setDirectPeer: (address, peer) =>
        set(state => ({
          directPeers: {
            ...state.directPeers,
            [address]: { ...state.directPeers[address], ...peer },
          },
        })),

      removeConversation: conv =>
        set(state => {
          return {
            conversations: omitKey(state.conversations, conv),
            unread: omitKey(state.unread, conv),
          };
        }),
    }),
    { name: 'messages', storage: persistStorage },
  ),
);

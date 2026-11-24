import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useHeaderHeight } from '@react-navigation/elements';
import { useFocusEffect } from '@react-navigation/native';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getMedia } from '../lib/media';
import { formatClock, shortAddress } from '../lib/time';
import type { ScreenProps } from '../navigation/types';
import { sendChat, sendPhoto, setActiveConversation } from '../services/mesh';
import { useGroups } from '../state/groups';
import { useMessages, type ChatMessage } from '../state/messages';
import { useRuntime } from '../state/runtime';
import { textOn, useTheme, type Theme } from '../theme';

const EMPTY: ChatMessage[] = [];

export function ChatScreen({ navigation, route }: ScreenProps<'Chat'>) {
  const { conv } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const isGroup = conv.startsWith('g:');
  const target = conv.slice(2);

  const messages = useMessages(s => s.conversations[conv] ?? EMPTY);
  const directPeer = useMessages(s =>
    isGroup ? undefined : s.directPeers[target],
  );
  const group = useGroups(s => (isGroup ? s.groups[target] : undefined));
  const knownMember = useGroups(s => {
    if (isGroup) {
      return undefined;
    }
    for (const g of Object.values(s.groups)) {
      if (g.members[target]) {
        return g.members[target];
      }
    }
    return undefined;
  });
  const meshRunning = useRuntime(s => s.meshStatus === 'running');
  const [draft, setDraft] = useState('');
  const [viewing, setViewing] = useState<string | null>(null);

  const pickPhoto = () => {
    // Small and compressed: photos crawl over Bluetooth (a few KB/s).
    const options = {
      mediaType: 'photo' as const,
      maxWidth: 1280,
      maxHeight: 1280,
      quality: 0.6 as const,
      includeBase64: true,
    };
    const handle = (result: ImagePickerResponse) => {
      const asset = result.assets?.[0];
      if (result.didCancel || !asset?.base64) {
        if (result.errorMessage) {
          Alert.alert("Couldn't get the photo", result.errorMessage);
        }
        return;
      }
      sendPhoto(conv, {
        base64: asset.base64,
        mime: asset.type ?? 'image/jpeg',
        width: asset.width,
        height: asset.height,
      }).catch(e =>
        Alert.alert(
          "Photo didn't send",
          e instanceof Error ? e.message : String(e),
        ),
      );
    };
    Alert.alert(
      'Send a photo',
      'It may take a while if you are only connected over Bluetooth.',
      [
        { text: 'Camera', onPress: () => launchCamera(options).then(handle) },
        {
          text: 'Gallery',
          onPress: () => launchImageLibrary(options).then(handle),
        },
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  };

  const title = isGroup
    ? group?.name ?? 'Group chat'
    : knownMember?.name ?? directPeer?.name ?? shortAddress(target);

  useLayoutEffect(() => {
    navigation.setOptions({ title });
  }, [navigation, title]);

  useFocusEffect(
    useCallback(() => {
      setActiveConversation(conv);
      return () => setActiveConversation(null);
    }, [conv]),
  );

  // Mark anything that arrives while we're looking as read.
  useEffect(() => {
    useMessages.getState().markRead(conv);
  }, [conv, messages.length]);

  const inverted = useMemo(() => messages.slice().reverse(), [messages]);

  const senderInfo = (address: string) => {
    const member = group?.members[address];
    return {
      name: member?.name ?? shortAddress(address),
      color: member?.color ?? theme.muted,
    };
  };

  const send = () => {
    const text = draft.trim();
    if (!text) {
      return;
    }
    setDraft('');
    sendChat(conv, text);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={headerHeight}
    >
      <FlatList
        data={inverted}
        inverted
        keyExtractor={m => m.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: theme.muted }]}>
            {isGroup
              ? 'Messages hop phone to phone, so they may take a while in sparse crowds.'
              : 'Say hi. Messages are end-to-end encrypted.'}
          </Text>
        }
        renderItem={({ item }) => (
          <MessageRow
            message={item}
            theme={theme}
            showSender={isGroup && !item.mine}
            sender={item.mine ? undefined : senderInfo(item.from)}
            onRetry={() => sendChat(conv, item.text, item.id)}
            onOpenPhoto={setViewing}
          />
        )}
      />
      {isGroup && group && Object.keys(group.members).length === 0 ? (
        <Text style={[styles.offline, { color: theme.muted }]}>
          It's just you in this group. Invite friends to chat.
        </Text>
      ) : null}
      {!meshRunning ? (
        <Text style={[styles.offline, { color: theme.warning }]}>
          Mesh is not running. Messages will fail until it starts.
        </Text>
      ) : null}
      <View
        style={[
          styles.composer,
          {
            paddingBottom: Math.max(insets.bottom, 10),
            borderColor: theme.border,
            backgroundColor: theme.background,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send a photo"
          disabled={!meshRunning}
          onPress={pickPhoto}
          style={[
            styles.attach,
            { borderColor: theme.border, backgroundColor: theme.surface },
            !meshRunning && styles.dim,
          ]}
        >
          <Text style={[styles.attachText, { color: theme.primary }]}>+</Text>
        </Pressable>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message"
          placeholderTextColor={theme.faint}
          multiline
          maxLength={2000}
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          disabled={!draft.trim()}
          onPress={send}
          style={[
            styles.send,
            { backgroundColor: theme.primary },
            !draft.trim() && styles.dim,
          ]}
        >
          <Text style={[styles.sendText, { color: theme.onPrimary }]}>
            Send
          </Text>
        </Pressable>
      </View>
      <Modal
        visible={!!viewing}
        transparent
        animationType="fade"
        onRequestClose={() => setViewing(null)}
      >
        <Pressable style={styles.viewer} onPress={() => setViewing(null)}>
          {viewing ? (
            <Image
              source={{ uri: viewing }}
              style={styles.viewerImage}
              resizeMode="contain"
            />
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function statusLabel(message: ChatMessage): string {
  switch (message.status) {
    case 'sending':
      return 'Sending…';
    case 'sent':
      return 'Waiting for delivery';
    case 'delivered':
      return message.recipients && message.recipients > 1
        ? `Delivered to ${message.delivered ?? 0}/${message.recipients}`
        : 'Delivered';
    case 'failed':
      return 'Not delivered · tap to retry';
    case 'nobody':
      return 'No one else in this group yet';
    default:
      return '';
  }
}

function MessageRow({
  message,
  theme,
  showSender,
  sender,
  onRetry,
  onOpenPhoto,
}: {
  message: ChatMessage;
  theme: Theme;
  showSender: boolean;
  sender?: { name: string; color: string };
  onRetry: () => void;
  onOpenPhoto: (uri: string) => void;
}) {
  if (message.kind === 'photo') {
    const uri = message.mediaId ? getMedia(message.mediaId) : undefined;
    const ratio =
      message.width && message.height ? message.width / message.height : 4 / 3;
    return (
      <View
        style={[styles.messageWrap, message.mine ? styles.mine : styles.theirs]}
      >
        {showSender && sender ? (
          <Text style={[styles.sender, { color: sender.color }]}>
            {sender.name}
          </Text>
        ) : null}
        {uri ? (
          <Pressable onPress={() => onOpenPhoto(uri)}>
            <Image
              source={{ uri }}
              style={[
                styles.photo,
                { aspectRatio: Math.min(2, Math.max(0.5, ratio)) },
              ]}
            />
          </Pressable>
        ) : (
          <View
            style={[
              styles.photo,
              styles.photoGone,
              { backgroundColor: theme.surface },
            ]}
          >
            <Text style={{ color: theme.faint }}>
              Photo no longer on this phone
            </Text>
          </View>
        )}
        <Text
          style={[
            styles.meta,
            { color: message.status === 'failed' ? theme.danger : theme.faint },
          ]}
        >
          {formatClock(message.ts)}
          {message.mine && message.status
            ? ` · ${
                message.status === 'failed'
                  ? 'Not sent'
                  : message.status === 'nobody'
                  ? 'No one else in this group yet'
                  : message.status === 'sending'
                  ? 'Sending…'
                  : 'Sent'
              }`
            : ''}
        </Text>
      </View>
    );
  }
  if (message.kind !== 'chat') {
    const danger = message.kind === 'sos';
    return (
      <View style={styles.systemWrap}>
        <Text
          style={[
            styles.system,
            {
              color: danger ? theme.danger : theme.muted,
              backgroundColor: danger ? theme.dangerSoft : theme.surface,
            },
          ]}
        >
          {message.text} · {formatClock(message.ts)}
        </Text>
      </View>
    );
  }

  const mine = message.mine;
  return (
    <View style={[styles.messageWrap, mine ? styles.mine : styles.theirs]}>
      {showSender && sender ? (
        <Text style={[styles.sender, { color: sender.color }]}>
          {sender.name}
        </Text>
      ) : null}
      <Pressable
        disabled={message.status !== 'failed'}
        onPress={onRetry}
        style={[
          styles.bubble,
          mine
            ? { backgroundColor: theme.primary }
            : [
                styles.bubbleTheirs,
                { backgroundColor: theme.surface, borderColor: theme.border },
              ],
        ]}
      >
        <Text
          style={[
            styles.body,
            { color: mine ? textOn(theme.primary) : theme.text },
          ]}
        >
          {message.text}
        </Text>
      </Pressable>
      <Text
        style={[
          styles.meta,
          { color: message.status === 'failed' ? theme.danger : theme.faint },
        ]}
      >
        {formatClock(message.ts)}
        {mine && message.status ? ` · ${statusLabel(message)}` : ''}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { padding: 16 },
  empty: {
    textAlign: 'center',
    fontSize: 14,
    lineHeight: 20,
    marginHorizontal: 24,
    transform: [{ scaleY: -1 }],
  },
  offline: {
    textAlign: 'center',
    fontSize: 13,
    fontWeight: '700',
    paddingVertical: 6,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingTop: 11,
    paddingBottom: 11,
    fontSize: 16,
  },
  send: {
    height: 44,
    borderRadius: 22,
    paddingHorizontal: 18,
    marginLeft: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: 15, fontWeight: '900' },
  attach: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  attachText: { fontSize: 26, fontWeight: '700', marginTop: -2 },
  dim: { opacity: 0.4 },
  photo: { width: 240, borderRadius: 16 },
  photoGone: { height: 120, alignItems: 'center', justifyContent: 'center' },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
  },
  viewerImage: { width: '100%', height: '100%' },
  messageWrap: { marginVertical: 4, maxWidth: '82%' },
  mine: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  theirs: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  sender: { fontSize: 12, fontWeight: '800', marginBottom: 3, marginLeft: 6 },
  bubbleTheirs: { borderWidth: 1 },
  bubble: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 9 },
  body: { fontSize: 16, lineHeight: 21 },
  meta: { fontSize: 11, fontWeight: '600', marginTop: 3, marginHorizontal: 6 },
  systemWrap: { alignItems: 'center', marginVertical: 6 },
  system: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    overflow: 'hidden',
  },
});

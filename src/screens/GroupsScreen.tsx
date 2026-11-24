import React, { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Avatar, Badge, Button, Card, SectionTitle } from '../components/ui';
import { shortAddress } from '../lib/time';
import type { ScreenProps } from '../navigation/types';
import { openCode } from '../services/codes';
import { scanQr } from '../services/scanner';
import { useGroups } from '../state/groups';
import { groupConv, useMessages, type ConversationId } from '../state/messages';
import { useProfile } from '../state/profile';
import { useRuntime } from '../state/runtime';
import { useTheme } from '../theme';

/** Switch groups, open direct chats, create/join, edit profile. */
export function GroupsScreen({ navigation }: ScreenProps<'Groups'>) {
  const theme = useTheme();
  const profile = useProfile();
  const groups = useGroups(s => s.groups);
  const activeGroupId = useGroups(s => s.activeGroupId);
  const setActiveGroup = useGroups(s => s.setActiveGroup);
  const pendingJoins = useGroups(s => s.pendingJoins);
  const removePendingJoin = useGroups(s => s.removePendingJoin);
  const conversations = useMessages(s => s.conversations);
  const unread = useMessages(s => s.unread);
  const directPeers = useMessages(s => s.directPeers);
  const running = useRuntime(s => s.meshStatus === 'running');
  const [scanning, setScanning] = useState(false);

  const groupList = Object.values(groups).sort(
    (a, b) => b.createdAt - a.createdAt,
  );
  const directList = Object.keys(conversations)
    .filter(c => c.startsWith('d:'))
    .map(conv => ({
      conv,
      last: conversations[conv]?.[conversations[conv].length - 1],
    }))
    .filter(item => item.last)
    .sort((a, b) => (b.last?.ts ?? 0) - (a.last?.ts ?? 0));

  const showOnRadar = (groupId: string) => {
    setActiveGroup(groupId);
    navigation.popTo('Home');
  };

  const scan = async () => {
    setScanning(true);
    try {
      const value = await scanQr();
      if (!value) {
        return;
      }
      await openCode(value);
    } catch (error) {
      Alert.alert(
        'Scan failed',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setScanning(false);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => navigation.navigate('Onboarding', { edit: true })}
      >
        <Card style={styles.row}>
          <Avatar name={profile.name ?? '?'} color={profile.color} size={44} />
          <View style={[styles.flex, styles.gap]}>
            <Text style={[styles.title, { color: theme.text }]}>
              {profile.name}
            </Text>
            <Text style={[styles.sub, { color: theme.muted }]}>
              Edit name and color
            </Text>
          </View>
        </Card>
      </Pressable>

      <View style={[styles.row, styles.block]}>
        <Button
          label="New group"
          disabled={!running}
          onPress={() => navigation.navigate('NewGroup')}
          style={styles.flex}
        />
        <Button
          label="Scan code"
          variant="secondary"
          disabled={!running}
          loading={scanning}
          onPress={scan}
          style={[styles.flex, styles.gap]}
        />
      </View>
      <Button
        label="Show my code"
        variant="ghost"
        disabled={!running}
        onPress={() => navigation.navigate('ShareCode', {})}
      />

      {Object.values(pendingJoins).map(join => (
        <Card key={join.groupId} style={styles.block}>
          <Text style={[styles.title, { color: theme.text }]}>
            {join.status === 'rejected' ? 'Declined:' : 'Waiting to join'}{' '}
            {join.groupName}
          </Text>
          <Text style={[styles.sub, { color: theme.muted }]}>
            {join.status === 'rejected'
              ? 'The admin declined your request.'
              : 'The admin needs to approve you. Works best when you are close to them.'}
          </Text>
          <Button
            label={join.status === 'rejected' ? 'Dismiss' : 'Cancel request'}
            variant="secondary"
            compact
            onPress={() => removePendingJoin(join.groupId)}
            style={styles.start}
          />
        </Card>
      ))}

      <View style={styles.block}>
        <SectionTitle>Groups</SectionTitle>
        {groupList.length === 0 ? (
          <Text style={[styles.sub, { color: theme.muted }]}>
            No groups yet.
          </Text>
        ) : (
          groupList.map(group => {
            const conv = groupConv(group.id);
            const people = Object.keys(group.members).length + 1;
            const sos = Object.values(group.members).some(m => m.sos?.active);
            const active = group.id === activeGroupId;
            return (
              <Pressable
                key={group.id}
                accessibilityRole="button"
                onPress={() => showOnRadar(group.id)}
              >
                <Card
                  style={[
                    styles.row,
                    styles.item,
                    active && { borderColor: theme.primary },
                    sos && { borderColor: theme.danger },
                  ]}
                >
                  <View style={styles.flex}>
                    <Text style={[styles.title, { color: theme.text }]}>
                      {group.name}
                    </Text>
                    <Text
                      style={[
                        styles.sub,
                        { color: sos ? theme.danger : theme.muted },
                      ]}
                    >
                      {sos
                        ? 'Someone needs help'
                        : `${people} ${people === 1 ? 'person' : 'people'}`}
                      {active ? ' · on radar' : ''}
                    </Text>
                  </View>
                  <Badge count={unread[conv] ?? 0} />
                </Card>
              </Pressable>
            );
          })
        )}
      </View>

      {directList.length > 0 ? (
        <View style={styles.block}>
          <SectionTitle>Direct messages</SectionTitle>
          {directList.map(({ conv, last }) => {
            const address = conv.slice(2);
            const peer = directPeers[address];
            const name = peer?.name ?? shortAddress(address);
            return (
              <Pressable
                key={conv}
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate('Chat', { conv: conv as ConversationId })
                }
              >
                <Card style={[styles.row, styles.item]}>
                  <Avatar
                    name={name}
                    color={peer?.color ?? theme.faint}
                    size={36}
                  />
                  <View style={[styles.flex, styles.gap]}>
                    <Text style={[styles.title, { color: theme.text }]}>
                      {name}
                    </Text>
                    <Text
                      style={[styles.sub, { color: theme.muted }]}
                      numberOfLines={1}
                    >
                      {last?.text}
                    </Text>
                  </View>
                  <Badge count={unread[conv] ?? 0} />
                </Card>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  flex: { flex: 1 },
  gap: { marginLeft: 10 },
  row: { flexDirection: 'row', alignItems: 'center' },
  block: { marginTop: 20 },
  item: { marginBottom: 10 },
  start: { alignSelf: 'flex-start', marginTop: 12 },
  title: { fontSize: 17, fontWeight: '800' },
  sub: { marginTop: 3, fontSize: 14, fontWeight: '500', lineHeight: 19 },
});

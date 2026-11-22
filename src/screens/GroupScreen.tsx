import React, { useLayoutEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Avatar, Button, Card, ColorPicker, SectionTitle } from '../components/ui';
import { formatDistance } from '../lib/geo';
import { formatRange, isFresh, rssiToRange } from '../lib/proximity';
import { formatAgo, shortAddress } from '../lib/time';
import { STALE_MS, useGroupRadar } from '../lib/useGroupRadar';
import { useNow } from '../lib/useNow';
import type { ScreenProps } from '../navigation/types';
import {
  approveJoin,
  declineJoin,
  handleScan,
  leaveGroup,
  scheduleAnnounce,
  sendPing,
} from '../services/mesh';
import { scanQr } from '../services/scanner';
import { takenColors, useGroups } from '../state/groups';
import { useRuntime } from '../state/runtime';
import { MEMBER_COLORS, useTheme } from '../theme';

/** Group details: join requests, people, your color, admin tools. */
export function GroupScreen({ navigation, route }: ScreenProps<'Group'>) {
  const { groupId } = route.params;
  const theme = useTheme();
  const now = useNow(5000);
  const group = useGroups(s => s.groups[groupId]);
  const setMyColor = useGroups(s => s.setMyColor);
  const meshRunning = useRuntime(s => s.meshStatus === 'running');
  const proximity = useRuntime(s => s.proximity);
  const { members, located } = useGroupRadar(group, now, theme.faint);
  const [busy, setBusy] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: group?.name ?? 'Group' });
  }, [navigation, group?.name]);

  if (!group) {
    return (
      <View style={[styles.center, { backgroundColor: theme.background }]}>
        <Text style={{ color: theme.muted }}>This group is no longer on this phone.</Text>
      </View>
    );
  }

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      Alert.alert('Something went wrong', error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const addByScan = () =>
    run('scan', async () => {
      const value = await scanQr();
      if (!value) {
        return;
      }
      const outcome = await handleScan(value, groupId);
      if (outcome.kind === 'added') {
        Alert.alert('Added', `${outcome.name ?? 'They'} will show up once their phone confirms.`);
      } else {
        Alert.alert('That was a group code', 'To add someone, scan their personal code.');
      }
    });

  const confirmLeave = () =>
    Alert.alert('Leave group?', `You'll stop sharing your location with ${group.name}.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: () =>
          run('leave', async () => {
            await leaveGroup(groupId);
            navigation.popTo('Home');
          }),
      },
    ]);

  const distanceOf = (address: string) =>
    located.find(l => l.member.address === address)?.distance;
  const sorted = members
    .slice()
    .sort((a, b) => (distanceOf(a.address) ?? Infinity) - (distanceOf(b.address) ?? Infinity));

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      {Object.values(group.joinRequests).map(request => (
        <Card key={request.address} style={styles.block}>
          <View style={styles.row}>
            <Avatar name={request.name} color={request.color} size={36} />
            <View style={[styles.flex, styles.gap]}>
              <Text style={[styles.title, { color: theme.text }]}>{request.name}</Text>
              <Text style={[styles.sub, { color: theme.muted }]}>
                wants to join · {formatAgo(request.requestedAt, now)}
              </Text>
            </View>
          </View>
          <View style={[styles.row, styles.top]}>
            <Button
              label="Approve"
              compact
              loading={busy === `approve:${request.address}`}
              onPress={() =>
                run(`approve:${request.address}`, () => approveJoin(groupId, request.address))
              }
              style={styles.flex}
            />
            <Button
              label="Decline"
              variant="secondary"
              compact
              onPress={() => declineJoin(groupId, request.address)}
              style={[styles.flex, styles.gap]}
            />
          </View>
        </Card>
      ))}

      <Button
        label="Invite friends"
        disabled={!meshRunning}
        onPress={() => navigation.navigate('ShareCode', { groupId })}
        style={styles.block}
      />

      <View style={styles.block}>
        <SectionTitle>{`People (${members.length + 1})`}</SectionTitle>
        {sorted.length === 0 ? (
          <Text style={[styles.sub, { color: theme.muted }]}>
            Just you. Share the invite code, or scan someone's personal code to add them.
          </Text>
        ) : (
          sorted.map(member => {
            const distance = distanceOf(member.address);
            const prox = proximity[member.address];
            const ble = isFresh(prox, now) ? formatRange(rssiToRange(prox.rssi)) : undefined;
            return (
              <Pressable
                key={member.address}
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate('Find', { address: member.address, groupId })
                }
                style={[styles.row, styles.member, { borderColor: theme.border }]}>
                <Avatar
                  name={member.name}
                  color={member.color ?? theme.faint}
                  size={36}
                  dimmed={!member.lastHeardAt || now - member.lastHeardAt > STALE_MS}
                />
                <View style={[styles.flex, styles.gap]}>
                  <Text style={[styles.title, { color: theme.text }]}>
                    {member.name ?? shortAddress(member.address)}
                    {member.sos?.active ? '  · SOS' : ''}
                  </Text>
                  <Text style={[styles.sub, { color: theme.muted }]}>
                    {member.lastHeardAt
                      ? `Heard ${formatAgo(member.lastHeardAt, now)}`
                      : 'Not heard from yet'}
                  </Text>
                </View>
                <Text style={[styles.title, { color: theme.text }]}>
                  {ble ?? (distance !== undefined ? formatDistance(distance) : '—')}
                </Text>
              </Pressable>
            );
          })
        )}
      </View>

      <View style={styles.block}>
        <SectionTitle>Your color here</SectionTitle>
        <ColorPicker
          colors={MEMBER_COLORS}
          value={group.myColor}
          taken={takenColors(group)}
          onChange={color => {
            setMyColor(groupId, color);
            scheduleAnnounce(groupId);
          }}
        />
      </View>

      <View style={[styles.row, styles.block]}>
        {group.isAdmin ? (
          <Button
            label="Add by their code"
            variant="secondary"
            compact
            loading={busy === 'scan'}
            disabled={!meshRunning}
            onPress={addByScan}
            style={[styles.flex, styles.right]}
          />
        ) : null}
        <Button
          label="Ping everyone"
          variant="secondary"
          compact
          loading={busy === 'pingall'}
          disabled={!meshRunning || members.length === 0}
          onPress={() => run('pingall', () => sendPing(groupId))}
          style={styles.flex}
        />
      </View>
      <Button label="Leave group" variant="ghost" onPress={confirmLeave} style={styles.top} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  content: { padding: 20, paddingBottom: 40 },
  flex: { flex: 1 },
  gap: { marginLeft: 10 },
  right: { marginRight: 10 },
  top: { marginTop: 14 },
  row: { flexDirection: 'row', alignItems: 'center' },
  block: { marginTop: 16 },
  title: { fontSize: 16, fontWeight: '800' },
  sub: { marginTop: 2, fontSize: 13, fontWeight: '500', lineHeight: 18 },
  member: { paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
});

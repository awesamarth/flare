import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MeshStatusPill } from '../components/MeshStatusPill';
import { Radar } from '../components/Radar';
import { SosButton } from '../components/SosButton';
import { Avatar, Badge, Button } from '../components/ui';
import {
  bearingDeg,
  compassPoint,
  distanceMeters,
  formatDistance,
  relativeDirection,
} from '../lib/geo';
import { formatRange, isFresh, rssiToRange } from '../lib/proximity';
import { formatAgo, shortAddress } from '../lib/time';
import { useGroupRadar } from '../lib/useGroupRadar';
import { useNow } from '../lib/useNow';
import type { ScreenProps } from '../navigation/types';
import { requestPocketMode } from '../services/location';
import { handleScan, sendPing, startMesh } from '../services/mesh';
import { scanQr } from '../services/scanner';
import { useGroups } from '../state/groups';
import { directConv, groupConv, useMessages } from '../state/messages';
import { useRuntime } from '../state/runtime';
import { useTheme, type Theme } from '../theme';

export function HomeScreen({ navigation }: ScreenProps<'Home'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(1000);

  const groups = useGroups(s => s.groups);
  const activeGroupId = useGroups(s => s.activeGroupId);
  const setActiveGroup = useGroups(s => s.setActiveGroup);
  const unread = useMessages(s => s.unread);
  const meshStatus = useRuntime(s => s.meshStatus);
  const position = useRuntime(s => s.position);
  const locationStatus = useRuntime(s => s.locationStatus);
  const heading = useRuntime(s => s.heading);
  const headingAvailable = useRuntime(s => s.headingAvailable);
  const proximity = useRuntime(s => s.proximity);
  const backgroundLocation = useRuntime(s => s.backgroundLocation);

  const newest = Object.values(groups).sort((a, b) => b.createdAt - a.createdAt)[0];
  const group = (activeGroupId ? groups[activeGroupId] : undefined) ?? newest;

  useEffect(() => {
    if (group && group.id !== activeGroupId) {
      setActiveGroup(group.id);
    }
  }, [group, activeGroupId, setActiveGroup]);

  const { members, located, radarMembers } = useGroupRadar(group, now, theme.faint);
  const [selected, setSelected] = useState<string | undefined>();
  const [radarSize, setRadarSize] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);

  const selectedMember = selected ? group?.members[selected] : undefined;
  const selectedLocated = located.find(l => l.member.address === selected);
  const useHeading = headingAvailable && !!heading && heading.quality !== 'poor';
  const meshRunning = meshStatus === 'running';
  const meshProblem =
    meshStatus === 'bluetooth_off' || meshStatus === 'permission_denied' || meshStatus === 'error';
  const totalUnread = Object.values(unread).reduce((sum, n) => sum + n, 0);
  const groupUnread = group ? unread[groupConv(group.id)] ?? 0 : 0;
  const requests = group ? Object.keys(group.joinRequests).length : 0;
  const sosMembers = members.filter(m => m.sos?.active);
  const unplaced = members.length - located.length;
  const meet = group?.meet ?? undefined;
  const meetWhere =
    meet && position
      ? { distance: distanceMeters(position, meet), bearing: bearingDeg(position, meet) }
      : undefined;
  const selectedProx = selected ? proximity[selected] : undefined;
  const bleRange = isFresh(selectedProx, now) ? rssiToRange(selectedProx.rssi) : undefined;
  // Bluetooth wins when GPS can't resolve the distance (error bigger than it).
  const preferBle =
    !!bleRange && (!selectedLocated || selectedLocated.accuracy > selectedLocated.distance);

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

  const scan = () =>
    run('scan', async () => {
      const value = await scanQr();
      if (!value) {
        return;
      }
      const outcome = await handleScan(value);
      if (outcome.kind === 'join_requested') {
        Alert.alert(
          'Request sent',
          `The admin of ${outcome.groupName} needs to approve you. Stay near them with Flare open.`,
        );
      } else if (outcome.kind === 'already_member') {
        setActiveGroup(outcome.groupId);
      } else if (outcome.kind === 'person') {
        navigation.navigate('Person', { address: outcome.address, name: outcome.name });
      }
    });

  const sensorLine = (() => {
    if (locationStatus === 'denied') {
      return { text: 'Location is off for Flare, so distances are unavailable', warn: true };
    }
    if (locationStatus === 'off') {
      return { text: 'Turn on location services to see distances', warn: true };
    }
    if (!position) {
      return { text: 'Finding GPS… can take a minute without internet', warn: false };
    }
    if (headingAvailable && heading?.quality === 'poor') {
      return { text: 'Compass needs calibrating: wave phone in a figure 8', warn: true };
    }
    const stale = now - position.ts > 60_000;
    return {
      text: `GPS ±${Math.round(position.acc)} m${stale ? ` · last fix ${formatAgo(position.ts, now)}` : ''}${
        useHeading ? '' : ' · north up'
      }`,
      warn: stale,
    };
  })();

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
        },
      ]}>
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Groups and chats"
          onPress={() => navigation.navigate('Groups')}
          style={styles.titleBox}>
          <View style={styles.eyebrowRow}>
            <Text style={[styles.eyebrow, { color: theme.primary }]}>
              {group ? 'FLARE GROUP' : 'FLARE'} ▾
            </Text>
            <Badge count={totalUnread} />
          </View>
          <Text style={[styles.title, { color: theme.text }]} numberOfLines={1}>
            {group?.name ?? 'No group yet'}
          </Text>
        </Pressable>
        <MeshStatusPill onPress={() => navigation.navigate('Status')} />
      </View>

      {meshProblem ? (
        <Pressable
          onPress={() => startMesh()}
          style={[styles.banner, { backgroundColor: theme.dangerSoft }]}>
          <Text style={[styles.bannerText, { color: theme.danger }]}>
            {meshStatus === 'bluetooth_off'
              ? 'Bluetooth is off. Turn it on, then tap to retry.'
              : meshStatus === 'permission_denied'
                ? 'Flare needs Nearby devices permission. Tap to retry.'
                : "Mesh couldn't start. Tap to retry."}
          </Text>
        </Pressable>
      ) : null}
      {sosMembers.map(m => (
        <Pressable
          key={m.address}
          onPress={() => setSelected(m.address)}
          style={[styles.banner, { backgroundColor: theme.danger }]}>
          <Text style={[styles.bannerText, styles.onDanger]}>
            {m.name ?? 'Someone'} sent an SOS {m.sos ? formatAgo(m.sos.ts, now) : ''}
          </Text>
        </Pressable>
      ))}
      {group && locationStatus === 'ok' && !backgroundLocation ? (
        <Pressable
          onPress={() =>
            requestPocketMode().catch(e =>
              Alert.alert('Could not ask', e instanceof Error ? e.message : String(e)),
            )
          }
          style={[styles.banner, { backgroundColor: theme.surface }]}>
          <Text style={[styles.bannerText, { color: theme.text }]}>
            Keep sharing your location with the phone in your pocket · Allow all the time
          </Text>
        </Pressable>
      ) : null}
      {group && requests > 0 ? (
        <Pressable
          onPress={() => navigation.navigate('Group', { groupId: group.id })}
          style={[styles.banner, { backgroundColor: theme.primarySoft }]}>
          <Text style={[styles.bannerText, { color: theme.text }]}>
            {requests} {requests === 1 ? 'person wants' : 'people want'} to join · Review
          </Text>
        </Pressable>
      ) : null}

      <View
        style={styles.hero}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setRadarSize(Math.floor(Math.min(width, height, 400)));
        }}>
        {radarSize > 0 ? (
          <Radar
            size={radarSize}
            members={radarMembers}
            heading={useHeading ? heading?.deg : undefined}
            selected={selected}
            onSelect={address => setSelected(prev => (prev === address ? undefined : address))}
            meet={meetWhere}
            onSelectMeet={group ? () => navigation.navigate('Meet', { groupId: group.id }) : undefined}
          />
        ) : null}
      </View>
      <Text style={[styles.sensor, { color: sensorLine.warn ? theme.warning : theme.faint }]}>
        {sensorLine.text}
      </Text>

      <View style={[styles.sheet, { backgroundColor: theme.surface, borderColor: theme.border }]}>
        {!group ? (
          <>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>Start a group</Text>
            <Text style={[styles.sheetBody, { color: theme.muted }]}>
              Make one and have friends scan your code, or scan a friend's group code to join.
            </Text>
            <View style={styles.actions}>
              <Button
                label="New group"
                disabled={!meshRunning}
                onPress={() => navigation.navigate('NewGroup')}
                style={styles.flex}
              />
              <Button
                label="Scan code"
                variant="secondary"
                disabled={!meshRunning}
                loading={busy === 'scan'}
                onPress={scan}
                style={[styles.flex, styles.gap]}
              />
            </View>
          </>
        ) : selectedMember ? (
          <>
            <View style={styles.sheetTop}>
              <View style={styles.identity}>
                <Avatar
                  name={selectedMember.name}
                  color={selectedMember.color ?? theme.faint}
                  size={52}
                />
                <View style={styles.identityText}>
                  <Text style={[styles.friendName, { color: theme.text }]} numberOfLines={1}>
                    {selectedMember.name ?? shortAddress(selectedMember.address)}
                  </Text>
                  <Text style={[styles.sheetBody, { color: theme.muted }]}>
                    {selectedLocated && useHeading && heading
                      ? relativeDirection(selectedLocated.bearing - heading.deg)
                      : selectedMember.loc
                        ? 'On the radar'
                        : 'No location yet'}
                  </Text>
                </View>
              </View>
              {preferBle && bleRange ? (
                <View style={styles.distanceBlock}>
                  <Text style={[styles.distance, { color: theme.text }]}>
                    {formatRange(bleRange)}
                  </Text>
                  <Text style={[styles.caption, { color: theme.muted }]}>via Bluetooth</Text>
                </View>
              ) : selectedLocated ? (
                <View style={styles.distanceBlock}>
                  <Text style={[styles.distance, { color: theme.text }]}>
                    {formatDistance(selectedLocated.distance)}
                  </Text>
                  <Text style={[styles.caption, { color: theme.muted }]}>away</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.metrics}>
              <Metric
                theme={theme}
                label="Direction"
                value={
                  selectedLocated
                    ? `${compassPoint(selectedLocated.bearing)} ${Math.round(selectedLocated.bearing)}°`
                    : '—'
                }
              />
              <Metric
                theme={theme}
                label="Seen"
                value={selectedMember.loc ? formatAgo(selectedMember.loc.ts, now) : '—'}
              />
              <Metric
                theme={theme}
                label="Accuracy"
                value={selectedLocated ? `±${formatDistance(selectedLocated.accuracy)}` : '—'}
              />
            </View>
            <View style={styles.actions}>
              <Button
                label="Ping"
                disabled={!meshRunning}
                loading={busy === 'ping'}
                onPress={() => run('ping', () => sendPing(group.id, selectedMember.address))}
              />
              <Button
                label="Chat"
                variant="secondary"
                onPress={() =>
                  navigation.navigate('Chat', { conv: directConv(selectedMember.address) })
                }
                style={[styles.flex, styles.gap]}
              />
              <Button
                label="Find"
                variant="secondary"
                onPress={() =>
                  navigation.navigate('Find', {
                    address: selectedMember.address,
                    groupId: group.id,
                  })
                }
                style={[styles.flex, styles.gap]}
              />
            </View>
          </>
        ) : (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Group', { groupId: group.id })}
              style={styles.sheetTop}>
              <View style={styles.flex}>
                <Text style={[styles.sheetTitle, { color: theme.text }]}>
                  {members.length === 0
                    ? "It's just you so far"
                    : `${members.length + 1} people · ${located.length} on radar`}
                </Text>
                <Text style={[styles.sheetBody, { color: theme.muted }]}>
                  {members.length === 0
                    ? 'Tap Details to invite friends.'
                    : unplaced > 0
                      ? `${unplaced} haven't shared a location yet · tap a dot for details`
                      : 'Tap a dot for distance and direction'}
                </Text>
              </View>
              <Text style={[styles.link, { color: theme.primary }]}>Details</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => navigation.navigate('Meet', { groupId: group.id })}
              style={[styles.meetRow, { borderColor: theme.border }]}>
              <Text style={[styles.meetIcon, { color: theme.primary }]}>◆</Text>
              <Text style={[styles.meetText, { color: theme.text }]} numberOfLines={1}>
                {meet
                  ? `Meet: ${meet.label}${meet.when ? ` · ${meet.when}` : ''}${
                      !meetWhere
                        ? ''
                        : meetWhere.distance <= Math.max(10, meet.acc + (position?.acc ?? 0))
                          ? ' · you are here'
                          : ` · ${formatDistance(meetWhere.distance)} ${compassPoint(meetWhere.bearing)}`
                    }`
                  : 'Set a meeting point'}
              </Text>
            </Pressable>
            <View style={styles.actions}>
              <Pressable
                accessibilityRole="button"
                onPress={() => navigation.navigate('Chat', { conv: groupConv(group.id) })}
                style={[styles.chat, { backgroundColor: theme.primary }]}>
                <Text style={[styles.chatText, { color: theme.onPrimary }]}>Chat</Text>
                <Badge count={groupUnread} />
              </Pressable>
              <Button
                label="Map"
                variant="secondary"
                onPress={() => navigation.navigate('Map', { groupId: group.id })}
                style={[styles.flex, styles.gap]}
              />
              <View style={styles.gap}>
                <SosButton groupId={group.id} active={!!group.mySos} disabled={!meshRunning} />
              </View>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function Metric({ theme, label, value }: { theme: Theme; label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, paddingHorizontal: 20 },
  flex: { flex: 1 },
  gap: { marginLeft: 10 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleBox: { flexShrink: 1, marginRight: 12 },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },
  title: { marginTop: 2, fontSize: 32, lineHeight: 38, fontWeight: '700' },
  banner: { marginTop: 10, borderRadius: 14, paddingVertical: 10, paddingHorizontal: 14 },
  bannerText: { fontSize: 14, fontWeight: '800' },
  onDanger: { color: '#FFFFFF' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', marginVertical: 8 },
  sensor: { textAlign: 'center', fontSize: 12, fontWeight: '700', marginBottom: 12 },
  sheet: { borderRadius: 28, borderWidth: 1, padding: 18 },
  sheetTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle: { fontSize: 18, fontWeight: '800' },
  sheetBody: { marginTop: 3, fontSize: 14, fontWeight: '600' },
  link: { fontSize: 14, fontWeight: '800', marginLeft: 12 },
  identity: { flexDirection: 'row', alignItems: 'center', flexShrink: 1 },
  identityText: { marginLeft: 12, flexShrink: 1 },
  friendName: { fontSize: 23, fontWeight: '800' },
  distanceBlock: { alignItems: 'flex-end', marginLeft: 12 },
  distance: { fontSize: 30, fontWeight: '800' },
  caption: { marginTop: -2, fontSize: 12, fontWeight: '700' },
  metrics: { flexDirection: 'row', marginTop: 18, marginHorizontal: -5 },
  metric: { flex: 1, paddingHorizontal: 5 },
  metricLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: { marginTop: 5, fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', alignItems: 'center', marginTop: 18 },
  meetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  meetIcon: { fontSize: 14, marginRight: 8 },
  meetText: { flex: 1, fontSize: 14, fontWeight: '700' },
  chat: {
    flex: 1,
    height: 50,
    borderRadius: 25,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  chatText: { fontSize: 15, fontWeight: '900' },
});

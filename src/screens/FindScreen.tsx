import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  Vibration,
  View,
} from 'react-native';
import { Avatar, Button, Card } from '../components/ui';
import {
  bearingDeg,
  compassPoint,
  distanceMeters,
  formatDistance,
  relativeDirection,
} from '../lib/geo';
import {
  formatRange,
  isFresh,
  rssiToRange,
  signalStrength,
} from '../lib/proximity';
import { formatAgo, shortAddress } from '../lib/time';
import { useNow } from '../lib/useNow';
import type { ScreenProps } from '../navigation/types';
import { sendPing } from '../services/mesh';
import { useGroups } from '../state/groups';
import { directConv } from '../state/messages';
import { useRuntime } from '../state/runtime';
import { useTheme } from '../theme';

/**
 * Close-range finder. GPS gets you to the right area; Bluetooth signal does
 * the last stretch, where GPS error is bigger than the distance itself.
 */
export function FindScreen({ navigation, route }: ScreenProps<'Find'>) {
  const { groupId, address } = route.params;
  const theme = useTheme();
  const now = useNow(500);
  const member = useGroups(s =>
    groupId ? s.groups[groupId]?.members[address] : undefined,
  );
  const proximity = useRuntime(s => s.proximity[address]);
  const position = useRuntime(s => s.position);
  const heading = useRuntime(s => s.heading);
  const meshRunning = useRuntime(s => s.meshStatus === 'running');
  const [haptics, setHaptics] = useState(true);

  const name = member?.name ?? shortAddress(address);
  const fresh = isFresh(proximity, now);
  const range = fresh ? rssiToRange(proximity.rssi) : undefined;

  useLayoutEffect(() => {
    navigation.setOptions({ title: `Find ${name}` });
  }, [navigation, name]);

  // Pulse faster the closer they are, like a metal detector.
  const strength = fresh ? signalStrength(proximity.rssi) : 0;
  useEffect(() => {
    if (!haptics || !fresh) {
      return;
    }
    const interval = Math.round(1600 - strength * 1300);
    const id = setInterval(() => Vibration.vibrate(30), interval);
    return () => clearInterval(id);
  }, [haptics, fresh, strength]);
  useEffect(() => () => Vibration.cancel(), []);

  const gps =
    position && member?.loc
      ? {
          distance: distanceMeters(position, member.loc),
          bearing: bearingDeg(position, member.loc),
          accuracy: position.acc + member.loc.acc,
        }
      : undefined;

  const trendText = !fresh
    ? null
    : proximity.trend === 'closer'
    ? 'Warmer, keep going'
    : proximity.trend === 'farther'
    ? 'Colder, turn around'
    : 'Hold steady or try another direction';
  const trendColor = !fresh
    ? theme.muted
    : proximity.trend === 'closer'
    ? theme.success
    : proximity.trend === 'farther'
    ? theme.danger
    : theme.text;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Avatar name={name} color={member?.color ?? theme.faint} size={72} />

      {range ? (
        <>
          <Text style={[styles.big, { color: theme.text }]}>
            {formatRange(range)}
          </Text>
          <Text style={[styles.trend, { color: trendColor }]}>{trendText}</Text>
          <View style={[styles.meter, { backgroundColor: theme.surfaceAlt }]}>
            <View
              style={[
                styles.meterFill,
                {
                  width: `${Math.round(strength * 100)}%`,
                  backgroundColor: trendColor,
                },
              ]}
            />
          </View>
          <Text style={[styles.note, { color: theme.faint }]}>
            Bluetooth signal {Math.round(proximity.rssi)} dBm ·{' '}
            {formatAgo(proximity.at, now)}. Bodies and pockets weaken it, so
            trust the trend more than the number.
          </Text>
        </>
      ) : (
        <>
          <Text style={[styles.big, { color: theme.muted }]}>No signal</Text>
          <Text style={[styles.note, { color: theme.muted }]}>
            {name} isn't in direct Bluetooth range right now (roughly 10 to 30
            m). Use the GPS direction below to get closer.
          </Text>
        </>
      )}

      <Card style={styles.card}>
        <Text style={[styles.cardLabel, { color: theme.muted }]}>GPS</Text>
        {gps ? (
          <>
            <Text style={[styles.cardValue, { color: theme.text }]}>
              {formatDistance(gps.distance)}{' '}
              {heading
                ? relativeDirection(gps.bearing - heading.deg)
                : compassPoint(gps.bearing)}
            </Text>
            <Text style={[styles.note, { color: theme.faint }]}>
              ±{formatDistance(gps.accuracy)} · their fix{' '}
              {formatAgo(member?.loc?.ts ?? 0, now)}
              {gps.accuracy > gps.distance
                ? ' · too close for GPS, use Bluetooth'
                : ''}
            </Text>
          </>
        ) : (
          <Text style={[styles.note, { color: theme.muted }]}>
            {member?.loc
              ? 'Waiting for your GPS…'
              : `${name} hasn't shared a location yet.`}
          </Text>
        )}
      </Card>

      <View style={styles.row}>
        {groupId ? (
          <Button
            label="Ping"
            disabled={!meshRunning}
            onPress={() =>
              sendPing(groupId, address).catch(e =>
                Alert.alert(
                  "Ping didn't send",
                  e instanceof Error ? e.message : String(e),
                ),
              )
            }
            style={styles.flex}
          />
        ) : null}
        <Button
          label="Chat"
          variant="secondary"
          onPress={() =>
            navigation.navigate('Chat', { conv: directConv(address) })
          }
          style={[styles.flex, groupId ? styles.gap : null]}
        />
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: haptics }}
        onPress={() => setHaptics(h => !h)}
        style={styles.toggle}
      >
        <Text style={[styles.toggleText, { color: theme.primary }]}>
          Vibration pulses: {haptics ? 'on' : 'off'}
        </Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, alignItems: 'center' },
  big: { marginTop: 20, fontSize: 48, fontWeight: '900' },
  trend: { marginTop: 6, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  meter: {
    marginTop: 20,
    alignSelf: 'stretch',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
  },
  meterFill: { height: '100%', borderRadius: 7 },
  note: { marginTop: 10, fontSize: 13, lineHeight: 18, textAlign: 'center' },
  card: { marginTop: 24, alignSelf: 'stretch', alignItems: 'center' },
  cardLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  cardValue: { marginTop: 4, fontSize: 22, fontWeight: '800' },
  row: { flexDirection: 'row', alignSelf: 'stretch', marginTop: 24 },
  flex: { flex: 1 },
  gap: { marginLeft: 10 },
  toggle: { marginTop: 18, padding: 8 },
  toggleText: { fontSize: 14, fontWeight: '800' },
});

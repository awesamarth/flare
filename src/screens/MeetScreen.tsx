import React, { useLayoutEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button, Card, SectionTitle } from '../components/ui';
import {
  bearingDeg,
  compassPoint,
  distanceMeters,
  formatDistance,
  relativeDirection,
} from '../lib/geo';
import { formatAgo, shortAddress } from '../lib/time';
import { useNow } from '../lib/useNow';
import type { ScreenProps } from '../navigation/types';
import { clearMeet, setMeetHere } from '../services/meet';
import { useGroups } from '../state/groups';
import { useRuntime } from '../state/runtime';
import { useTheme } from '../theme';

/** See, set or clear the group's meeting point. Anyone in the group can. */
export function MeetScreen({ navigation, route }: ScreenProps<'Meet'>) {
  const { groupId } = route.params;
  const theme = useTheme();
  const now = useNow(2000);
  const meet = useGroups(s => s.groups[groupId]?.meet ?? null);
  const position = useRuntime(s => s.position);
  const heading = useRuntime(s => s.heading);
  const meshRunning = useRuntime(s => s.meshStatus === 'running');
  const [label, setLabel] = useState(meet?.label ?? '');
  const [when, setWhen] = useState(meet?.when ?? '');
  const [busy, setBusy] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: 'Meeting point' });
  }, [navigation]);

  const run = async (key: string, task: () => Promise<unknown>) => {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      Alert.alert("Couldn't update", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const where =
    meet && position
      ? { distance: distanceMeters(position, meet), bearing: bearingDeg(position, meet) }
      : undefined;

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="always">
      {meet ? (
        <Card>
          <Text style={[styles.label, { color: theme.text }]}>{meet.label}</Text>
          {meet.when ? (
            <Text style={[styles.when, { color: theme.primary }]}>{meet.when}</Text>
          ) : null}
          {where ? (
            <Text style={[styles.where, { color: theme.text }]}>
              {where.distance <= Math.max(10, meet.acc + (position?.acc ?? 0))
                ? "You're about here"
                : `${formatDistance(where.distance)} ${
                    heading
                      ? relativeDirection(where.bearing - heading.deg)
                      : compassPoint(where.bearing)
                  }`}
            </Text>
          ) : null}
          <Text style={[styles.meta, { color: theme.muted }]}>
            Set by {meet.byName ?? shortAddress(meet.by)} {formatAgo(meet.ts, now)} · pinned ±
            {formatDistance(meet.acc)}
          </Text>
        </Card>
      ) : (
        <Text style={[styles.empty, { color: theme.muted }]}>
          No meeting point yet. Stand at the spot and pin it, so anyone who loses the group knows
          where to go, even if they were out of range when you set it.
        </Text>
      )}

      <View style={styles.block}>
        <SectionTitle>{meet ? 'Move it here' : 'Pin it here'}</SectionTitle>
        <TextInput
          value={label}
          onChangeText={setLabel}
          placeholder="Where, e.g. Left of Gate 3"
          placeholderTextColor={theme.faint}
          maxLength={60}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        />
        <TextInput
          value={when}
          onChangeText={setWhen}
          placeholder="When (optional), e.g. 11:30 pm"
          placeholderTextColor={theme.faint}
          maxLength={30}
          style={[
            styles.input,
            { color: theme.text, backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        />
        <Text style={[styles.meta, { color: theme.faint }]}>
          {position
            ? `Uses where you're standing now (GPS ±${Math.round(position.acc)} m).`
            : 'Waiting for GPS before you can pin.'}
        </Text>
        <Button
          label="Pin where I'm standing"
          disabled={!position || !meshRunning}
          loading={busy === 'set'}
          onPress={() => run('set', () => setMeetHere(groupId, label, when))}
          style={styles.block}
        />
        {meet ? (
          <Button
            label="Clear meeting point"
            variant="ghost"
            disabled={!meshRunning}
            loading={busy === 'clear'}
            onPress={() => run('clear', () => clearMeet(groupId))}
            style={styles.top}
          />
        ) : null}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40 },
  block: { marginTop: 20 },
  top: { marginTop: 8 },
  label: { fontSize: 24, fontWeight: '800' },
  when: { marginTop: 4, fontSize: 16, fontWeight: '800' },
  where: { marginTop: 10, fontSize: 18, fontWeight: '800' },
  meta: { marginTop: 8, fontSize: 13, lineHeight: 18 },
  empty: { fontSize: 15, lineHeight: 21 },
  input: {
    height: 50,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
});

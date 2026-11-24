import React, { useLayoutEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text } from 'react-native';
import { Avatar, Button, SectionTitle } from '../components/ui';
import { shortAddress } from '../lib/time';
import type { ScreenProps } from '../navigation/types';
import { addMember } from '../services/mesh';
import { useGroups } from '../state/groups';
import { directConv } from '../state/messages';
import { useTheme } from '../theme';

/** What to do with someone's personal code: message them or add them. */
export function PersonScreen({ navigation, route }: ScreenProps<'Person'>) {
  const { address, name } = route.params;
  const theme = useTheme();
  const groups = useGroups(s => s.groups);
  const [busy, setBusy] = useState<string | null>(null);
  const display = name ?? shortAddress(address);
  const adminGroups = Object.values(groups).filter(
    g => g.isAdmin && !g.members[address],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: display });
  }, [navigation, display]);

  const add = async (groupId: string) => {
    setBusy(groupId);
    try {
      await addMember(groupId, address, name);
      navigation.replace('Group', { groupId });
    } catch (error) {
      Alert.alert(
        "Couldn't add",
        error instanceof Error ? error.message : String(error),
      );
      setBusy(null);
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Avatar name={display} color={theme.faint} size={72} />
      <Text style={[styles.name, { color: theme.text }]}>{display}</Text>
      <Text style={[styles.address, { color: theme.faint }]} selectable>
        {address}
      </Text>

      <Button
        label="Send a message"
        onPress={() =>
          navigation.replace('Chat', { conv: directConv(address) })
        }
        style={styles.cta}
      />

      {adminGroups.length > 0 ? (
        <>
          <SectionTitle>Add to a group you run</SectionTitle>
          {adminGroups.map(group => (
            <Button
              key={group.id}
              label={`Add to ${group.name}`}
              variant="secondary"
              loading={busy === group.id}
              disabled={busy !== null}
              onPress={() => add(group.id)}
              style={styles.groupButton}
            />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, alignItems: 'center' },
  name: { marginTop: 14, fontSize: 24, fontWeight: '800' },
  address: { marginTop: 6, fontSize: 12, fontWeight: '600' },
  cta: { marginTop: 28, marginBottom: 28, alignSelf: 'stretch' },
  groupButton: { alignSelf: 'stretch', marginBottom: 10 },
});

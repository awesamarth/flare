import React, { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { Button } from '../components/ui';
import type { ScreenProps } from '../navigation/types';
import { createGroup } from '../services/mesh';
import { useGroups } from '../state/groups';
import { useTheme } from '../theme';

export function NewGroupScreen({ navigation }: ScreenProps<'NewGroup'>) {
  const theme = useTheme();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();

  const create = async () => {
    setBusy(true);
    try {
      const groupId = await createGroup(trimmed);
      useGroups.getState().setActiveGroup(groupId);
      navigation.popTo('Home');
    } catch (error) {
      Alert.alert(
        "Couldn't create group",
        error instanceof Error ? error.message : String(error),
      );
      setBusy(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Text style={[styles.label, { color: theme.muted }]}>Group name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Sunburn crew"
        placeholderTextColor={theme.faint}
        maxLength={40}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={() => trimmed && !busy && create()}
        style={[
          styles.input,
          {
            color: theme.text,
            backgroundColor: theme.surface,
            borderColor: theme.border,
          },
        ]}
      />
      <Text style={[styles.hint, { color: theme.faint }]}>
        You'll be the admin. Friends join by scanning your group code, and you
        approve each one. Messages and locations are end-to-end encrypted.
      </Text>
      <Button
        label="Create group"
        onPress={create}
        loading={busy}
        disabled={!trimmed}
        style={styles.cta}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    padding: 24,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '600',
  },
  hint: {
    marginTop: 14,
    fontSize: 14,
    lineHeight: 20,
  },
  cta: {
    marginTop: 28,
  },
});

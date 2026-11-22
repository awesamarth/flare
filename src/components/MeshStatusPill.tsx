import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRuntime } from '../state/runtime';
import { useTheme } from '../theme';

/**
 * Honest mesh status: "live" only when the mesh is running AND at least one
 * peer is in range. Otherwise says what's actually going on.
 */
export function MeshStatusPill({ onPress }: { onPress?: () => void }) {
  const theme = useTheme();
  const status = useRuntime(s => s.meshStatus);
  const peers = useRuntime(s => Object.keys(s.neighbors).length);

  let label: string;
  let color: string;
  switch (status) {
    case 'running':
      label = peers > 0 ? `${peers} nearby` : 'No one nearby';
      color = peers > 0 ? theme.success : theme.warning;
      break;
    case 'starting':
      label = 'Starting…';
      color = theme.faint;
      break;
    case 'bluetooth_off':
      label = 'Bluetooth off';
      color = theme.danger;
      break;
    case 'permission_denied':
      label = 'Needs permission';
      color = theme.danger;
      break;
    case 'error':
      label = 'Mesh error';
      color = theme.danger;
      break;
    default:
      label = 'Offline';
      color = theme.faint;
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Mesh status: ${label}`}
      onPress={onPress}
      style={[styles.pill, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.text, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 34,
    paddingHorizontal: 12,
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});

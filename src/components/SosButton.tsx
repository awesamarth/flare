import React, { useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import { sendSos } from '../services/mesh';
import { useTheme } from '../theme';
import { Button } from './ui';

const HOLD_MS = 1200;

/** Hold to raise an SOS (so it can't fire from a pocket tap); tap to cancel. */
export function SosButton({
  groupId,
  active,
  disabled,
}: {
  groupId: string;
  active: boolean;
  disabled: boolean;
}) {
  const theme = useTheme();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async (on: boolean) => {
    setBusy(true);
    try {
      await sendSos(groupId, on);
    } catch (error) {
      Alert.alert("SOS didn't send", error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    return (
      <Button
        label="Cancel SOS"
        variant="danger"
        loading={busy}
        onPress={() => send(false)}
        style={styles.button}
      />
    );
  }

  const start = () => {
    timer.current = setTimeout(() => {
      timer.current = null;
      send(true);
    }, HOLD_MS);
  };
  const end = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Hold to send SOS"
      disabled={disabled || busy}
      onPressIn={start}
      onPressOut={end}
      style={({ pressed }) => [
        styles.button,
        styles.hold,
        {
          borderColor: theme.danger,
          backgroundColor: pressed ? theme.danger : theme.dangerSoft,
        },
        disabled && styles.disabled,
      ]}>
      {({ pressed }) => (
        <Text style={[styles.label, pressed ? styles.onDanger : { color: theme.danger }]}>
          {pressed ? 'Hold…' : 'SOS'}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  onDanger: { color: '#FFFFFF' },
  disabled: { opacity: 0.5 },
  button: { minWidth: 88 },
  hold: {
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  label: { fontSize: 15, fontWeight: '900' },
});

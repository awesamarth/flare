import React, { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StackActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/types';
import { useGroups } from '../state/groups';
import { directConv } from '../state/messages';
import { useRuntime, type Alert } from '../state/runtime';
import { useTheme } from '../theme';

const INFO_TIMEOUT_MS = 6000;

/** In-app banners for pings, SOS, join requests and messages. */
export function AlertHost() {
  const alerts = useRuntime(s => s.alerts);
  const current = alerts[alerts.length - 1];
  if (!current) {
    return null;
  }
  return <Banner key={current.id} alert={current} />;
}

function Banner({ alert }: { alert: Alert }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const dismiss = useRuntime(s => s.dismissAlert);
  const danger = alert.tone === 'danger';

  useEffect(() => {
    if (danger) {
      return;
    }
    const id = setTimeout(() => dismiss(alert.id), INFO_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [alert.id, danger, dismiss]);

  const open = () => {
    dismiss(alert.id);
    if (!navigationRef.isReady()) {
      return;
    }
    if (alert.target?.groupId) {
      // Show that group on the radar.
      useGroups.getState().setActiveGroup(alert.target.groupId);
      navigationRef.dispatch(StackActions.popTo('Home'));
    } else if (alert.target?.address) {
      navigationRef.navigate('Chat', { conv: directConv(alert.target.address) });
    }
  };

  return (
    <View pointerEvents="box-none" style={[styles.wrap, { top: insets.top + 8 }]}>
      <Pressable
        accessibilityRole="alert"
        onPress={open}
        style={[
          styles.banner,
          {
            backgroundColor: danger ? theme.danger : theme.surface,
            borderColor: danger ? theme.danger : theme.border,
          },
        ]}>
        <View style={styles.textBox}>
          <Text style={[styles.title, danger ? styles.onDanger : { color: theme.text }]}>
            {alert.title}
          </Text>
          {alert.body ? (
            <Text
              numberOfLines={2}
              style={[styles.body, danger ? styles.onDanger : { color: theme.muted }]}>
              {alert.body}
            </Text>
          ) : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          hitSlop={12}
          onPress={() => dismiss(alert.id)}>
          <Text style={[styles.close, danger ? styles.onDanger : { color: theme.muted }]}>✕</Text>
        </Pressable>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  onDanger: { color: '#FFFFFF' },
  wrap: {
    position: 'absolute',
    left: 12,
    right: 12,
  },
  banner: {
    borderRadius: 18,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  textBox: {
    flex: 1,
    marginRight: 12,
  },
  title: {
    fontSize: 15,
    fontWeight: '800',
  },
  body: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: '600',
  },
  close: {
    fontSize: 16,
    fontWeight: '800',
  },
});

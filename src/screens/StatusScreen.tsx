import React, { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Button, Card, SectionTitle } from '../components/ui';
import { formatAgo, shortAddress } from '../lib/time';
import { useNow } from '../lib/useNow';
import { formatRange, isFresh, rssiToRange } from '../lib/proximity';
import { getMeshDiagnostics, restartMesh, startMesh } from '../services/mesh';
import { useProfile } from '../state/profile';
import { useRuntime } from '../state/runtime';
import { useTheme } from '../theme';

/** What's actually working right now. For users and for us when debugging. */
export function StatusScreen() {
  const theme = useTheme();
  const now = useNow(2000);
  const address = useProfile(s => s.address);
  const advertiseNodeHash = useProfile(s => s.advertiseNodeHash);
  const setAdvertiseNodeHash = useProfile(s => s.setAdvertiseNodeHash);
  const runtime = useRuntime();
  const [diag, setDiag] = useState<Awaited<ReturnType<typeof getMeshDiagnostics>>>(null);

  useEffect(() => {
    let active = true;
    const load = () =>
      getMeshDiagnostics()
        .then(d => active && setDiag(d))
        .catch(() => {});
    load();
    const id = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, [runtime.meshStatus]);

  const neighbors = Object.values(runtime.neighbors).sort((a, b) => b.seenAt - a.seenAt);

  const row = (label: string, value: string, tone?: string) => (
    <View style={styles.row} key={label}>
      <Text style={[styles.label, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.value, { color: tone ?? theme.text }]} selectable>
        {value}
      </Text>
    </View>
  );

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}>
      <SectionTitle>Mesh</SectionTitle>
      <Card>
        {row(
          'Status',
          runtime.meshStatus,
          runtime.meshStatus === 'running' ? theme.success : theme.warning,
        )}
        {runtime.meshError ? row('Error', runtime.meshError, theme.danger) : null}
        {row('Your address', address ?? 'not ready')}
        {row('Transports', diag?.transports.join(', ') || '—')}
        {row('Bluetooth peers', diag?.blePeers?.toString() ?? '—')}
        {runtime.transport ? row('Current route', runtime.transport) : null}
        {runtime.meshStatus !== 'running' && runtime.meshStatus !== 'starting' ? (
          <Button label="Start mesh" compact onPress={() => startMesh()} style={styles.button} />
        ) : null}
      </Card>

      <SectionTitle>{`Nearby devices (${neighbors.length})`}</SectionTitle>
      <Card>
        {neighbors.length === 0 ? (
          <Text style={{ color: theme.muted }}>
            No Flare phones in Bluetooth range right now. Range is roughly 10 to 30 m per hop.
          </Text>
        ) : (
          neighbors.map(n => {
            const prox = runtime.proximity[n.id];
            const live = isFresh(prox, now)
              ? ` · ${Math.round(prox.rssi)} dBm (${formatRange(rssiToRange(prox.rssi))})`
              : n.rssi !== undefined
                ? ` · ${n.rssi} dBm`
                : '';
            return row(shortAddress(n.id), `${n.transport}${live} · ${formatAgo(n.seenAt, now)}`);
          })
        )}
      </Card>

      {Platform.OS === 'android' ? (
        <>
          <SectionTitle>Privacy</SectionTitle>
          <Card>
            <View style={styles.switchRow}>
              <Text style={[styles.switchLabel, { color: theme.text }]}>
                Let iPhones measure distance to me
              </Text>
              <Switch
                value={advertiseNodeHash}
                onValueChange={on => {
                  setAdvertiseNodeHash(on);
                  restartMesh().catch(e =>
                    Alert.alert('Mesh restart failed', e instanceof Error ? e.message : String(e)),
                  );
                }}
              />
            </View>
            <Text style={[styles.hint, { color: theme.muted }]}>
              Android changes its Bluetooth address often, so iPhones lose track of which signal
              is you. This adds a fixed tag to your Bluetooth broadcast so they can. The cost:
              anyone scanning nearby can follow your phone by that tag. Turn it on at the event,
              off after.
            </Text>
          </Card>
        </>
      ) : null}

      <SectionTitle>Sensors</SectionTitle>
      <Card>
        {row('Location', runtime.locationStatus)}
        {runtime.position
          ? row(
              'Last fix',
              `±${Math.round(runtime.position.acc)} m · ${formatAgo(runtime.position.ts, now)}`,
            )
          : null}
        {row(
          'Compass',
          !runtime.headingAvailable
            ? 'not available'
            : runtime.heading
              ? `${Math.round(runtime.heading.deg)}° · ${runtime.heading.quality}`
              : 'starting',
        )}
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 20, gap: 4 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 12,
  },
  label: { fontSize: 14, fontWeight: '700' },
  value: { fontSize: 14, fontWeight: '700', flexShrink: 1, textAlign: 'right' },
  button: { marginTop: 12, alignSelf: 'flex-start' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  switchLabel: { flex: 1, fontSize: 15, fontWeight: '800' },
  hint: { marginTop: 8, fontSize: 13, lineHeight: 18 },
});

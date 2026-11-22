import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Camera, Map, Marker, type CameraRef } from '@maplibre/maplibre-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { formatAgo, shortAddress } from '../lib/time';
import { STALE_MS } from '../lib/useGroupRadar';
import { useNow } from '../lib/useNow';
import type { ScreenProps } from '../navigation/types';
import {
  deleteSavedArea,
  initMaps,
  listSavedAreas,
  MAP_STYLE,
  resumeSavedArea,
  saveAreaOffline,
  type SavedArea,
} from '../services/maps';
import { useGroups } from '../state/groups';
import { useRuntime } from '../state/runtime';
import { textOn, useTheme } from '../theme';

const SAVE_RADIUS_M = 2000;

export function MapScreen({ navigation, route }: ScreenProps<'Map'>) {
  const { groupId } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(5000);
  const group = useGroups(s => (groupId ? s.groups[groupId] : undefined));
  const position = useRuntime(s => s.position);
  const cameraRef = useRef<CameraRef>(null);

  const [areas, setAreas] = useState<SavedArea[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: group?.name ?? 'Map' });
  }, [navigation, group]);

  const refreshAreas = useCallback(() => {
    listSavedAreas()
      .then(setAreas)
      .catch(() => {});
  }, []);

  useEffect(() => {
    initMaps();
    refreshAreas();
  }, [refreshAreas]);

  const here = position
    ? areas.filter(
        ({ bounds: [w, s, e, n] }) =>
          position.lon >= w && position.lon <= e && position.lat >= s && position.lat <= n,
      )
    : [];
  const insideSaved = here.some(a => a.complete);
  const unfinished = !insideSaved ? here.find(a => !a.complete) : undefined;

  const resume = async (area: SavedArea) => {
    setProgress(area.percentage);
    try {
      await resumeSavedArea(area.id, pct => setProgress(pct));
      Alert.alert('Saved for offline', 'The map will open here without signal.');
    } catch (error) {
      Alert.alert("Couldn't finish", error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
      refreshAreas();
    }
  };

  const save = async () => {
    if (!position) {
      return;
    }
    setProgress(0);
    try {
      const result = await saveAreaOffline(
        group ? `${group.name} area` : 'Saved area',
        position.lat,
        position.lon,
        SAVE_RADIUS_M,
        pct => setProgress(pct),
      );
      Alert.alert(
        'Saved for offline',
        `${result.tiles} map tiles around you, zoom up to ${result.maxZoom}. The map will open here without signal.`,
      );
    } catch (error) {
      Alert.alert("Couldn't save the map", error instanceof Error ? error.message : String(error));
    } finally {
      setProgress(null);
      refreshAreas();
    }
  };

  const confirmDelete = (area: SavedArea) =>
    Alert.alert('Delete offline map?', area.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteSavedArea(area.id).then(refreshAreas).catch(() => {}),
      },
    ]);

  const members = Object.values(group?.members ?? {}).filter(m => m.loc);
  const meet = group?.meet;
  const start = position ?? members[0]?.loc ?? meet ?? undefined;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Map style={styles.flex} mapStyle={MAP_STYLE} logo={false} attribution compass>
        <Camera
          ref={cameraRef}
          initialViewState={start ? { center: [start.lon, start.lat], zoom: 16 } : { zoom: 2 }}
        />

        {meet ? (
          <Marker id="meet" lngLat={[meet.lon, meet.lat]} anchor="center">
            <Pressable
              onPress={() => groupId && navigation.navigate('Meet', { groupId })}
              style={styles.markerWrap}>
              <View
                style={[styles.diamond, { backgroundColor: theme.primary, borderColor: '#FFFFFF' }]}
              />
              <Text style={[styles.markerLabel, styles.meetLabel]}>{meet.label}</Text>
            </Pressable>
          </Marker>
        ) : null}

        {members.map(m =>
          m.loc ? (
            <Marker key={m.address} id={m.address} lngLat={[m.loc.lon, m.loc.lat]} anchor="center">
              <Pressable
                onPress={() => navigation.navigate('Find', { address: m.address, groupId })}
                style={[styles.markerWrap, now - m.loc.ts > STALE_MS && styles.stale]}>
                <View
                  style={[
                    styles.dot,
                    { backgroundColor: m.color ?? theme.faint },
                    m.sos?.active && { borderColor: theme.danger, borderWidth: 4 },
                  ]}>
                  <Text style={[styles.dotText, { color: textOn(m.color ?? '#888888') }]}>
                    {(m.name ?? '?').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.markerLabel}>
                  {m.name ?? shortAddress(m.address)} · {formatAgo(m.loc.ts, now)}
                </Text>
              </Pressable>
            </Marker>
          ) : null,
        )}

        {position ? (
          <Marker id="me" lngLat={[position.lon, position.lat]} anchor="center">
            <View style={[styles.me, { backgroundColor: theme.primary }]} />
          </Marker>
        ) : null}
      </Map>

      {position ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Center on me"
          onPress={() =>
            cameraRef.current?.easeTo({
              center: [position.lon, position.lat],
              zoom: 16,
              duration: 400,
            })
          }
          style={[styles.recenter, { backgroundColor: theme.surface, borderColor: theme.border }]}>
          <Text style={[styles.recenterText, { color: theme.primary }]}>◎</Text>
        </Pressable>
      ) : null}

      <View
        style={[
          styles.panel,
          {
            backgroundColor: theme.surface,
            borderColor: theme.border,
            paddingBottom: insets.bottom + 14,
          },
        ]}>
        <Text style={[styles.panelTitle, { color: theme.text }]}>
          {insideSaved
            ? 'This area works offline'
            : unfinished
              ? `Offline map ${Math.floor(unfinished.percentage)}% saved`
              : 'Save the map before you lose signal'}
        </Text>
        <Text style={[styles.panelBody, { color: theme.muted }]}>
          {insideSaved
            ? 'Streets and names around you are stored on this phone.'
            : `Downloads about ${SAVE_RADIUS_M / 1000} km around you. Do this on Wi-Fi before the event.`}
        </Text>
        {progress !== null ? (
          <View style={[styles.bar, { backgroundColor: theme.surfaceAlt }]}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round(progress)}%`, backgroundColor: theme.primary },
              ]}
            />
          </View>
        ) : unfinished ? (
          <Button
            label="Finish download"
            compact
            onPress={() => resume(unfinished)}
            style={styles.saveButton}
          />
        ) : (
          <Button
            label={insideSaved ? 'Save again' : 'Save this area offline'}
            variant={insideSaved ? 'secondary' : 'primary'}
            compact
            disabled={!position}
            onPress={save}
            style={styles.saveButton}
          />
        )}
        {areas.map(area => (
          <Pressable
            key={area.id}
            onLongPress={() => confirmDelete(area)}
            style={[styles.area, { borderColor: theme.border }]}>
            <Text style={[styles.areaText, { color: theme.text }]}>{area.name}</Text>
            <Text style={[styles.areaMeta, { color: theme.faint }]}>
              {area.complete ? 'Complete' : `${Math.floor(area.percentage)}% saved`}
              {area.createdAt ? ` · ${formatAgo(area.createdAt, now)}` : ''} · hold to delete
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  markerWrap: { alignItems: 'center' },
  stale: { opacity: 0.45 },
  dot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotText: { fontSize: 13, fontWeight: '900' },
  markerLabel: {
    marginTop: 2,
    fontSize: 11,
    fontWeight: '800',
    color: '#101318',
    backgroundColor: 'rgba(255,255,255,0.85)',
    paddingHorizontal: 5,
    borderRadius: 6,
    overflow: 'hidden',
  },
  meetLabel: { color: '#B3400B' },
  diamond: { width: 22, height: 22, borderWidth: 3, transform: [{ rotate: '45deg' }] },
  me: { width: 18, height: 18, borderRadius: 9, borderWidth: 3, borderColor: '#FFFFFF' },
  recenter: {
    position: 'absolute',
    right: 16,
    top: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recenterText: { fontSize: 22, fontWeight: '900' },
  panel: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  panelTitle: { fontSize: 16, fontWeight: '800' },
  panelBody: { marginTop: 4, fontSize: 13, lineHeight: 18 },
  bar: { marginTop: 14, height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: '100%' },
  saveButton: { marginTop: 12, alignSelf: 'flex-start' },
  area: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  areaText: { fontSize: 14, fontWeight: '700' },
  areaMeta: { fontSize: 12, marginTop: 2 },
});

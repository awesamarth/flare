import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type LayoutRectangle,
} from 'react-native';
import {
  Camera,
  ImageSource,
  Layer,
  Map,
  Marker,
  type CameraRef,
  type MapRef,
} from '@maplibre/maplibre-react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../components/ui';
import { formatAgo, shortAddress } from '../lib/time';
import { STALE_MS } from '../lib/useGroupRadar';
import { useNow } from '../lib/useNow';
import type { ScreenProps } from '../navigation/types';
import {
  clearEventMap,
  loadEventMap,
  normalizeFileUri,
  setEventMap,
} from '../services/eventmap';
import {
  deleteSavedArea,
  initMaps,
  listSavedAreas,
  MAP_STYLE,
  resumeSavedArea,
  saveAreaOffline,
  type SavedArea,
} from '../services/maps';
import { useGroups, type LngLatQuad } from '../state/groups';
import { useProfile } from '../state/profile';
import { useRuntime } from '../state/runtime';
import { textOn, useTheme } from '../theme';

const SAVE_RADIUS_M = 2000;
const OVERLAY_OPACITY = 0.85;

type Calibration = {
  base64: string;
  mime: string;
  uri: string;
  aspect: number;
};

export function MapScreen({ navigation, route }: ScreenProps<'Map'>) {
  const { groupId } = route.params;
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const now = useNow(5000);
  const group = useGroups(s => (groupId ? s.groups[groupId] : undefined));
  const position = useRuntime(s => s.position);
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const [mapBox, setMapBox] = useState<LayoutRectangle | null>(null);
  const [calibrating, setCalibrating] = useState<Calibration | null>(null);
  const [showEventMap, setShowEventMap] = useState(true);
  const [busy, setBusy] = useState(false);
  const eventMap = group?.eventMap ?? null;
  const isAdmin = !!group?.isAdmin;
  const myAddress = useProfile(s => s.address);

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

  // Missing image bytes? Ask again whenever the map is opened.
  useEffect(() => {
    if (groupId && eventMap && !eventMap.uri) {
      loadEventMap(groupId).catch(() => {});
    }
  }, [groupId, eventMap]);

  /** Where the image sits on screen while calibrating (inside the map view). */
  const overlayRect = (() => {
    if (!calibrating || !mapBox) {
      return null;
    }
    const pad = 24;
    let width = mapBox.width - pad * 2;
    let height = width / calibrating.aspect;
    if (height > mapBox.height - pad * 2) {
      height = mapBox.height - pad * 2;
      width = height * calibrating.aspect;
    }
    return {
      left: (mapBox.width - width) / 2,
      top: (mapBox.height - height) / 2,
      width,
      height,
    };
  })();

  const pickEventMap = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      maxWidth: 1800,
      maxHeight: 1800,
      quality: 0.7,
      includeBase64: true,
    });
    const asset = result.assets?.[0];
    if (result.didCancel || !asset?.base64 || !asset.uri) {
      if (result.errorMessage) {
        Alert.alert("Couldn't get the image", result.errorMessage);
      }
      return;
    }
    setShowEventMap(true);
    setCalibrating({
      base64: asset.base64,
      mime: asset.type === 'image/png' ? 'image/png' : 'image/jpeg',
      uri: asset.uri,
      aspect: asset.width && asset.height ? asset.width / asset.height : 1,
    });
  };

  const lockCalibration = async () => {
    if (!calibrating || !overlayRect || !mapRef.current || !groupId) {
      return;
    }
    setBusy(true);
    try {
      const { left, top, width, height } = overlayRect;
      const map = mapRef.current;
      const corners = (await Promise.all([
        map.unproject([left, top]),
        map.unproject([left + width, top]),
        map.unproject([left + width, top + height]),
        map.unproject([left, top + height]),
      ])) as LngLatQuad;
      await setEventMap(groupId, calibrating.base64, calibrating.mime, corners);
      setCalibrating(null);
    } catch (error) {
      Alert.alert(
        "Couldn't pin the event map",
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      setBusy(false);
    }
  };

  const confirmRemoveEventMap = () =>
    groupId &&
    Alert.alert(
      'Remove the event map?',
      'It will be removed for everyone in the group.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () =>
            clearEventMap(groupId).catch(e =>
              Alert.alert(
                "Couldn't remove",
                e instanceof Error ? e.message : String(e),
              ),
            ),
        },
      ],
    );

  const here = position
    ? areas.filter(
        ({ bounds: [w, s, e, n] }) =>
          position.lon >= w &&
          position.lon <= e &&
          position.lat >= s &&
          position.lat <= n,
      )
    : [];
  const insideSaved = here.some(a => a.complete);
  const unfinished = !insideSaved ? here.find(a => !a.complete) : undefined;

  const resume = async (area: SavedArea) => {
    setProgress(area.percentage);
    try {
      await resumeSavedArea(area.id, pct => setProgress(pct));
      Alert.alert(
        'Saved for offline',
        'The map will open here without signal.',
      );
    } catch (error) {
      Alert.alert(
        "Couldn't finish",
        error instanceof Error ? error.message : String(error),
      );
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
      Alert.alert(
        "Couldn't save the map",
        error instanceof Error ? error.message : String(error),
      );
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
        onPress: () =>
          deleteSavedArea(area.id)
            .then(refreshAreas)
            .catch(() => {}),
      },
    ]);

  const members = Object.values(group?.members ?? {}).filter(m => m.loc);
  const meet = group?.meet;
  const start = position ?? members[0]?.loc ?? meet ?? undefined;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <View style={styles.flex} onLayout={e => setMapBox(e.nativeEvent.layout)}>
        <Map
          ref={mapRef}
          style={styles.flex}
          mapStyle={MAP_STYLE}
          logo={false}
          attribution
          compass
          touchPitch={false}
        >
          {eventMap?.uri && showEventMap && !calibrating ? (
            <ImageSource
              id="eventmap"
              url={normalizeFileUri(eventMap.uri)}
              coordinates={eventMap.corners}
            >
              <Layer
                id="eventmap-layer"
                type="raster"
                paint={{ 'raster-opacity': OVERLAY_OPACITY }}
              />
            </ImageSource>
          ) : null}

          <Camera
            ref={cameraRef}
            initialViewState={
              start ? { center: [start.lon, start.lat], zoom: 16 } : { zoom: 2 }
            }
          />

          {meet ? (
            <Marker id="meet" lngLat={[meet.lon, meet.lat]} anchor="center">
              <Pressable
                onPress={() =>
                  groupId && navigation.navigate('Meet', { groupId })
                }
                style={styles.markerWrap}
              >
                <View
                  style={[styles.diamond, { backgroundColor: theme.primary }]}
                />
                <Text style={[styles.markerLabel, styles.meetLabel]}>
                  {meet.label}
                </Text>
              </Pressable>
            </Marker>
          ) : null}

          {members.map(m =>
            m.loc ? (
              <Marker
                key={m.address}
                id={m.address}
                lngLat={[m.loc.lon, m.loc.lat]}
                anchor="center"
              >
                <Pressable
                  onPress={() =>
                    navigation.navigate('Find', { address: m.address, groupId })
                  }
                  style={[
                    styles.markerWrap,
                    now - m.loc.ts > STALE_MS && styles.stale,
                  ]}
                >
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: m.color ?? theme.faint },
                      m.sos?.active && [
                        styles.dotSos,
                        { borderColor: theme.danger },
                      ],
                    ]}
                  >
                    <Text
                      style={[
                        styles.dotText,
                        { color: textOn(m.color ?? '#888888') },
                      ]}
                    >
                      {(m.name ?? '?').slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={styles.markerLabel}>
                    {m.name ?? shortAddress(m.address)} ·{' '}
                    {formatAgo(m.loc.ts, now)}
                  </Text>
                </Pressable>
              </Marker>
            ) : null,
          )}

          {position ? (
            <Marker
              id="me"
              lngLat={[position.lon, position.lat]}
              anchor="center"
            >
              <View style={[styles.me, { backgroundColor: theme.primary }]} />
            </Marker>
          ) : null}
        </Map>

        {calibrating && overlayRect ? (
          <View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Image
              source={{ uri: calibrating.uri }}
              style={[styles.calibrationImage, overlayRect]}
              resizeMode="stretch"
            />
          </View>
        ) : null}
      </View>

      {position && !calibrating ? (
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
          style={[
            styles.recenter,
            { backgroundColor: theme.surface, borderColor: theme.border },
          ]}
        >
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
        ]}
      >
        {calibrating ? (
          <>
            <Text style={[styles.panelTitle, { color: theme.text }]}>
              Line it up
            </Text>
            <Text style={[styles.panelBody, { color: theme.muted }]}>
              Drag, pinch and rotate the street map under the image until roads
              and landmarks match, then lock it. Everyone in the group gets it.
            </Text>
            <View style={styles.row}>
              <Button
                label="Lock it here"
                compact
                loading={busy}
                onPress={lockCalibration}
                style={styles.flex}
              />
              <Button
                label="Cancel"
                variant="secondary"
                compact
                disabled={busy}
                onPress={() => setCalibrating(null)}
                style={[styles.flex, styles.gap]}
              />
            </View>
          </>
        ) : (
          <>
            {groupId ? (
              <View style={[styles.eventRow, { borderColor: theme.border }]}>
                <Text
                  style={[styles.areaText, styles.flex, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {eventMap
                    ? eventMap.uri
                      ? `Event map by ${
                          eventMap.byName ?? shortAddress(eventMap.by)
                        }`
                      : 'Event map: fetching image from the group…'
                    : 'No event map yet'}
                </Text>
                {eventMap?.uri ? (
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setShowEventMap(v => !v)}
                    hitSlop={8}
                  >
                    <Text style={[styles.link, { color: theme.primary }]}>
                      {showEventMap ? 'Hide' : 'Show'}
                    </Text>
                  </Pressable>
                ) : null}
                {eventMap ? (
                  isAdmin || eventMap.by === myAddress ? (
                    <Pressable
                      accessibilityRole="button"
                      onPress={confirmRemoveEventMap}
                      hitSlop={8}
                    >
                      <Text style={[styles.link, { color: theme.danger }]}>
                        Remove
                      </Text>
                    </Pressable>
                  ) : null
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    onPress={pickEventMap}
                    hitSlop={8}
                  >
                    <Text style={[styles.link, { color: theme.primary }]}>
                      Add
                    </Text>
                  </Pressable>
                )}
              </View>
            ) : null}
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
                : `Downloads about ${
                    SAVE_RADIUS_M / 1000
                  } km around you. Do this on Wi-Fi before the event.`}
            </Text>
            {progress !== null ? (
              <View style={[styles.bar, { backgroundColor: theme.surfaceAlt }]}>
                <View
                  style={[
                    styles.barFill,
                    {
                      width: `${Math.round(progress)}%`,
                      backgroundColor: theme.primary,
                    },
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
                style={[styles.area, { borderColor: theme.border }]}
              >
                <Text style={[styles.areaText, { color: theme.text }]}>
                  {area.name}
                </Text>
                <Text style={[styles.areaMeta, { color: theme.faint }]}>
                  {area.complete
                    ? 'Complete'
                    : `${Math.floor(area.percentage)}% saved`}
                  {area.createdAt ? ` · ${formatAgo(area.createdAt, now)}` : ''}{' '}
                  · hold to delete
                </Text>
              </Pressable>
            ))}
          </>
        )}
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
  dotSos: { borderWidth: 4 },
  diamond: {
    width: 22,
    height: 22,
    borderWidth: 3,
    borderColor: '#FFFFFF',
    transform: [{ rotate: '45deg' }],
  },
  me: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
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
  area: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  areaText: { fontSize: 14, fontWeight: '700' },
  areaMeta: { fontSize: 12, marginTop: 2 },
  calibrationImage: {
    position: 'absolute',
    opacity: 0.6,
    borderWidth: 2,
    borderColor: '#FF6A1A',
  },
  row: { flexDirection: 'row', marginTop: 12 },
  gap: { marginLeft: 10 },
  eventRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  link: { fontSize: 14, fontWeight: '800' },
});

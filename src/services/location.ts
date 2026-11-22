import { AppState, Platform, type NativeEventSubscription } from 'react-native';
import {
  requestPermission,
  setConfiguration,
  unwatch,
  watchHeading,
  watchPosition,
  type GeolocationResponse,
  type Heading,
  type LocationError,
} from 'react-native-nitro-geolocation';
import {
  checkBackgroundPermission,
  onBackgroundLocation,
  openAppLocationSettings,
  requestBackgroundPermission,
  startBackgroundLocation,
  stopBackgroundLocation,
  type BackgroundSubscription,
} from 'react-native-nitro-geolocation/background';
import { distanceMeters, normalizeDeg } from '../lib/geo';
import type { LocationFix } from '../protocol/envelope';
import { useRuntime, type HeadingQuality } from '../state/runtime';
import { broadcastLocation } from './mesh';

/** Always share at least this often, so friends see we're still around. */
const HEARTBEAT_MS = 30_000;
/** Never share more often than this. */
const MIN_INTERVAL_MS = 5_000;
const TICK_MS = 5_000;

let positionToken: string | null = null;
let headingToken: string | null = null;
let tick: ReturnType<typeof setInterval> | null = null;
let lastSent: { fix: LocationFix; at: number } | null = null;
let smoothedHeading: number | null = null;
let appStateSub: NativeEventSubscription | null = null;
let backgroundSub: BackgroundSubscription | null = null;
let backgroundRunning = false;

const runtime = () => useRuntime.getState();

export async function startLocation() {
  if (positionToken) {
    return;
  }
  setConfiguration({
    authorizationLevel: 'whenInUse',
    enableBackgroundLocationUpdates: false,
    locationProvider: 'auto',
  });

  const status = await requestPermission().catch(() => 'denied' as const);
  if (status !== 'granted') {
    runtime().set({ locationStatus: 'denied' });
    return;
  }
  runtime().set({ locationStatus: 'waiting' });

  positionToken = watchPosition(onPosition, onPositionError, {
    accuracy: { android: 'high', ios: 'best' },
    interval: 3_000,
    fastestInterval: 1_000,
    distanceFilter: 0,
  });

  headingToken = watchHeading(onHeading, () => {
    runtime().set({ headingAvailable: false, heading: undefined });
  }, { headingFilter: 1 });

  tick = setInterval(maybeShare, TICK_MS);

  // Phone in a pocket: keep sharing via a location foreground service.
  appStateSub ??= AppState.addEventListener('change', state => {
    if (state === 'background') {
      startPocketMode().catch(error => console.warn('[flare] pocket mode failed', error));
    } else if (state === 'active') {
      stopPocketMode().catch(() => {});
    }
  });
  refreshBackgroundPermission().catch(() => {});
}

export async function refreshBackgroundPermission() {
  const result = await checkBackgroundPermission();
  useRuntime.getState().set({ backgroundLocation: result.background === 'granted' });
  return result;
}

/**
 * Ask for "Allow all the time". Android 11+ never shows it inline, so this
 * usually ends in Settings; call refreshBackgroundPermission on return.
 */
export async function requestPocketMode(): Promise<void> {
  const result = await requestBackgroundPermission();
  if (result.background === 'granted') {
    useRuntime.getState().set({ backgroundLocation: true });
    return;
  }
  if (result.needsSettingsRedirect || result.canRequestBackgroundInline === false) {
    await openAppLocationSettings();
  }
}

async function startPocketMode() {
  if (backgroundRunning || !useRuntime.getState().backgroundLocation) {
    return;
  }
  backgroundRunning = true;
  backgroundSub ??= onBackgroundLocation(location => onPosition(location));
  await startBackgroundLocation({
    trackingMode: 'continuous',
    accuracy: { android: 'high', ios: 'best' },
    // Less often than on screen, to save battery.
    interval: 20_000,
    fastestInterval: 10_000,
    distanceFilter: 10,
    persist: false,
    stopOnTerminate: true,
    startOnBoot: false,
    android: {
      requestNotificationPermission: false,
      foregroundService: {
        notificationTitle: 'Sharing your location',
        notificationText: 'Your group can still find you while Flare is in the background.',
        notificationChannelName: 'Location sharing',
        notificationIcon: 'ic_notification',
        stopActionTitle: 'Stop',
      },
    },
    ios: {
      activityType: 'other',
      pausesLocationUpdatesAutomatically: false,
      showsBackgroundLocationIndicator: true,
    },
  }).catch(error => {
    backgroundRunning = false;
    throw error;
  });
}

async function stopPocketMode() {
  if (!backgroundRunning) {
    return;
  }
  backgroundRunning = false;
  await stopBackgroundLocation();
}

export function stopLocation() {
  if (positionToken) {
    unwatch(positionToken);
    positionToken = null;
  }
  if (headingToken) {
    unwatch(headingToken);
    headingToken = null;
  }
  if (tick) {
    clearInterval(tick);
    tick = null;
  }
  appStateSub?.remove();
  appStateSub = null;
  backgroundSub?.remove();
  backgroundSub = null;
  stopPocketMode().catch(() => {});
}

function onPosition(position: GeolocationResponse) {
  const now = Date.now();
  const ts =
    Number.isFinite(position.timestamp) && Math.abs(now - position.timestamp) < 86_400_000
      ? Math.min(position.timestamp, now)
      : now;
  const fix: LocationFix = {
    lat: position.coords.latitude,
    lon: position.coords.longitude,
    acc: Math.max(1, position.coords.accuracy ?? 999),
    ts,
  };
  runtime().set({ position: fix, locationStatus: 'ok' });
  maybeShare();
}

function onPositionError(error: LocationError) {
  // Keep the last fix; the UI shows its age.
  const message = error.message.toLowerCase();
  runtime().set({
    locationStatus: message.includes('disabled') || message.includes('off') ? 'off' : 'error',
  });
}

/** Map platform heading accuracy to a coarse quality. */
function headingQuality(heading: Heading): HeadingQuality {
  const accuracy = heading.accuracy;
  if (accuracy === undefined || accuracy === null || accuracy < 0) {
    return 'poor';
  }
  if (Platform.OS === 'android') {
    // SensorManager status: 3 high, 2 medium, 1 low.
    return accuracy >= 3 ? 'good' : accuracy >= 2 ? 'fair' : 'poor';
  }
  // iOS: maximum deviation in degrees.
  return accuracy <= 15 ? 'good' : accuracy <= 35 ? 'fair' : 'poor';
}

function onHeading(heading: Heading) {
  const raw = normalizeDeg(heading.trueHeading ?? heading.magneticHeading);
  if (smoothedHeading === null) {
    smoothedHeading = raw;
  } else {
    // Low-pass on the circle: move a fraction along the shortest arc.
    const delta = ((raw - smoothedHeading + 540) % 360) - 180;
    smoothedHeading = normalizeDeg(smoothedHeading + delta * 0.35);
  }
  runtime().set({
    headingAvailable: true,
    heading: {
      deg: smoothedHeading,
      quality: headingQuality(heading),
      ts: Date.now(),
    },
  });
}

function maybeShare() {
  const fix = runtime().position;
  if (!fix) {
    return;
  }
  const now = Date.now();
  if (lastSent && now - lastSent.at < MIN_INTERVAL_MS) {
    return;
  }
  const moved = lastSent ? distanceMeters(lastSent.fix, fix) : Infinity;
  const threshold = Math.max(8, fix.acc * 0.5);
  const due = !lastSent || now - lastSent.at >= HEARTBEAT_MS;
  if (!due && moved < threshold) {
    return;
  }
  // Mark first so overlapping ticks don't double-send.
  const previous = lastSent;
  lastSent = { fix, at: now };
  broadcastLocation(fix)
    .then(sent => {
      if (!sent) {
        lastSent = previous;
      }
    })
    .catch(() => {
      lastSent = previous;
    });
}

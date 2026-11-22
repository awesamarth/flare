import { AppState, type NativeEventSubscription } from 'react-native';
import { FlareNative as native } from './native';

const POLL_MS = 60_000;

let timer: ReturnType<typeof setInterval> | null = null;
let appStateSub: NativeEventSubscription | null = null;

/**
 * Report battery to the mesh every minute and on returning to the app. The
 * SDK uses it to pick relays and transports: a low phone stops carrying
 * other people's traffic. Without it those policies run blind.
 */
export function startBatteryReporting(report: (level: number, charging: boolean) => void) {
  const battery = native;
  if (!battery || timer) {
    return;
  }
  const tick = () => {
    battery
      .getBattery()
      .then(({ level, charging }) => {
        // -1 means unknown (e.g. the iOS simulator).
        if (level >= 0) {
          report(level, charging);
        }
      })
      .catch(() => {});
  };
  tick();
  timer = setInterval(tick, POLL_MS);
  appStateSub = AppState.addEventListener('change', state => {
    if (state === 'active') {
      tick();
    }
  });
}

export function stopBatteryReporting() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  appStateSub?.remove();
  appStateSub = null;
}

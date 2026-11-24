import { AppState, Platform } from 'react-native';
import notifee, {
  AndroidCategory,
  AndroidImportance,
  AndroidVisibility,
  EventType,
  type Event,
} from 'react-native-notify-kit';

/**
 * System notifications for when Flare isn't on screen (phone in a pocket).
 * In the foreground the in-app banner (AlertHost) is enough.
 */

const CHANNEL_SOS = 'sos';
const CHANNEL_ALERTS = 'alerts';

export type NotifyTarget = { groupId?: string; address?: string };

let ready: Promise<void> | null = null;
let openHandler: ((target: NotifyTarget) => void) | null = null;

export function setupNotifications(onOpen: (target: NotifyTarget) => void) {
  openHandler = onOpen;
  ready ??= (async () => {
    if (Platform.OS === 'ios') {
      await notifee.requestPermission({
        alert: true,
        sound: true,
        badge: false,
      });
    }
    await notifee.createChannel({
      id: CHANNEL_SOS,
      name: 'SOS from friends',
      importance: AndroidImportance.HIGH,
      vibration: true,
      vibrationPattern: [300, 500, 200, 500, 200, 500],
      sound: 'default',
    });
    await notifee.createChannel({
      id: CHANNEL_ALERTS,
      name: 'Pings and messages',
      importance: AndroidImportance.HIGH,
      vibration: true,
      sound: 'default',
    });
  })().catch(error => {
    console.warn('[flare] notifications unavailable', error);
  });

  notifee.onForegroundEvent(handleEvent);
  notifee
    .getInitialNotification()
    .then(initial => {
      if (initial) {
        openTarget(initial.notification.data);
      }
    })
    .catch(() => {});
}

function openTarget(data: Record<string, unknown> | undefined) {
  if (!data || !openHandler) {
    return;
  }
  openHandler({
    groupId: typeof data.groupId === 'string' ? data.groupId : undefined,
    address: typeof data.address === 'string' ? data.address : undefined,
  });
}

function handleEvent({ type, detail }: Event) {
  if (type === EventType.PRESS) {
    openTarget(detail.notification?.data);
  }
}

/** Registered at startup (index.js) so taps work when JS was asleep. */
export async function handleBackgroundEvent(event: Event) {
  handleEvent(event);
}

/** Show a system notification, only when the app isn't in the foreground. */
export async function notifySystem(
  title: string,
  body: string,
  tone: 'info' | 'danger',
  target?: NotifyTarget,
) {
  if (AppState.currentState === 'active') {
    return;
  }
  await ready;
  const data: Record<string, string> = {};
  if (target?.groupId) {
    data.groupId = target.groupId;
  }
  if (target?.address) {
    data.address = target.address;
  }
  try {
    await notifee.displayNotification({
      title,
      body: body || undefined,
      data,
      android: {
        channelId: tone === 'danger' ? CHANNEL_SOS : CHANNEL_ALERTS,
        category:
          tone === 'danger' ? AndroidCategory.ALARM : AndroidCategory.MESSAGE,
        importance: AndroidImportance.HIGH,
        visibility: AndroidVisibility.PUBLIC,
        pressAction: { id: 'default' },
        smallIcon: 'ic_notification',
      },
      ios: {
        interruptionLevel: tone === 'danger' ? 'timeSensitive' : 'active',
        sound: 'default',
      },
    });
  } catch (error) {
    console.warn('[flare] notification failed', error);
  }
}

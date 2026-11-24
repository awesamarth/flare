import { Alert, Linking } from 'react-native';
import { StackActions } from '@react-navigation/native';
import { navigationRef } from '../navigation/types';
import { useGroups } from '../state/groups';
import { handleScan } from './mesh';

/**
 * Act on a Flare code, whether scanned in-app or opened as a `flare://` link
 * (camera app, a message): request to join a group, open a person, or show a
 * group we're already in. Throws with a user-facing message.
 */
export async function openCode(value: string): Promise<void> {
  const outcome = await handleScan(value);
  if (outcome.kind === 'join_requested') {
    Alert.alert(
      'Request sent',
      `The admin of ${outcome.groupName} needs to approve you. Stay near them with Flare open.`,
    );
  } else if (outcome.kind === 'already_member') {
    useGroups.getState().setActiveGroup(outcome.groupId);
    if (navigationRef.isReady()) {
      navigationRef.dispatch(StackActions.popTo('Home'));
    }
  } else if (outcome.kind === 'person' && navigationRef.isReady()) {
    navigationRef.navigate('Person', {
      address: outcome.address,
      name: outcome.name,
    });
  }
}

function openLink(url: string | null) {
  if (!url?.startsWith('flare://')) {
    return;
  }
  openCode(url).catch(error =>
    Alert.alert(
      "Couldn't open that code",
      error instanceof Error ? error.message : String(error),
    ),
  );
}

/** Handle the link that launched the app and any that arrive later. Call once the mesh runs. */
export function listenForLinks(): () => void {
  Linking.getInitialURL()
    .then(openLink)
    .catch(() => {});
  const sub = Linking.addEventListener('url', event => openLink(event.url));
  return () => sub.remove();
}

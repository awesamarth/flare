import { PermissionsAndroid, Platform, type Permission } from 'react-native';

export type PermissionResult = {
  bluetooth: boolean;
  location: boolean;
};

/**
 * Android runtime grants for the mesh (Bluetooth) and GPS, in one prompt
 * sequence. iOS prompts on first use instead (Bluetooth when the mesh starts,
 * location when the location service starts), so it returns granted here.
 */
export async function requestAndroidPermissions(): Promise<PermissionResult> {
  if (Platform.OS !== 'android') {
    return { bluetooth: true, location: true };
  }
  const api = Number(Platform.Version);
  const P = PermissionsAndroid.PERMISSIONS;
  const wanted: Permission[] = [P.ACCESS_FINE_LOCATION, P.ACCESS_COARSE_LOCATION];
  if (api >= 31) {
    wanted.push(P.BLUETOOTH_SCAN, P.BLUETOOTH_ADVERTISE, P.BLUETOOTH_CONNECT);
  }
  if (api >= 33) {
    // Notifications: the mesh's background service. Nearby Wi-Fi: Wi-Fi Direct.
    wanted.push(P.POST_NOTIFICATIONS, P.NEARBY_WIFI_DEVICES);
  }

  const result = await PermissionsAndroid.requestMultiple(wanted);
  const granted = (p: Permission) =>
    result[p] === PermissionsAndroid.RESULTS.GRANTED;

  const location = granted(P.ACCESS_FINE_LOCATION) || granted(P.ACCESS_COARSE_LOCATION);
  const bluetooth =
    api >= 31
      ? granted(P.BLUETOOTH_SCAN) &&
        granted(P.BLUETOOTH_ADVERTISE) &&
        granted(P.BLUETOOTH_CONNECT)
      : // Android 11 and below need fine location to scan for BLE peers.
        granted(P.ACCESS_FINE_LOCATION);

  return { bluetooth, location };
}

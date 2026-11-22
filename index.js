/**
 * @format
 */

import { AppRegistry, LogBox } from 'react-native';
import notifee from 'react-native-notify-kit';
import App from './src/App';
import { handleBackgroundEvent } from './src/services/notify';
import { name as appName } from './app.json';

// Expected SDK hint (Wi-Fi Direct is slow, not stuck); its dev toast covers
// the bottom buttons. Still printed to the console.
LogBox.ignoreLogs(['Wi-Fi Direct group formation is in progress']);

// Notification taps while JS was not running.
notifee.onBackgroundEvent(handleBackgroundEvent);

AppRegistry.registerComponent(appName, () => App);

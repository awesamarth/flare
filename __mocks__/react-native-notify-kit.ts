/** Minimal notifications mock for tests. */
const notifee = {
  requestPermission: jest.fn(async () => ({})),
  createChannel: jest.fn(async () => 'id'),
  displayNotification: jest.fn(async () => 'id'),
  onForegroundEvent: jest.fn(() => () => {}),
  onBackgroundEvent: jest.fn(),
  getInitialNotification: jest.fn(async () => null),
};

export default notifee;
export const AndroidImportance = { HIGH: 4, DEFAULT: 3 };
export const AndroidCategory = { ALARM: 'alarm', MESSAGE: 'msg' };
export const AndroidVisibility = { PUBLIC: 1 };
export const EventType = { PRESS: 1 };

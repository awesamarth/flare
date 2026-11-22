import { NativeModules } from 'react-native';

/** Flare's own small native module (android/.../FlareNativeModule.kt, ios/Flare/FlareNative.m). */
type FlareNative = {
  /** level 0-100, or -1 when unknown (iOS simulator). */
  getBattery: () => Promise<{ level: number; charging: boolean }>;
  /** Saves base64 bytes under the app's private dir; resolves a file:// URL. */
  writeFile: (name: string, base64: string) => Promise<string>;
  deleteFile: (name: string) => Promise<boolean>;
};

export const FlareNative = NativeModules.FlareNative as FlareNative | undefined;

import { Platform } from 'react-native';

/**
 * KeyboardAvoidingView behavior. Android 15+ draws apps edge to edge (forced
 * for targetSdk 35+), so `adjustResize` no longer shrinks the window and the
 * view has to pad itself. Older Android still resizes on its own.
 */
export const keyboardBehavior: 'padding' | undefined =
  Platform.OS === 'ios' ||
  (Platform.OS === 'android' && Number(Platform.Version) >= 35)
    ? 'padding'
    : undefined;

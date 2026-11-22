import { createNavigationContainerRef } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { ConversationId } from '../state/messages';

export type RootStackParamList = {
  Onboarding: { edit?: boolean } | undefined;
  Home: undefined;
  Groups: undefined;
  NewGroup: undefined;
  Group: { groupId: string };
  Chat: { conv: ConversationId };
  ShareCode: { groupId?: string };
  Person: { address: string; name?: string };
  Status: undefined;
  Find: { address: string; groupId?: string };
  Meet: { groupId: string };
  Map: { groupId?: string };
};

export type ScreenProps<T extends keyof RootStackParamList> = NativeStackScreenProps<
  RootStackParamList,
  T
>;

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

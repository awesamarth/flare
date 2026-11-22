import React, { useEffect } from 'react';
import { AppState, StatusBar } from 'react-native';
import { StackActions } from '@react-navigation/native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  type Theme as NavTheme,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AlertHost } from './components/AlertHost';
import { navigationRef, type RootStackParamList } from './navigation/types';
import { ChatScreen } from './screens/ChatScreen';
import { FindScreen } from './screens/FindScreen';
import { GroupScreen } from './screens/GroupScreen';
import { GroupsScreen } from './screens/GroupsScreen';
import { HomeScreen } from './screens/HomeScreen';
import { MapScreen } from './screens/MapScreen';
import { MeetScreen } from './screens/MeetScreen';
import { NewGroupScreen } from './screens/NewGroupScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { PersonScreen } from './screens/PersonScreen';
import { ShareCodeScreen } from './screens/ShareCodeScreen';
import { StatusScreen } from './screens/StatusScreen';
import { refreshBackgroundPermission, startLocation } from './services/location';
import { startMesh } from './services/mesh';
import { setupNotifications } from './services/notify';
import { useGroups } from './state/groups';
import { directConv } from './state/messages';
import { useProfile } from './state/profile';
import { useRuntime } from './state/runtime';
import { useTheme } from './theme';

const Stack = createNativeStackNavigator<RootStackParamList>();

/** Start the mesh, then location (so Android permission prompts don't overlap). */
function useServices(enabled: boolean) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    const boot = async () => {
      await startMesh();
      await startLocation().catch(error =>
        console.warn('[flare] location failed to start', error),
      );
    };
    boot();

    setupNotifications(target => {
      if (!navigationRef.isReady()) {
        return;
      }
      if (target.groupId) {
        useGroups.getState().setActiveGroup(target.groupId);
        navigationRef.dispatch(StackActions.popTo('Home'));
      } else if (target.address) {
        navigationRef.navigate('Chat', { conv: directConv(target.address) });
      }
    });

    // Coming back from Settings (Bluetooth turned on, permission granted): retry.
    const sub = AppState.addEventListener('change', state => {
      if (state !== 'active') {
        return;
      }
      refreshBackgroundPermission().catch(() => {});
      const status = useRuntime.getState().meshStatus;
      if (status === 'bluetooth_off' || status === 'permission_denied' || status === 'error') {
        boot();
      }
    });
    return () => sub.remove();
  }, [enabled]);
}

export default function App() {
  const theme = useTheme();
  const hasProfile = useProfile(s => !!s.name);
  useServices(hasProfile);

  const navTheme: NavTheme = {
    ...(theme.dark ? DarkTheme : DefaultTheme),
    colors: {
      ...(theme.dark ? DarkTheme : DefaultTheme).colors,
      primary: theme.primary,
      background: theme.background,
      card: theme.background,
      text: theme.text,
      border: theme.border,
    },
  };

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <NavigationContainer ref={navigationRef} theme={navTheme}>
        <Stack.Navigator
          initialRouteName={hasProfile ? 'Home' : 'Onboarding'}
          screenOptions={{
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            headerTitleStyle: { fontWeight: '800' },
          }}>
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={({ route }) => ({
              headerShown: route.params?.edit === true,
              title: 'Profile',
            })}
          />
          <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Groups" component={GroupsScreen} options={{ title: 'Groups' }} />
          <Stack.Screen
            name="NewGroup"
            component={NewGroupScreen}
            options={{ title: 'New group', presentation: 'modal' }}
          />
          <Stack.Screen name="Group" component={GroupScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="ShareCode" component={ShareCodeScreen} />
          <Stack.Screen name="Person" component={PersonScreen} />
          <Stack.Screen name="Find" component={FindScreen} />
          <Stack.Screen name="Meet" component={MeetScreen} />
          <Stack.Screen name="Map" component={MapScreen} />
          <Stack.Screen name="Status" component={StatusScreen} options={{ title: 'Status' }} />
        </Stack.Navigator>
      </NavigationContainer>
      <AlertHost />
    </SafeAreaProvider>
  );
}

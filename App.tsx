import React, { useMemo, useState } from 'react';
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  useColorScheme,
  View,
} from 'react-native';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

type Friend = {
  id: string;
  name: string;
  color: string;
  bearing: number;
  distance: number;
  lastSeen: string;
  accuracy: 'high' | 'medium' | 'low';
  area: string;
};

type Theme = {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceStrong: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  primary: string;
  primarySoft: string;
  shadow: string;
  ring: string;
};

const friends: Friend[] = [
  {
    id: 'maya',
    name: 'Maya',
    color: '#00D084',
    bearing: 24,
    distance: 38,
    lastSeen: '8s',
    accuracy: 'high',
    area: 'Gate 3',
  },
  {
    id: 'kabir',
    name: 'Kabir',
    color: '#4C8DFF',
    bearing: 108,
    distance: 126,
    lastSeen: '21s',
    accuracy: 'medium',
    area: 'Main stage',
  },
  {
    id: 'zoya',
    name: 'Zoya',
    color: '#FF4FA3',
    bearing: 218,
    distance: 72,
    lastSeen: '14s',
    accuracy: 'high',
    area: 'Food court',
  },
  {
    id: 'dev',
    name: 'Dev',
    color: '#FFD447',
    bearing: 296,
    distance: 204,
    lastSeen: '1m',
    accuracy: 'low',
    area: 'North lawn',
  },
];

const navigationArrow = require('./assets/ui/navigation-arrow-fill.png');

const darkTheme: Theme = {
  background: '#05070A',
  backgroundAlt: '#071322',
  surface: '#0B1624',
  surfaceStrong: '#101F33',
  text: '#F8F2E8',
  muted: '#9BA7B7',
  faint: '#5F6C7D',
  border: 'rgba(255,255,255,0.1)',
  primary: '#FF6A1A',
  primarySoft: 'rgba(255,106,26,0.16)',
  shadow: '#000000',
  ring: 'rgba(248,242,232,0.11)',
};

const lightTheme: Theme = {
  background: '#F7F1E8',
  backgroundAlt: '#FFF9EF',
  surface: '#FFFFFF',
  surfaceStrong: '#F0E7DC',
  text: '#101318',
  muted: '#687385',
  faint: '#A2AAB6',
  border: 'rgba(16,19,24,0.1)',
  primary: '#F25A18',
  primarySoft: 'rgba(242,90,24,0.14)',
  shadow: '#9F8F7D',
  ring: 'rgba(16,19,24,0.12)',
};

function App() {
  const isDarkMode = useColorScheme() === 'dark';
  const theme = isDarkMode ? darkTheme : lightTheme;

  return (
    <SafeAreaProvider>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={theme.background}
      />
      <AppContent theme={theme} />
    </SafeAreaProvider>
  );
}

function AppContent({ theme }: { theme: Theme }) {
  const safeAreaInsets = useSafeAreaInsets();
  const [selectedId, setSelectedId] = useState(friends[0].id);
  const selectedFriend = useMemo(
    () => friends.find(friend => friend.id === selectedId) ?? friends[0],
    [selectedId],
  );

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: safeAreaInsets.top + 18,
          paddingBottom: safeAreaInsets.bottom + 18,
          backgroundColor: theme.background,
        },
      ]}>
      <View
        style={[
          styles.backdropGlow,
          {
            backgroundColor: theme.primary,
            shadowColor: theme.primary,
          },
        ]}
      />

      <View style={styles.header}>
        <View>
          <Text style={[styles.eyebrow, { color: theme.primary }]}>
            FLARE GROUP
          </Text>
          <Text style={[styles.title, { color: theme.text }]}>Afterglow</Text>
        </View>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: theme.primarySoft, borderColor: theme.border },
          ]}>
          <View style={[styles.liveDot, { backgroundColor: theme.primary }]} />
          <Text style={[styles.statusText, { color: theme.text }]}>
            Mesh live
          </Text>
        </View>
      </View>

      <View style={styles.hero}>
        <Compass
          theme={theme}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </View>

      <FriendSheet friend={selectedFriend} theme={theme} />
    </View>
  );
}

function Compass({
  theme,
  selectedId,
  onSelect,
}: {
  theme: Theme;
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View
      style={[
        styles.compassShell,
        {
          backgroundColor: theme.backgroundAlt,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
      ]}>
      <View style={[styles.outerRing, { borderColor: theme.ring }]} />
      <View style={[styles.middleRing, { borderColor: theme.ring }]} />
      <View style={[styles.innerRing, { borderColor: theme.ring }]} />

      <View style={styles.axisVertical} />
      <View style={styles.axisHorizontal} />

      {friends.map(friend => (
        <FriendMarker
          key={friend.id}
          friend={friend}
          selected={friend.id === selectedId}
          theme={theme}
          onPress={() => onSelect(friend.id)}
        />
      ))}

      <View style={styles.centerCluster}>
        <View
          style={[
            styles.youPulse,
            {
              backgroundColor: theme.primarySoft,
              borderColor: theme.primary,
            },
          ]}
        />
        <Image
          source={navigationArrow}
          style={[
            styles.youArrow,
            {
              tintColor: theme.primary,
            },
          ]}
        />
        <Text style={[styles.youLabel, { color: theme.text }]}>YOU</Text>
      </View>

      <Text style={[styles.northLabel, { color: theme.faint }]}>N</Text>
    </View>
  );
}

function FriendMarker({
  friend,
  selected,
  theme,
  onPress,
}: {
  friend: Friend;
  selected: boolean;
  theme: Theme;
  onPress: () => void;
}) {
  const radius = 128;
  const radians = ((friend.bearing - 90) * Math.PI) / 180;
  const x = Math.cos(radians) * radius;
  const y = Math.sin(radians) * radius;

  return (
    <TouchableOpacity
      activeOpacity={0.78}
      onPress={onPress}
      style={[
        styles.friendMarker,
        {
          transform: [{ translateX: x }, { translateY: y }],
        },
      ]}>
      <View
        style={[
          styles.markerGlow,
          selected ? styles.markerGlowSelected : styles.markerGlowDefault,
          {
            backgroundColor: friend.color,
          },
        ]}
      />
      <View
        style={[
          styles.markerDot,
          {
            backgroundColor: friend.color,
            borderColor: selected ? theme.text : theme.backgroundAlt,
            transform: [{ scale: selected ? 1.15 : 1 }],
          },
        ]}
      />
      {selected ? (
        <View
          style={[
            styles.markerTag,
            {
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}>
          <Text style={[styles.markerName, { color: theme.text }]}>
            {friend.name}
          </Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

function FriendSheet({ friend, theme }: { friend: Friend; theme: Theme }) {
  const confidence =
    friend.accuracy === 'high'
      ? 'Strong fix'
      : friend.accuracy === 'medium'
        ? 'Fair fix'
        : 'Low fix';

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: theme.surface,
          borderColor: theme.border,
          shadowColor: theme.shadow,
        },
      ]}>
      <View style={styles.sheetTop}>
        <View style={styles.friendIdentity}>
          <View style={[styles.avatar, { backgroundColor: friend.color }]}>
            <Text style={styles.avatarText}>{friend.name.slice(0, 1)}</Text>
          </View>
          <View>
            <Text style={[styles.friendName, { color: theme.text }]}>
              {friend.name}
            </Text>
            <Text style={[styles.friendArea, { color: theme.muted }]}>
              Near {friend.area}
            </Text>
          </View>
        </View>
        <View style={styles.distanceBlock}>
          <Text style={[styles.distance, { color: theme.text }]}>
            {friend.distance}m
          </Text>
          <Text style={[styles.distanceCaption, { color: theme.muted }]}>
            away
          </Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Metric label="Bearing" value={`${friend.bearing} deg`} theme={theme} />
        <Metric label="Seen" value={`${friend.lastSeen} ago`} theme={theme} />
        <Metric label="Signal" value={confidence} theme={theme} />
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[styles.primaryButton, { backgroundColor: theme.primary }]}>
          <Text style={styles.primaryButtonText}>Ping</Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.secondaryButton,
            {
              backgroundColor: theme.surfaceStrong,
              borderColor: theme.border,
            },
          ]}>
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
            Chat
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          activeOpacity={0.8}
          style={[
            styles.secondaryButton,
            {
              backgroundColor: theme.surfaceStrong,
              borderColor: theme.border,
            },
          ]}>
          <Text style={[styles.secondaryButtonText, { color: theme.text }]}>
            Map
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function Metric({
  label,
  value,
  theme,
}: {
  label: string;
  value: string;
  theme: Theme;
}) {
  return (
    <View style={styles.metric}>
      <Text style={[styles.metricLabel, { color: theme.muted }]}>{label}</Text>
      <Text style={[styles.metricValue, { color: theme.text }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: 22,
  },
  backdropGlow: {
    position: 'absolute',
    top: 50,
    alignSelf: 'center',
    width: 220,
    height: 220,
    borderRadius: 110,
    opacity: 0.1,
    shadowOpacity: 0.85,
    shadowRadius: 80,
    elevation: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.8,
  },
  title: {
    marginTop: 4,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '700',
    letterSpacing: 0,
  },
  statusPill: {
    height: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 13,
    fontWeight: '700',
  },
  hero: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 390,
  },
  compassShell: {
    width: 346,
    height: 346,
    borderRadius: 173,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.32,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 20 },
    elevation: 8,
  },
  outerRing: {
    position: 'absolute',
    width: 310,
    height: 310,
    borderRadius: 155,
    borderWidth: 1,
  },
  middleRing: {
    position: 'absolute',
    width: 218,
    height: 218,
    borderRadius: 109,
    borderWidth: 1,
  },
  innerRing: {
    position: 'absolute',
    width: 112,
    height: 112,
    borderRadius: 56,
    borderWidth: 1,
  },
  axisVertical: {
    position: 'absolute',
    width: 1,
    height: 292,
    backgroundColor: 'rgba(142,154,175,0.18)',
  },
  axisHorizontal: {
    position: 'absolute',
    width: 292,
    height: 1,
    backgroundColor: 'rgba(142,154,175,0.18)',
  },
  centerCluster: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  youPulse: {
    position: 'absolute',
    width: 86,
    height: 86,
    borderRadius: 43,
    borderWidth: 1,
  },
  youArrow: {
    width: 104,
    height: 104,
    marginTop: -1,
    opacity: 0.88,
    marginBottom: -20,
    // shadowColor: '#FF6A1A',
    // shadowOpacity: 0.65,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  youLabel: {
    marginTop: 17,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  northLabel: {
    position: 'absolute',
    top: 20,
    fontSize: 13,
    fontWeight: '800',
  },
  friendMarker: {
    position: 'absolute',
    left: 158,
    top: 158,
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerGlow: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
  },
  markerGlowDefault: {
    opacity: 0.14,
  },
  markerGlowSelected: {
    opacity: 0.28,
  },
  markerDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 3,
  },
  markerTag: {
    position: 'absolute',
    top: 30,
    minWidth: 54,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
  },
  markerName: {
    fontSize: 12,
    fontWeight: '800',
  },
  sheet: {
    borderRadius: 28,
    borderWidth: 1,
    padding: 18,
    shadowOpacity: 0.18,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 7,
  },
  sheetTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  friendIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
  },
  friendName: {
    fontSize: 23,
    fontWeight: '800',
    letterSpacing: 0,
  },
  friendArea: {
    marginTop: 3,
    fontSize: 14,
    fontWeight: '600',
  },
  distanceBlock: {
    alignItems: 'flex-end',
    marginLeft: 12,
  },
  distance: {
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 0,
  },
  distanceCaption: {
    marginTop: -2,
    fontSize: 12,
    fontWeight: '700',
  },
  statsRow: {
    flexDirection: 'row',
    marginTop: 18,
    marginHorizontal: -5,
  },
  metric: {
    flex: 1,
    paddingHorizontal: 5,
  },
  metricLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  metricValue: {
    marginTop: 5,
    fontSize: 14,
    fontWeight: '800',
  },
  actions: {
    flexDirection: 'row',
    marginTop: 18,
  },
  primaryButton: {
    height: 48,
    borderRadius: 24,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    flex: 1,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  secondaryButtonText: {
    fontSize: 15,
    fontWeight: '900',
  },
});

export default App;

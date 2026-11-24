import React, { useEffect, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { Button } from '../components/ui';
import type { ScreenProps } from '../navigation/types';
import { groupInviteLink, personalLink } from '../services/mesh';
import { useGroups } from '../state/groups';
import { useProfile } from '../state/profile';
import { useTheme } from '../theme';

export function ShareCodeScreen({
  navigation,
  route,
}: ScreenProps<'ShareCode'>) {
  const { groupId } = route.params;
  const theme = useTheme();
  const group = useGroups(s => (groupId ? s.groups[groupId] : undefined));
  const name = useProfile(s => s.name);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: groupId ? 'Invite to group' : 'My code' });
  }, [navigation, groupId]);

  useEffect(() => {
    let active = true;
    (groupId ? groupInviteLink(groupId) : personalLink())
      .then(value => active && setLink(value))
      .catch(
        e => active && setError(e instanceof Error ? e.message : String(e)),
      );
    return () => {
      active = false;
    };
  }, [groupId]);

  return (
    <ScrollView
      style={{ backgroundColor: theme.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: theme.text }]}>
        {groupId ? group?.name ?? 'Group' : name}
      </Text>
      <Text style={[styles.lead, { color: theme.muted }]}>
        {groupId
          ? group?.isAdmin
            ? "Friends scan this to ask to join. You'll approve each request, so stay close until they're in."
            : 'Friends scan this to ask the group admin to let them in.'
          : 'A group admin can scan this to add you directly.'}
      </Text>

      <View style={styles.qrBox}>
        {link ? (
          // Always dark-on-white: scanners read that most reliably.
          <QRCode
            value={link}
            size={260}
            color="#000000"
            backgroundColor="#FFFFFF"
            quietZone={16}
          />
        ) : error ? (
          <Text style={[styles.error, { color: theme.danger }]}>{error}</Text>
        ) : (
          <ActivityIndicator color={theme.primary} />
        )}
      </View>

      {link ? (
        <Button
          label="Share as link"
          variant="secondary"
          onPress={() => Share.share({ message: link })}
          style={styles.share}
        />
      ) : null}
      <Text style={[styles.hint, { color: theme.faint }]}>
        Scanning in person is safest. A shared link works too, but only send it
        to people you trust.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 24, alignItems: 'stretch' },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  lead: { marginTop: 10, fontSize: 15, lineHeight: 21, textAlign: 'center' },
  qrBox: {
    marginTop: 28,
    alignSelf: 'center',
    width: 292,
    height: 292,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { padding: 16, textAlign: 'center', fontWeight: '700' },
  share: { marginTop: 28 },
  hint: { marginTop: 16, fontSize: 13, lineHeight: 18, textAlign: 'center' },
});

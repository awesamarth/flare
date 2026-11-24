import React, { useState } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Button, ColorPicker } from '../components/ui';
import { keyboardBehavior } from '../lib/keyboard';
import type { ScreenProps } from '../navigation/types';
import { useProfile } from '../state/profile';
import { MEMBER_COLORS, useTheme } from '../theme';

const MAX_NAME = 24;

export function OnboardingScreen({
  navigation,
  route,
}: ScreenProps<'Onboarding'>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const editing = route.params?.edit === true;
  const profile = useProfile();
  const [name, setName] = useState(profile.name ?? '');
  const [color, setColor] = useState(profile.color);
  const trimmed = name.trim();

  const save = () => {
    if (!trimmed) {
      return;
    }
    Keyboard.dismiss();
    profile.setProfile(trimmed, color);
    if (editing) {
      navigation.goBack();
    } else {
      navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: theme.background }]}
      behavior={keyboardBehavior}
    >
      <ScrollView
        keyboardShouldPersistTaps="always"
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 24 },
        ]}
      >
        {!editing ? (
          <>
            <Text style={[styles.brand, { color: theme.primary }]}>FLARE</Text>
            <Text style={[styles.title, { color: theme.text }]}>
              Find your people, even with no signal.
            </Text>
            <Text style={[styles.lead, { color: theme.muted }]}>
              Flare talks phone to phone over Bluetooth, so chat and locations
              keep working in crowds and places without internet.
            </Text>
          </>
        ) : null}

        <View style={styles.preview}>
          <Avatar name={trimmed || '?'} color={color} size={72} />
        </View>

        <Text style={[styles.label, { color: theme.muted }]}>Your name</Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="What friends call you"
          placeholderTextColor={theme.faint}
          maxLength={MAX_NAME}
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={save}
          style={[
            styles.input,
            {
              color: theme.text,
              backgroundColor: theme.surface,
              borderColor: theme.border,
            },
          ]}
        />

        <Text style={[styles.label, { color: theme.muted }]}>Your color</Text>
        <ColorPicker colors={MEMBER_COLORS} value={color} onChange={setColor} />
        <Text style={[styles.hint, { color: theme.faint }]}>
          If someone in a group already has this color, you'll get the next free
          one there.
        </Text>

        <Button
          label={editing ? 'Save' : 'Get started'}
          onPress={save}
          disabled={trimmed.length === 0}
          style={styles.cta}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: 24,
  },
  brand: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 2,
  },
  title: {
    marginTop: 12,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '800',
  },
  lead: {
    marginTop: 12,
    fontSize: 16,
    lineHeight: 23,
    fontWeight: '500',
  },
  preview: {
    alignItems: 'center',
    marginVertical: 28,
  },
  label: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
    marginTop: 8,
  },
  input: {
    height: 52,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    fontSize: 17,
    fontWeight: '600',
    marginBottom: 20,
  },
  hint: {
    marginTop: 12,
    fontSize: 13,
    lineHeight: 18,
  },
  cta: {
    marginTop: 32,
  },
});

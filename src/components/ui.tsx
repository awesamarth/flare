import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { textOn, useTheme } from '../theme';

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
  compact,
}: ButtonProps) {
  const theme = useTheme();
  const palette = {
    primary: { bg: theme.primary, fg: theme.onPrimary, border: theme.primary },
    secondary: { bg: theme.surfaceAlt, fg: theme.text, border: theme.border },
    danger: { bg: theme.danger, fg: '#FFFFFF', border: theme.danger },
    ghost: { bg: 'transparent', fg: theme.primary, border: 'transparent' },
  }[variant];
  const inactive = !!(disabled || loading);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: inactive ? 0.5 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={palette.fg} />
      ) : (
        <Text style={[styles.buttonText, { color: palette.fg }]}>{label}</Text>
      )}
    </Pressable>
  );
}

export function Avatar({
  name,
  color,
  size = 40,
  dimmed,
}: {
  name?: string;
  color: string;
  size?: number;
  dimmed?: boolean;
}) {
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        },
        dimmed && styles.dimmed,
      ]}
    >
      <Text
        style={[
          styles.avatarText,
          { color: textOn(color), fontSize: size * 0.42 },
        ]}
      >
        {(name ?? '?').slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function ColorPicker({
  colors,
  value,
  taken,
  onChange,
}: {
  colors: readonly string[];
  value: string;
  taken?: Set<string>;
  onChange: (color: string) => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.colorRow}>
      {colors.map(color => {
        const selected = color === value;
        const unavailable = taken?.has(color) && !selected;
        return (
          <Pressable
            key={color}
            accessibilityRole="radio"
            accessibilityState={{ selected, disabled: unavailable }}
            accessibilityLabel={`Color ${color}${unavailable ? ', taken' : ''}`}
            disabled={unavailable}
            onPress={() => onChange(color)}
            style={[
              styles.colorSwatch,
              {
                backgroundColor: color,
              },
              selected && { borderColor: theme.text },
              unavailable && styles.unavailable,
            ]}
          />
        );
      })}
    </View>
  );
}

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.border },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function SectionTitle({ children }: { children: string }) {
  const theme = useTheme();
  return (
    <Text style={[styles.section, { color: theme.muted }]}>{children}</Text>
  );
}

export function Badge({ count }: { count: number }) {
  const theme = useTheme();
  if (count <= 0) {
    return null;
  }
  return (
    <View style={[styles.badge, { backgroundColor: theme.primary }]}>
      <Text style={[styles.badgeText, { color: theme.onPrimary }]}>
        {count > 99 ? '99+' : count}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  dimmed: { opacity: 0.45 },
  unavailable: { opacity: 0.2 },
  button: {
    minHeight: 50,
    paddingHorizontal: 20,
    borderRadius: 25,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonCompact: {
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 20,
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '800',
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '900',
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  colorSwatch: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 3,
  },
  card: {
    borderRadius: 20,
    borderWidth: 1,
    padding: 16,
  },
  section: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 10,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '900',
  },
});

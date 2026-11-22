import { useColorScheme } from 'react-native';

export type Theme = {
  dark: boolean;
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  muted: string;
  faint: string;
  border: string;
  primary: string;
  primarySoft: string;
  onPrimary: string;
  danger: string;
  dangerSoft: string;
  success: string;
  warning: string;
  ring: string;
};

const dark: Theme = {
  dark: true,
  background: '#05070A',
  surface: '#0D1724',
  surfaceAlt: '#132235',
  text: '#F8F2E8',
  muted: '#9BA7B7',
  faint: '#5F6C7D',
  border: 'rgba(255,255,255,0.1)',
  primary: '#FF6A1A',
  primarySoft: 'rgba(255,106,26,0.16)',
  onPrimary: '#FFFFFF',
  danger: '#FF4D4D',
  dangerSoft: 'rgba(255,77,77,0.16)',
  success: '#2BD98B',
  warning: '#FFC145',
  ring: 'rgba(248,242,232,0.12)',
};

const light: Theme = {
  dark: false,
  background: '#F7F1E8',
  surface: '#FFFFFF',
  surfaceAlt: '#F0E7DC',
  text: '#101318',
  muted: '#5F6A7B',
  faint: '#A2AAB6',
  border: 'rgba(16,19,24,0.1)',
  primary: '#E8550F',
  primarySoft: 'rgba(232,85,15,0.12)',
  onPrimary: '#FFFFFF',
  danger: '#D92D2D',
  dangerSoft: 'rgba(217,45,45,0.12)',
  success: '#12A866',
  warning: '#C98A00',
  ring: 'rgba(16,19,24,0.12)',
};

export function useTheme(): Theme {
  return useColorScheme() === 'dark' ? dark : light;
}

/** Colors a member can pick. Unique within a group. */
export const MEMBER_COLORS = [
  '#00D084',
  '#4C8DFF',
  '#FF4FA3',
  '#FFD447',
  '#A970FF',
  '#00C2D1',
  '#FF5C5C',
  '#8BD346',
  '#FF9F1C',
  '#C9A27E',
] as const;

/** Black or white, whichever reads better on the given hex color. */
export function textOn(hex: string): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.55 ? '#101318' : '#FFFFFF';
}

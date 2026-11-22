import React, { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';
import { formatDistance } from '../lib/geo';
import { textOn, useTheme } from '../theme';

export type RadarMember = {
  address: string;
  name: string;
  color: string;
  /** Meters from us. */
  distance: number;
  /** Degrees clockwise from true north, from us to them. */
  bearing: number;
  /** Their reported accuracy in meters (plus ours). */
  accuracy: number;
  stale: boolean;
  sos: boolean;
};

const RANGES = [25, 50, 100, 250, 500, 1000, 2500, 5000, 10_000, 25_000, 100_000];
const MARKER_R = 14;

type Props = {
  size: number;
  members: RadarMember[];
  /** Facing direction; undefined means north-up with no arrow. */
  heading?: number;
  selected?: string;
  onSelect: (address: string) => void;
  /** The group's meeting point, relative to us. */
  meet?: { distance: number; bearing: number };
  onSelectMeet?: () => void;
};

export function Radar({
  size,
  members,
  heading,
  selected,
  onSelect,
  meet,
  onSelectMeet,
}: Props) {
  const theme = useTheme();
  const center = size / 2;
  const radius = center - MARKER_R - 10;
  const rotation = heading ?? 0;

  const range = useMemo(() => {
    const farthest = members.reduce((max, m) => Math.max(max, m.distance), meet?.distance ?? 0);
    return RANGES.find(r => r >= farthest * 1.15) ?? RANGES[RANGES.length - 1];
  }, [members, meet?.distance]);

  // Square-root scale: keeps close friends from collapsing into the center.
  const toPx = (meters: number) =>
    radius * Math.sqrt(Math.min(1, Math.max(0, meters) / range));

  const placed = members.map(member => {
    const r = toPx(member.distance);
    const angle = ((member.bearing - rotation - 90) * Math.PI) / 180;
    const halo = Math.min(
      radius,
      (toPx(member.distance + member.accuracy) -
        toPx(member.distance - member.accuracy)) /
        2,
    );
    return {
      member,
      x: center + Math.cos(angle) * r,
      y: center + Math.sin(angle) * r,
      halo,
    };
  });

  const meetPos = meet
    ? (() => {
        const r = toPx(meet.distance);
        const angle = ((meet.bearing - rotation - 90) * Math.PI) / 180;
        return { x: center + Math.cos(angle) * r, y: center + Math.sin(angle) * r };
      })()
    : undefined;

  const northAngle = ((-rotation - 90) * Math.PI) / 180;
  const north = {
    x: center + Math.cos(northAngle) * (radius + 2),
    y: center + Math.sin(northAngle) * (radius + 2),
  };

  const rings = [0.25, 0.5, 1].map(f => ({ meters: range * f, r: toPx(range * f) }));

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Circle
          cx={center}
          cy={center}
          r={radius + MARKER_R}
          fill={theme.surface}
          stroke={theme.border}
          strokeWidth={1}
        />
        <Circle cx={center} cy={center} r={radius * 0.32} fill={theme.primary} opacity={0.06} />
        {rings.map(ring => (
          <G key={ring.meters}>
            <Circle
              cx={center}
              cy={center}
              r={ring.r}
              stroke={theme.ring}
              strokeWidth={1}
              fill="none"
            />
            <SvgText
              x={center + ring.r * 0.707 + 4}
              y={center - ring.r * 0.707 - 4}
              fill={theme.faint}
              fontSize={10}
              fontWeight="700">
              {formatDistance(ring.meters)}
            </SvgText>
          </G>
        ))}
        <Line
          x1={center}
          y1={center - radius}
          x2={center}
          y2={center + radius}
          stroke={theme.ring}
        />
        <Line
          x1={center - radius}
          y1={center}
          x2={center + radius}
          y2={center}
          stroke={theme.ring}
        />

        <Circle cx={north.x} cy={north.y} r={11} fill={theme.background} />
        <SvgText
          x={north.x}
          y={north.y + 4.5}
          fill={theme.primary}
          fontSize={13}
          fontWeight="900"
          textAnchor="middle">
          N
        </SvgText>

        {meetPos ? (
          <G>
            <Path
              d={`M ${meetPos.x} ${meetPos.y - 13} L ${meetPos.x + 13} ${meetPos.y} L ${meetPos.x} ${meetPos.y + 13} L ${meetPos.x - 13} ${meetPos.y} Z`}
              fill={theme.primary}
              stroke={theme.surface}
              strokeWidth={3}
            />
            <SvgText
              x={meetPos.x}
              y={meetPos.y + 27}
              fill={theme.primary}
              fontSize={10}
              fontWeight="900"
              letterSpacing={1}
              textAnchor="middle">
              MEET
            </SvgText>
          </G>
        ) : null}

        {placed.map(({ member, x, y, halo }) => (
          <G key={member.address} opacity={member.stale ? 0.45 : 1}>
            {halo > MARKER_R ? (
              <Circle cx={x} cy={y} r={halo} fill={member.color} opacity={0.12} />
            ) : null}
            {member.sos ? (
              <Circle
                cx={x}
                cy={y}
                r={MARKER_R + 7}
                stroke={theme.danger}
                strokeWidth={3}
                fill="none"
              />
            ) : null}
            <Circle
              cx={x}
              cy={y}
              r={MARKER_R}
              fill={member.color}
              stroke={member.address === selected ? theme.text : theme.surface}
              strokeWidth={3}
            />
            <SvgText
              x={x}
              y={y + 5}
              fill={textOn(member.color)}
              fontSize={13}
              fontWeight="900"
              textAnchor="middle">
              {member.name.slice(0, 1).toUpperCase()}
            </SvgText>
            {member.address === selected ? (
              <SvgText
                x={x}
                y={y + MARKER_R + 15}
                fill={theme.text}
                fontSize={12}
                fontWeight="800"
                textAnchor="middle">
                {member.name}
              </SvgText>
            ) : null}
          </G>
        ))}

        {heading !== undefined ? (
          <Path
            d={`M ${center} ${center - 18} L ${center + 12} ${center + 13} L ${center} ${center + 6} L ${center - 12} ${center + 13} Z`}
            fill={theme.primary}
          />
        ) : (
          <Circle
            cx={center}
            cy={center}
            r={8}
            fill={theme.primary}
            stroke={theme.surface}
            strokeWidth={3}
          />
        )}
        <SvgText
          x={center}
          y={center + 34}
          fill={theme.muted}
          fontSize={10}
          fontWeight="800"
          letterSpacing={1.2}
          textAnchor="middle">
          YOU
        </SvgText>
      </Svg>

      {meetPos && onSelectMeet ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Meeting point, ${formatDistance(meet?.distance ?? 0)}`}
          onPress={onSelectMeet}
          hitSlop={8}
          style={[styles.hit, { left: meetPos.x - MARKER_R - 6, top: meetPos.y - MARKER_R - 6 }]}
        />
      ) : null}
      {placed.map(({ member, x, y }) => (
        <Pressable
          key={member.address}
          accessibilityRole="button"
          accessibilityLabel={`${member.name}, ${formatDistance(member.distance)}`}
          onPress={() => onSelect(member.address)}
          hitSlop={8}
          style={[
            styles.hit,
            { left: x - MARKER_R - 6, top: y - MARKER_R - 6 },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  hit: {
    position: 'absolute',
    width: (MARKER_R + 6) * 2,
    height: (MARKER_R + 6) * 2,
    borderRadius: MARKER_R + 6,
  },
});

import { useMemo } from 'react';
import type { RadarMember } from '../components/Radar';
import type { Group, Member } from '../state/groups';
import { useRuntime } from '../state/runtime';
import { bearingDeg, distanceMeters } from './geo';

/** A location older than this is drawn faded. */
export const STALE_MS = 2 * 60_000;

export type Located = {
  member: Member;
  distance: number;
  bearing: number;
  /** Their accuracy plus ours, in meters. */
  accuracy: number;
};

/** Where everyone in the group is relative to us, ready for the radar. */
export function useGroupRadar(
  group: Group | undefined,
  now: number,
  fallbackColor: string,
) {
  const position = useRuntime(s => s.position);

  const members = useMemo(() => Object.values(group?.members ?? {}), [group]);

  const located: Located[] = useMemo(() => {
    if (!position) {
      return [];
    }
    return members
      .filter((m): m is Member & { loc: NonNullable<Member['loc']> } => !!m.loc)
      .map(m => ({
        member: m,
        distance: distanceMeters(position, m.loc),
        bearing: bearingDeg(position, m.loc),
        accuracy: m.loc.acc + position.acc,
      }));
  }, [members, position]);

  const radarMembers: RadarMember[] = located.map(l => ({
    address: l.member.address,
    name: l.member.name ?? '?',
    color: l.member.color ?? fallbackColor,
    distance: l.distance,
    bearing: l.bearing,
    accuracy: l.accuracy,
    stale: now - (l.member.loc?.ts ?? 0) > STALE_MS,
    sos: !!l.member.sos?.active,
  }));

  return { members, located, radarMembers };
}

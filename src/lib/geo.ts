export type LatLon = { lat: number; lon: number };

const EARTH_RADIUS_M = 6_371_000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Great-circle distance in meters. */
export function distanceMeters(a: LatLon, b: LatLon): number {
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial bearing from a to b, degrees clockwise from true north. */
export function bearingDeg(a: LatLon, b: LatLon): number {
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) -
    Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLon);
  return normalizeDeg(toDeg(Math.atan2(y, x)));
}

export function formatDistance(meters: number): string {
  if (meters < 10) {
    return `${Math.round(meters)} m`;
  }
  if (meters < 1000) {
    return `${Math.round(meters / 5) * 5} m`;
  }
  return `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0)} km`;
}

const COMPASS_POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

export function compassPoint(deg: number): string {
  return COMPASS_POINTS[Math.round(normalizeDeg(deg) / 45) % 8];
}

/** Human direction relative to where the user is facing. */
export function relativeDirection(relativeDeg: number): string {
  const d = normalizeDeg(relativeDeg);
  if (d < 22.5 || d >= 337.5) {
    return 'ahead';
  }
  if (d < 67.5) {
    return 'ahead right';
  }
  if (d < 112.5) {
    return 'right';
  }
  if (d < 157.5) {
    return 'behind right';
  }
  if (d < 202.5) {
    return 'behind';
  }
  if (d < 247.5) {
    return 'behind left';
  }
  if (d < 292.5) {
    return 'left';
  }
  return 'ahead left';
}

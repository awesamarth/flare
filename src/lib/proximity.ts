/**
 * Turning Bluetooth signal strength (RSSI) into a distance.
 *
 * Uses the log-distance path-loss model: d = 10 ^ ((P1m - rssi) / (10 n)),
 * where P1m is the signal at 1 m and n is how fast the signal fades.
 * Neither is known for a given pair of phones in a given crowd: P1m varies by
 * phone model (about -65 to -55 dBm) and n by surroundings (about 2 in open
 * air, 3+ through bodies). So we never report one number, only a range built
 * from the extremes, and a trend (closer / farther), which is reliable even
 * when the absolute distance isn't.
 */

const P1M_WEAK = -65;
const P1M_STRONG = -55;
const N_OPEN = 2;
const N_CROWD = 3;

/** A reading older than this is ignored. */
export const PROXIMITY_FRESH_MS = 15_000;

export type Trend = 'closer' | 'farther' | 'steady';

export type Proximity = {
  /** Smoothed RSSI in dBm. */
  rssi: number;
  at: number;
  trend: Trend;
};

export type DistanceRange = { low: number; high: number; mid: number };

export function rssiToRange(rssi: number): DistanceRange {
  const a = 10 ** ((P1M_WEAK - rssi) / (10 * N_CROWD));
  const b = 10 ** ((P1M_STRONG - rssi) / (10 * N_OPEN));
  const low = Math.max(0.3, Math.min(a, b));
  const high = Math.max(low, a, b);
  return { low, high, mid: Math.sqrt(low * high) };
}

export function formatRange({ low, high }: DistanceRange): string {
  const round = (m: number) =>
    m < 10 ? Math.max(1, Math.round(m)) : Math.round(m / 5) * 5;
  const lo = round(low);
  const hi = round(high);
  if (hi <= 1) {
    return 'within 1 m';
  }
  return lo === hi ? `~${lo} m` : `${lo}–${hi} m`;
}

/** 0 (barely there) to 1 (touching). */
export function signalStrength(rssi: number): number {
  return Math.min(1, Math.max(0, (rssi + 100) / 60));
}

export function isFresh(p: Proximity | undefined, now: number): p is Proximity {
  return !!p && now - p.at < PROXIMITY_FRESH_MS;
}

/**
 * Per-peer smoothing. Raw readings swing ±8 dB, so an exponential moving
 * average, plus a trend from comparing against ~4 s ago.
 */
export class RssiSmoother {
  private value: number | undefined;
  private history: { at: number; value: number }[] = [];

  push(rssi: number, at: number): Proximity {
    this.value =
      this.value === undefined ? rssi : 0.7 * this.value + 0.3 * rssi;
    this.history.push({ at, value: this.value });
    this.history = this.history.filter(h => at - h.at <= 8_000);
    // The most recent reading at least ~3.5 s old.
    let past: { at: number; value: number } | undefined;
    for (const h of this.history) {
      if (at - h.at >= 3_500) {
        past = h;
      }
    }
    let trend: Trend = 'steady';
    if (past) {
      const delta = this.value - past.value;
      trend = delta > 2.5 ? 'closer' : delta < -2.5 ? 'farther' : 'steady';
    }
    return { rssi: this.value, at, trend };
  }
}

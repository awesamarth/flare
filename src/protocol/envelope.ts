/**
 * Wire format for everything Flare sends over the mesh.
 *
 * Every payload is a small JSON object with a version (`v`), a scope (`s`:
 * `g` for group fan-out, `d` for direct messages) and a kind (`k`). Anything
 * that does not decode is dropped, except plain-text direct messages, which
 * are shown as chat so other SDK apps can still talk to us.
 */

export const WIRE_VERSION = 1;

export type LocationFix = {
  lat: number;
  lon: number;
  /** Horizontal accuracy radius in meters. */
  acc: number;
  /** When the fix was taken (sender clock, ms). */
  ts: number;
};

export type GroupPayload =
  | { k: 'chat'; id: string; text: string; ts: number }
  | ({ k: 'loc' } & LocationFix)
  | { k: 'profile'; name: string; color: string; ts: number }
  | { k: 'ping'; id: string; to?: string; ts: number }
  | { k: 'sos'; id: string; active: boolean; loc?: LocationFix; ts: number };

export type DirectPayload =
  | { k: 'chat'; id: string; text: string; ts: number }
  | { k: 'ping'; id: string; ts: number }
  | {
      k: 'join_req';
      g: string;
      name: string;
      color: string;
      ts: number;
    }
  | { k: 'join_res'; g: string; ok: boolean; ts: number };

/** Rides in the SDK media caption so the receiver knows where a photo goes. */
export type PhotoCaption = { id: string; g?: string; ts: number };

export function encodePhotoCaption(caption: PhotoCaption): string {
  return JSON.stringify({ v: WIRE_VERSION, s: 'p', ...caption });
}

export function decodePhotoCaption(content: string | undefined): PhotoCaption | null {
  if (!content) {
    return null;
  }
  const raw = parse(content);
  if (!raw || raw.v !== WIRE_VERSION || raw.s !== 'p' || !isNum(raw.ts) || !isStr(raw.id, 64)) {
    return null;
  }
  return { id: raw.id, g: isStr(raw.g, 256) ? raw.g : undefined, ts: raw.ts };
}

const MAX_TEXT = 2000;
const MAX_NAME = 32;

export function encodeGroup(payload: GroupPayload): string {
  return JSON.stringify({ v: WIRE_VERSION, s: 'g', ...payload });
}

export function encodeDirect(payload: DirectPayload): string {
  return JSON.stringify({ v: WIRE_VERSION, s: 'd', ...payload });
}

type Raw = Record<string, unknown>;

function parse(content: string): Raw | null {
  if (!content.startsWith('{')) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(content);
    return value && typeof value === 'object' && !Array.isArray(value)
      ? (value as Raw)
      : null;
  } catch {
    return null;
  }
}

const isStr = (v: unknown, max = 256): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const isNum = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v);
const isColor = (v: unknown): v is string =>
  typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

function decodeFix(raw: Raw): LocationFix | null {
  const { lat, lon, acc, ts } = raw;
  if (
    isNum(lat) &&
    isNum(lon) &&
    isNum(acc) &&
    isNum(ts) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lon) <= 180 &&
    acc >= 0
  ) {
    return { lat, lon, acc, ts };
  }
  return null;
}

export function decodeGroup(content: string): GroupPayload | null {
  const raw = parse(content);
  if (!raw || raw.v !== WIRE_VERSION || raw.s !== 'g' || !isNum(raw.ts)) {
    return null;
  }
  const ts = raw.ts;
  switch (raw.k) {
    case 'chat':
      return isStr(raw.id, 64) && isStr(raw.text, MAX_TEXT)
        ? { k: 'chat', id: raw.id, text: raw.text, ts }
        : null;
    case 'loc': {
      const fix = decodeFix(raw);
      return fix ? { k: 'loc', ...fix } : null;
    }
    case 'profile':
      return isStr(raw.name, MAX_NAME) && isColor(raw.color)
        ? { k: 'profile', name: raw.name, color: raw.color, ts }
        : null;
    case 'ping':
      return isStr(raw.id, 64)
        ? {
            k: 'ping',
            id: raw.id,
            to: isStr(raw.to, 128) ? raw.to : undefined,
            ts,
          }
        : null;
    case 'sos': {
      if (!isStr(raw.id, 64) || typeof raw.active !== 'boolean') {
        return null;
      }
      const loc =
        raw.loc && typeof raw.loc === 'object'
          ? decodeFix(raw.loc as Raw) ?? undefined
          : undefined;
      return { k: 'sos', id: raw.id, active: raw.active, loc, ts };
    }
    default:
      return null;
  }
}

export function decodeDirect(content: string): DirectPayload | null {
  const raw = parse(content);
  if (!raw) {
    // Plain text from another SDK app: treat as chat.
    return content.length > 0 && content.length <= MAX_TEXT
      ? { k: 'chat', id: '', text: content, ts: Date.now() }
      : null;
  }
  if (raw.v !== WIRE_VERSION || raw.s !== 'd' || !isNum(raw.ts)) {
    return null;
  }
  const ts = raw.ts;
  switch (raw.k) {
    case 'chat':
      return isStr(raw.id, 64) && isStr(raw.text, MAX_TEXT)
        ? { k: 'chat', id: raw.id, text: raw.text, ts }
        : null;
    case 'ping':
      return isStr(raw.id, 64) ? { k: 'ping', id: raw.id, ts } : null;
    case 'join_req':
      return isStr(raw.g, 256) && isStr(raw.name, MAX_NAME) && isColor(raw.color)
        ? { k: 'join_req', g: raw.g, name: raw.name, color: raw.color, ts }
        : null;
    case 'join_res':
      return isStr(raw.g, 256) && typeof raw.ok === 'boolean'
        ? { k: 'join_res', g: raw.g, ok: raw.ok, ts }
        : null;
    default:
      return null;
  }
}

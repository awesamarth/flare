/**
 * QR / share links.
 *
 * - Group invite (flow a): `flare://join?g=<groupId>&n=<groupName>&c=<adminInvite>`
 *   The scanner sends a join request to the admin, who approves it.
 * - Personal code (flow b): `flare://me?c=<invite>`
 *   An admin scans it and adds that person to a group directly.
 *
 * `c` is an SDK invite blob (base64url). It is verified with
 * `parseInvite()` before we act on it.
 */

export type FlareLink =
  | { type: 'group'; groupId: string; groupName: string; invite: string }
  | { type: 'person'; invite: string };

const SCHEME = 'flare://';

function encodeParams(params: Record<string, string>): string {
  return Object.entries(params)
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&');
}

function decodeParams(query: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of query.split('&')) {
    const eq = part.indexOf('=');
    if (eq <= 0) {
      continue;
    }
    try {
      out[part.slice(0, eq)] = decodeURIComponent(part.slice(eq + 1));
    } catch {
      // Malformed escape: skip this param.
    }
  }
  return out;
}

export function buildGroupLink(
  groupId: string,
  groupName: string,
  invite: string,
): string {
  return `${SCHEME}join?${encodeParams({ g: groupId, n: groupName, c: invite })}`;
}

export function buildPersonLink(invite: string): string {
  return `${SCHEME}me?${encodeParams({ c: invite })}`;
}

export function parseLink(value: string): FlareLink | null {
  const text = value.trim();
  if (!text.startsWith(SCHEME)) {
    return null;
  }
  const rest = text.slice(SCHEME.length);
  const q = rest.indexOf('?');
  if (q < 0) {
    return null;
  }
  const route = rest.slice(0, q);
  const params = decodeParams(rest.slice(q + 1));
  if (!params.c || params.c.length > 1024) {
    return null;
  }
  if (route === 'join' && params.g && params.g.length <= 256) {
    return {
      type: 'group',
      groupId: params.g,
      groupName: (params.n ?? 'Group').slice(0, 48),
      invite: params.c,
    };
  }
  if (route === 'me') {
    return { type: 'person', invite: params.c };
  }
  return null;
}

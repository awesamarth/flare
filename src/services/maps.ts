import {
  OfflineManager,
  TransformRequestManager,
  type LngLatBounds,
  type OfflinePack,
  type OfflinePackStatus,
} from '@maplibre/maplibre-react-native';

/**
 * Street maps from OpenFreeMap (OpenStreetMap data, no API key). Saved
 * offline as MapLibre packs, which hold the style, fonts, icons and tiles, so
 * the map opens with no signal at the venue.
 *
 * OpenFreeMap's terms for offline downloads: at most 3,000 tiles / 50 MB per
 * download, and an identifying User-Agent. https://openfreemap.org/tos/
 */

export const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty';
const MAX_TILES = 3000;
const MIN_ZOOM = 10;
const MAX_ZOOM = 17;
/** Give up when a download makes no progress for this long. */
const STALL_MS = 60_000;

let initialized = false;

export function initMaps() {
  if (initialized) {
    return;
  }
  initialized = true;
  TransformRequestManager.addHeader({
    name: 'User-Agent',
    value: 'Flare/0.1 (offline group finder for events)',
    match: 'openfreemap.org',
  });
}

/** Square box of `radius` meters around a point. */
export function boundsAround(
  lat: number,
  lon: number,
  radius: number,
): LngLatBounds {
  const dLat = radius / 111_320;
  const dLon =
    radius / (111_320 * Math.max(0.01, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat - dLat, lon + dLon, lat + dLat];
}

function tileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function tileY(lat: number, z: number) {
  const r = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z,
  );
}

export function countTiles(
  [west, south, east, north]: LngLatBounds,
  minZ: number,
  maxZ: number,
) {
  let total = 0;
  for (let z = minZ; z <= maxZ; z++) {
    const xs = tileX(east, z) - tileX(west, z) + 1;
    const ys = tileY(south, z) - tileY(north, z) + 1;
    total += xs * ys;
  }
  return total;
}

export type SavedArea = {
  id: string;
  name: string;
  createdAt: number;
  bounds: LngLatBounds;
  /** Only a complete pack can be trusted offline. */
  complete: boolean;
  percentage: number;
};

async function toSaved(pack: OfflinePack): Promise<SavedArea> {
  const status = await pack.status().catch(() => null);
  return {
    complete: status?.state === 'complete' || (status?.percentage ?? 0) >= 100,
    percentage: status?.percentage ?? 0,
    id: pack.id,
    name:
      typeof pack.metadata?.name === 'string'
        ? pack.metadata.name
        : 'Saved area',
    createdAt:
      typeof pack.metadata?.createdAt === 'number'
        ? pack.metadata.createdAt
        : 0,
    bounds: pack.bounds,
  };
}

export async function listSavedAreas(): Promise<SavedArea[]> {
  const packs = await OfflineManager.getPacks();
  const areas = await Promise.all(packs.map(toSaved));
  return areas.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteSavedArea(id: string) {
  await OfflineManager.deletePack(id);
}

/**
 * Continue an interrupted download. Polls the pack's status rather than
 * relying on listeners, and gives up if it stops moving.
 */
export async function resumeSavedArea(
  id: string,
  onProgress: (percentage: number, state: OfflinePackStatus['state']) => void,
): Promise<void> {
  initMaps();
  const pack = (await OfflineManager.getPacks()).find(p => p.id === id);
  if (!pack) {
    throw new Error('That saved area no longer exists.');
  }
  await pack.resume();
  let lastPercentage = -1;
  let lastMovedAt = Date.now();
  for (;;) {
    await new Promise<void>(r => setTimeout(r, 2_000));
    const status = await pack.status();
    onProgress(status.percentage, status.state);
    if (status.state === 'complete' || status.percentage >= 100) {
      return;
    }
    if (status.percentage !== lastPercentage) {
      lastPercentage = status.percentage;
      lastMovedAt = Date.now();
    } else if (Date.now() - lastMovedAt > STALL_MS) {
      throw new Error(
        'The download stopped moving. Check your connection and try again.',
      );
    }
  }
}

/**
 * Download the map around a point for offline use. Lowers the max zoom until
 * the download fits OpenFreeMap's per-download cap.
 */
export async function saveAreaOffline(
  name: string,
  lat: number,
  lon: number,
  radius: number,
  onProgress: (percentage: number, state: OfflinePackStatus['state']) => void,
): Promise<{ tiles: number; maxZoom: number }> {
  initMaps();
  const bounds = boundsAround(lat, lon, radius);
  let maxZoom = MAX_ZOOM;
  while (
    maxZoom > MIN_ZOOM &&
    countTiles(bounds, MIN_ZOOM, maxZoom) > MAX_TILES
  ) {
    maxZoom--;
  }
  const tiles = countTiles(bounds, MIN_ZOOM, maxZoom);
  if (tiles > MAX_TILES) {
    throw new Error('That area is too large to save. Try a smaller radius.');
  }
  await new Promise<void>((resolve, reject) => {
    // Single-tile errors (timeouts on a weak connection) are retried by
    // MapLibre, so only give up when the download stops moving entirely.
    let lastError: string | undefined;
    let lastPercentage = -1;
    let lastMovedAt = Date.now();
    const watchdog = setInterval(() => {
      if (Date.now() - lastMovedAt > STALL_MS) {
        clearInterval(watchdog);
        reject(
          new Error(
            `The download stopped moving${
              lastError ? ` (${lastError})` : ''
            }. Check your connection and try again; what was saved is kept.`,
          ),
        );
      }
    }, 5_000);
    OfflineManager.createPack(
      {
        mapStyle: MAP_STYLE,
        bounds,
        minZoom: MIN_ZOOM,
        maxZoom,
        metadata: { name, createdAt: Date.now() },
      },
      (_pack, status) => {
        if (status.percentage !== lastPercentage) {
          lastPercentage = status.percentage;
          lastMovedAt = Date.now();
        }
        onProgress(status.percentage, status.state);
        if (status.state === 'complete') {
          clearInterval(watchdog);
          resolve();
        }
      },
      (_pack, error) => {
        lastError = error.message;
      },
    ).catch(error => {
      clearInterval(watchdog);
      reject(error);
    });
  });
  return { tiles, maxZoom };
}

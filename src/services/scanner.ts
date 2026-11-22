import { DataScanner } from 'react-native-data-scanner';

/**
 * Opens the platform's native QR scanner. Resolves `null` when the user
 * backs out, throws when scanning isn't available on this device.
 */
export async function scanQr(): Promise<string | null> {
  try {
    const result = await DataScanner.scanBarcode({
      targetFormats: ['qr'],
      enableAutoZoom: true,
    });
    return result.value;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/cancel/i.test(message)) {
      return null;
    }
    throw new Error(`Couldn't open the scanner: ${message}`);
  }
}

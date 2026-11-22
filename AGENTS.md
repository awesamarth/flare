# Flare Agent Notes

Flare is a React Native mobile app concept for offline friend finding at crowded festivals and events.

## Product Direction

- Main experience: a compass/radar screen that points toward friends using phone GPS/GNSS, compass/IMU heading, and offline mesh updates.
- Users can create groups, join via QR/invite code, set a username, and choose a unique color within each group.
- Friend location sharing, group chat, pings/SOS, and last-seen/accuracy indicators are core.
- Venue maps are secondary: prefer calibrated event map images for the MVP; consider MapLibre/offline tile packs later.

## Technical Direction

- Use React Native with TypeScript and Bun for package/script workflows.
- Use the mesh SDK as the offline transport layer for encrypted chat, group/location payloads, peer discovery, retries, and transport switching.
- Mesh SDK `@offline-protocol/mesh-sdk@0.26.0` is installed via Bun; full SDK README is at `node_modules/@offline-protocol/mesh-sdk/README.md` (old `reference-dumps/meshsdk.txt` was removed).
- GPS/GNSS and compass/IMU are outside the mesh SDK and should be handled with React Native/native location and sensor APIs.
- BLE/WiFi Direct/Internet/Reticulum from the SDK can complement each other, but the app must degrade cleanly when any signal is weak or unavailable.

## UX Principles

- Be honest about uncertainty: show distance, last seen, and accuracy/confidence instead of implying perfect precision.
- Keep the compass screen uncluttered: friend colors on the rim, optional distance on focus/tap, and detailed map/chat in secondary views.
- Avoid Google Maps offline dependency for MVP; use event-specific assets or offline map packs that the app controls.

## Current Project Status

- Real app (no mocks) in `src/`: `App.tsx` (navigation), `screens/`, `components/`, `services/` (mesh, location, meet, scanner, permissions), `state/` (zustand + MMKV), `protocol/` (wire envelope, QR links), `lib/`.
- Mesh SDK `@offline-protocol/mesh-sdk@0.34.0`. Upgrade guide: `docs/UPGRADING.md` in the SDK's GitHub repo (do not copy into this repo).
- Stack: `react-native-nitro-geolocation` (GPS + compass), `react-native-data-scanner` (QR), `react-native-mmkv`, `react-native-svg`, `react-native-qrcode-svg`, React Navigation. No Expo.
- Home is radar-first (active group). Groups list, group details, chat, find (Bluetooth hot/cold), meeting point (SDK DataStore), status screens.
- Transports: BLE + Wi-Fi Direct (`autoAccept`, `fastLink: 'requestedOnly'`). `advertiseNodeHash` is an Android opt-in toggle on the Status screen (privacy cost).
- Only tested on one Android phone (Nothing `eeb57179`). iOS has never been built. Multi-device flows (join, chat, location, rssi, meet sync) are untested.
- Known gap: location is not shared while the app is backgrounded (needs a location foreground service / background permission).

## Dev Workflow

- Fast Android build: `cd android && ./gradlew assembleDebug -PreactNativeArchitectures=arm64-v8a`, or `bun run android` (active arch only).
- iOS pods: `cd ios && bundle exec pod install`.
- New files/screens may not hot-reload: force-stop and relaunch the app.
- `adb reverse tcp:8081 tcp:8081` only after reconnects / "Unable to load script".
- Screenshot: `adb exec-out screencap -p > screenshots/flare-current.png`.

## Assets

- `assets/brand/flare.png`: 1024x1024 source art for app icons.
- Android launcher: adaptive icon (`mipmap-anydpi-v26`) with the brand art as the background layer; legacy PNGs in `mipmap-*` for API 24-25.
- `drawable/ic_notification.xml`: monochrome arrow for notifications and the themed launcher icon.
- iOS app icons in `ios/Flare/Images.xcassets/AppIcon.appiconset`.

## Validation

- `bunx tsc --noEmit`, `bun run lint`, `bun run test -- --runInBand`. Run before handoff, not after every visual tweak.

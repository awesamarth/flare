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
- GPS/GNSS and compass/IMU are outside the mesh SDK and should be handled with React Native/native location and sensor APIs.
- BLE/WiFi Direct/Internet/Reticulum from the SDK can complement each other, but the app must degrade cleanly when any signal is weak or unavailable.

## UX Principles

- Be honest about uncertainty: show distance, last seen, and accuracy/confidence instead of implying perfect precision.
- Keep the compass screen uncluttered: friend colors on the rim, optional distance on focus/tap, and detailed map/chat in secondary views.
- Avoid Google Maps offline dependency for MVP; use event-specific assets or offline map packs that the app controls.

## Current Project Status

- React Native app has been scaffolded directly in the repo root with TypeScript and Bun.
- Git has been initialized, but no initial commit has been made yet.
- Android physical-device development works with the connected phone when `adb devices` shows `eeb57179 device`.
- Metro dev server was started with `bun run start` on port 8081 during the session.
- Android app was installed successfully once with `bun run android`.
- The generated Gradle wrapper was changed from Gradle 9.3.1 to Gradle 8.13 because Gradle 9 hit a `JvmVendorSpec IBM_SEMERU` toolchain error.
- `adb reverse tcp:8081 tcp:8081` is only needed after device reconnects or when the phone shows "Unable to load script"; do not run it after every visual tweak if Fast Refresh is working.

## Current UI State

- `App.tsx` now contains a static Flare compass prototype with mock group/friend data.
- The prototype supports light/dark mode via `useColorScheme`.
- Main screen includes:
  - group header: `Afterglow`
  - `Mesh live` status pill
  - circular radar/compass
  - colored friend markers around the rim
  - selectable friend marker labels
  - bottom friend sheet with distance, bearing, last seen, signal confidence, and `Ping`, `Chat`, `Map` actions
- The center "you" arrow uses `assets/ui/navigation-arrow-fill.png`, generated from `navigation-arrow-fill.svg`, tinted orange in React Native.
- Latest device screenshot was captured at `screenshots/flare-current.png`.
- To capture future phone screenshots without WhatsApp/manual sharing, use:
  `mkdir -p screenshots && adb exec-out screencap -p > screenshots/flare-current.png`

## Assets

- `assets/brand/flare.png` is the 1024x1024 source image provided for the app icon.
- Android launcher icons were generated into `android/app/src/main/res/mipmap-*`.
- iOS app icons were generated into `ios/Flare/Images.xcassets/AppIcon.appiconset` and `Contents.json` was updated.
- Android launcher icon currently needs later cleanup: it may appear padded/with an unwanted launcher background because adaptive icons were not set up yet.
- `navigation-arrow-fill.svg` is the source arrow asset added by the user.
- `assets/ui/navigation-arrow-fill.png` is the current rendered arrow mask used by the app.
- `assets/ui/navigation-arrow.png` is an earlier generated arrow attempt and can likely be removed later if unused.
- `icon-concepts.html` is an earlier logo review page with rejected concepts and can likely be removed later if not useful.

## Validation

- `bun run lint` passed after the current UI implementation.
- `bun run test -- --runInBand` passed after the current UI implementation.
- Per user preference, do not run lint/tests after every tiny visual tweak. Use them before meaningful handoff or when touching logic.

## Next Useful Steps

- Commit the current scaffold once the user is ready.
- Polish the compass UI spacing and center arrow size/opacity.
- Add real navigation/vector support later, likely with `react-native-svg`, instead of relying on rasterized SVG masks.
- Add profile/group setup screens: username, unique group color, QR/invite flow.
- Add GPS/GNSS location and compass/heading sensors.
- Add mesh SDK integration for encrypted chat and location payloads.
- Decide offline map MVP: calibrated venue map image first, MapLibre/offline tile packs later.
- Add Android adaptive icon resources so the launcher icon is not padded or placed on an unwanted background.

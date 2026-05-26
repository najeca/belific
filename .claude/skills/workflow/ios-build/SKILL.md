---
name: ios-build
description: Run the full Belific iOS build sequence on device. Applies all known Podfile patches (fmt Clang 16, ExpoFont manual pod, deployment target). Use when a fresh native build is needed after deps change or ios/ is regenerated.
---

# iOS Build

## Instructions

1. Run pre-build check:
   ```bash
   bash .claude/skills/workflow/ios-build/scripts/pre-build-check.sh
   ```
   Abort if any check fails.

2. Remove the existing ios/ folder and regenerate:
   ```bash
   cd mobile/
   rm -rf ios
   npx expo prebuild --platform ios
   ```

3. Apply all Podfile patches (fmt + ExpoFont + deployment target).
   Run the patch script:
   ```bash
   bash .claude/skills/workflow/ios-build/scripts/patch-podfile.sh
   ```

4. Install pods:
   ```bash
   cd mobile/ios && pod install && cd ..
   ```

5. Build and install on device:
   ```bash
   cd mobile/
   npx expo run:ios --device 00008150-000438D40A92401C --configuration Release
   ```
   Device: Jethro's iPhone (`00008150-000438D40A92401C`)

6. If build fails, check `.claude/skills/workflow/ios-build/reference/known-errors.md`
   before reading raw logs.

## Critical Invariants

- Always `--configuration Release` for device installs (Debug phones home to Metro and crashes)
- Use `--device <UDID>` not `--udid` (flag does not exist in this Expo CLI version)
- `expo-font` must be manually added to Podfile after every prebuild (autolinking skips it)
- iOS deployment target must be 16.4 in three places: Podfile, app.json, xcodeproj
- `fmt` base.h gsub patch is the load-bearing fix — the `-DFMT_CONSTEVAL` flag alone is overridden by the header

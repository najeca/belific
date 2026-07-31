# Belific iOS Build Notes

## Issues encountered during local Release build (May 2026)

---

### 1. react-dom conflict

`react-dom` was in `package.json` but React Native does not use it.
It demanded `react@19.2.6` while Expo SDK 54 pins `react@19.1.0`.

**Fix:**
```bash
cd /Users/jethro/Developer/belific/mobile
npm uninstall react-dom
npm install react@19.1.0 --save-exact
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

---

### 2. expo-modules-autolinking missing after clean npm install

In this project (single `package.json`, no workspaces hoisting), `expo-modules-autolinking`
is not automatically installed as a transitive dep. `expo prebuild` fails with:
`Cannot find module 'expo-modules-autolinking/exports'`

**Fix:**
```bash
npm install expo-modules-autolinking --legacy-peer-deps
```

---

### 3. Xcode 16 / fmt C++ consteval compilation bug

RN 0.81.5 pulls in the `fmt` library which uses `consteval` in a way Apple Clang 16 rejects.
Build dies in `Pods/fmt` with: *call to consteval function is not a constant expression*

The root cause is that `fmt/base.h` redefines `FMT_CONSTEVAL` unconditionally, so a
compiler `-D` flag alone is overridden by the header. The working fix patches the header
source file directly in `post_install`.

**Fix — add both blocks inside `post_install do |installer|` in `ios/Podfile`
after `react_native_post_install(...)`, every time prebuild regenerates the Podfile:**

```ruby
# Build flag (belt)
installer.pods_project.targets.each do |target|
  if target.name == 'fmt'
    target.build_configurations.each do |config|
      flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
      config.build_settings['OTHER_CPLUSPLUSFLAGS'] = "#{flags} -DFMT_CONSTEVAL=constexpr"
    end
  end
end

# Header patch (braces) — the load-bearing fix; chmod needed as Pods files are read-only
fmt_base_h = "#{installer.sandbox.root}/fmt/include/fmt/base.h"
if File.exist?(fmt_base_h)
  content = File.read(fmt_base_h)
  patched = content.gsub(
    /defined\(__apple_build_version__\) && __apple_build_version__ < \d+L/,
    'defined(__apple_build_version__)'
  )
  if patched != content
    File.chmod(0644, fmt_base_h)
    File.write(fmt_base_h, patched)
  end
end
```

---

### 4. expo-font not linking (autolinking silently skipped)

`expo-font` was installed after `prebuild` ran, so `ExpoFontLoader` native module was missing
from the binary, causing a crash on launch. Autolinking also silently skips it in this setup.

**Fix A — persist in `app.json` so it survives future prebuilds:**
```json
"plugins": ["expo-font", "expo-router", ...]
```

**Fix B — force the pod manually in `ios/Podfile` inside `target 'Belific' do`, directly after `use_expo_modules!`:**
```ruby
pod 'ExpoFont', :path => '../node_modules/expo-font/ios'
```

Then run `pod install`.

---

### 5. iOS deployment target too low for ExpoFont

`ExpoFont` 56.x requires iOS 16.4. The generated Podfile defaults to `15.1`, causing:
*compiling for iOS 15.1, but module 'ExpoFont' has a minimum deployment target of iOS 16.4*

**Fix — three places to update:**

1. `ios/Podfile` — change the platform fallback:
```ruby
platform :ios, podfile_properties['ios.deploymentTarget'] || '16.4'
```

2. `app.json` — set it so future prebuilds inherit it:
```json
"ios": {
  "deploymentTarget": "16.4",
  ...
}
```

3. `ios/Belific.xcodeproj/project.pbxproj` — bulk replace (4 occurrences):
```bash
sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/IPHONEOS_DEPLOYMENT_TARGET = 16.4;/g' \
  ios/Belific.xcodeproj/project.pbxproj
```

Also bump all Pods targets in `post_install` to avoid mismatch warnings:
```ruby
installer.pods_project.targets.each do |target|
  target.build_configurations.each do |config|
    if config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < 16.4
      config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.4'
    end
  end
end
```

---

### 6. `--device` flag, not `--udid`

`npx expo run:ios --udid <UDID>` errors with *Unknown arguments: --udid* in this version of
the Expo CLI. Use `--device` instead:

```bash
npx expo run:ios --device 00008150-000438D40A92401C --configuration Release
```

Running without a TTY (e.g. from Claude Code) will fail interactively — pass the UDID
directly via `--device` to skip the device picker.

---

### 7. Always build Release, not Debug

Debug builds phone home to Metro at `192.168.0.252:8081`. Without Metro running the app
crashes immediately on launch. Always pass `--configuration Release` for standalone device
installs.

---

### 8. Adding react-native-gesture-handler (v1.1.2, replacing PanResponder swipe)

Installed via `npx expo install react-native-gesture-handler` (picks the SDK-54-compatible
version automatically — landed on `~2.28.0`). Two setup requirements, both easy to miss:

1. **`import 'react-native-gesture-handler';` must be the very first line of `mobile/index.js`** —
   ahead of the existing polyfill chain (`react-native-get-random-values` → `process` →
   `Buffer` → `expo-router/entry`). This is gesture-handler's own documented requirement, not
   optional ordering.
2. **Wrap the root in `<GestureHandlerRootView style={{ flex: 1 }}>`** (`mobile/app/_layout.tsx`,
   inside `RootLayoutInner`, outside `SafeAreaProvider`). Without it gesture recognition silently
   doesn't work — no error, gestures just never fire.

No Podfile patch needed for this one — unlike ExpoFont/fmt, it links cleanly through
`use_expo_modules!` with no `post_install` intervention required. Uses the classic
(non-Reanimated) `Swipeable` component (`import { Swipeable } from 'react-native-gesture-handler'`)
so this does **not** pull in `react-native-reanimated` as a second new dependency.

---

### 9. `expo prebuild` adds a push-notification entitlement that breaks free/automatic signing

Running `npx expo prebuild --platform ios` (e.g. after changing `app.json`'s `icon`, or any other
prebuild-triggering config change) regenerates `ios/Belific/Belific.entitlements` and — because
`expo-notifications` is in the `plugins` array — **adds `aps-environment: development`
unconditionally**, even though Belific only ever uses local notifications (decision 002) and
never requests the remote/push capability. With automatic signing on a free Apple ID ("iOS Team
Provisioning Profile: *"), this entitlement is not supported by the profile and the build fails
with two errors:

```
❌ Provisioning Profile "iOS Team Provisioning Profile: *" does not support the Push
   Notifications capability.
❌ Entitlements file defines the value "aps-environment" which is not registered for
   profile "iOS Team Provisioning Profile: *".
```

**Fix — after every `expo prebuild`, strip the `aps-environment` key from**
**`ios/Belific/Belific.entitlements`:**

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
  </dict>
</plist>
```

`mobile/ios/` is entirely gitignored (`mobile/.gitignore` line 4: `ios/`), so **this fix is not
persisted anywhere** — like the fmt patch and the ExpoFont pod line, it must be reapplied by hand
after every future prebuild, not just the first time. Unlike those two, this isn't a stale patch
being wiped — prebuild actively *adds* this entitlement fresh each time because the
`expo-notifications` plugin has no config option to opt out of it.

---

### 10. Headless `expo run:ios` / `xcodebuild` never fetches new provisioning profiles or capability changes on its own — even on a fully paid account with correctly registered App ID capabilities

Added `aps-environment` back to `Belific.entitlements` to test whether the account was really on
a paid Apple Developer Program tier (see decision-adjacent investigation, July 2026). The build
failed with:

```
❌  Belific/Belific: Provisioning Profile "iOS Team Provisioning Profile: *" does not support the
    Push Notifications capability.
❌  Belific/Belific: Entitlements file defines the value "aps-environment" which is not registered
    for profile "iOS Team Provisioning Profile: *".
```

This looks exactly like a free-tier/account problem, and it is easy to conclude "this Apple ID
isn't paid" from it — **that conclusion was wrong.** The account (team `9PG7ANYKDV`) was
confirmed via developer.apple.com/account as an active paid Individual Program membership the
whole time. Root cause was unrelated to tier:

- `CODE_SIGN_STYLE = Automatic` with no explicit App ID registered yet falls back to Xcode's
  generic **wildcard** profile (`9PG7ANYKDV.*`, named `"iOS Team Provisioning Profile: *"`).
  Apple does not allow wildcard App IDs to carry Push Notifications, Sign in with Apple, iCloud,
  HealthKit, or any other capability-gated entitlement — only an **explicit** App ID (one scoped
  to the exact bundle id, `com.najeca.belific`) can. This restriction applies on every tier, paid
  or free.
- Registering the explicit App ID for `com.najeca.belific` with Push + Sign in with Apple on the
  portal was **not enough by itself**. Re-running `npx expo run:ios --configuration Release`
  straight after that registration reproduced the identical error — headless `xcodebuild`
  (however `expo run:ios` invokes it) does not proactively talk to the portal or refresh cached
  provisioning profiles. It just kept reusing the same stale wildcard profile file already sitting
  in `~/Library/Developer/Xcode/UserData/Provisioning Profiles/` from months earlier.
- The fix: **open `ios/Belific.xcworkspace` in Xcode's GUI at least once** after enabling any new
  capability on the portal. Only the GUI actively syncs accounts and downloads a fresh explicit
  profile. Immediately after doing that once, the next headless `expo run:ios` build picked up a
  brand-new profile (`9PG7ANYKDV.com.najeca.belific`, correctly carrying `aps-environment:
  development`) and the build succeeded with 0 errors.

**Takeaway:** after enabling *any* new capability on the Apple Developer Portal (Push, Sign in
with Apple, etc.), always open the Xcode workspace in the GUI once before assuming a subsequent
headless/CLI build will pick it up. Skipping that step produces a misleading "does not support
capability" error that reads exactly like an account/tier problem but isn't one — don't diagnose
account status from this error alone; check the actual cached profile's entitlements (`security
cms -D -i <profile>.mobileprovision`) and creation date first.

---

## EAS Build Errors

### package-lock.json out of sync

EAS uses `npm ci` (strict mode) which requires `package-lock.json` to exactly match `package.json`. If they are out of sync the build fails with:

```
npm ci can only install packages when your package.json and package-lock.json are in sync
Missing: react-dom@19.2.7 from lock file
Missing: scheduler@0.27.0 from lock file
```

**Fix:** A full clean reinstall is required — `npm install --legacy-peer-deps` alone is not sufficient as it may leave the lock file still missing entries. Delete both `node_modules` and `package-lock.json` entirely, then reinstall from scratch:

```bash
cd /Users/jethro/Developer/belific/mobile
rm -rf node_modules package-lock.json
npm install
# If peer dependency errors occur, fall back to:
# npm install --legacy-peer-deps
```

Verify both packages are present before committing:
```bash
grep -c "react-dom" package-lock.json   # must be > 0
grep -c "scheduler" package-lock.json   # must be > 0
```

Then commit and push:
```bash
git add package-lock.json
git commit -m "Rebuild package-lock.json from scratch for EAS"
git push
```

**EAS also rejects peer dependency conflicts.** `react-dom` must not be in `package.json` for a React Native project — it demands `react@^19.2.7` which conflicts with Expo SDK 54's pinned `react@19.1.0`, and EAS's strict `npm ci` will abort on it. Additionally, `npm install` needs `legacy-peer-deps=true` in `.npmrc` so EAS picks it up without a flag.

**Full fix sequence:**
```bash
cd /Users/jethro/Developer/belific/mobile
npm uninstall react-dom --legacy-peer-deps   # remove conflicting dep
echo "legacy-peer-deps=true" > .npmrc        # persist flag for EAS
rm -rf node_modules package-lock.json
npm install                                  # clean reinstall respects .npmrc
grep "react-dom" package.json               # must return nothing
grep -c "react-dom" package-lock.json       # must be > 0 (transitive only)
grep -c "scheduler" package-lock.json       # must be > 0
git add package.json package-lock.json .npmrc
git commit -m "Remove react-dom, add .npmrc legacy-peer-deps for EAS"
git push
```

**Prevention:** Always run `rm -rf node_modules package-lock.json && npm install` and commit `package-lock.json` after any dependency changes before triggering an EAS build. Do not rely on `npm install --legacy-peer-deps` alone to sync the lock file. Keep `.npmrc` committed so EAS always installs with the same flags.

---

## Correct full build sequence (run every time after prebuild)

```bash
cd /Users/jethro/Developer/belific/mobile

# 1. Install deps (if node_modules missing or after dep changes)
npm install --legacy-peer-deps

# 2. Regenerate native iOS folder
npx expo prebuild --platform ios

# 3. Apply fmt patch + ExpoFont pod line to ios/Podfile (see issues 3 & 4 above)
#    Also verify deployment target is 16.4 in Podfile and xcodeproj (see issue 5)

# 4. Install pods
cd ios && pod install && cd ..

# 5. Build and install on device
npx expo run:ios --device 00008150-000438D40A92401C --configuration Release
```

Device UDID: `00008150-000438D40A92401C` (Jethro's iPhone)

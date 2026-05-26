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

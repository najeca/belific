# Known iOS Build Errors — Belific

---

## 1. react-dom version conflict

**Symptom:** `npm error ERESOLVE` — react-dom demands react@19.2.x, Expo SDK 54 pins react@19.1.0

**Fix:**
```bash
cd mobile/
npm uninstall react-dom
npm install react@19.1.0 --save-exact
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

---

## 2. expo-modules-autolinking missing

**Symptom:** `Cannot find module 'expo-modules-autolinking/exports'` during prebuild

**Cause:** Single-package.json project — autolinking is not hoisted as a transitive dep.

**Fix:**
```bash
npm install expo-modules-autolinking --legacy-peer-deps
```

---

## 3. fmt / Clang 16 consteval error

**Symptom:** Build dies in `Pods/fmt` with:
`call to consteval function '...' is not a constant expression`

**Cause:** `fmt/base.h` redefines `FMT_CONSTEVAL` unconditionally. The `-DFMT_CONSTEVAL=constexpr` compiler flag is overridden by the header. Both patches are needed.

**Fix — add to `post_install` in `ios/Podfile` after `react_native_post_install(...)`:**
```ruby
# Belt: build flag
installer.pods_project.targets.each do |target|
  if target.name == 'fmt'
    target.build_configurations.each do |config|
      flags = config.build_settings['OTHER_CPLUSPLUSFLAGS'] || '$(inherited)'
      config.build_settings['OTHER_CPLUSPLUSFLAGS'] = "#{flags} -DFMT_CONSTEVAL=constexpr"
    end
  end
end

# Braces: header patch (load-bearing fix — chmod required, Pods files are read-only)
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

## 4. ExpoFont not linking (autolinking silently skipped)

**Symptom:** App crashes on launch — `ExpoFontLoader` native module missing. No build error.

**Fix A — `mobile/app.json` plugins (survives future prebuilds):**
```json
"plugins": ["expo-font", "expo-router", ...]
```

**Fix B — `ios/Podfile` inside `target 'Belific' do` after `use_expo_modules!`:**
```ruby
pod 'ExpoFont', :path => '../node_modules/expo-font/ios'
```
Then re-run `pod install`.

---

## 5. iOS deployment target too low

**Symptom:** `compiling for iOS 15.1, but module 'ExpoFont' has a minimum deployment target of iOS 16.4`

**Fix — three places:**

1. `ios/Podfile`:
   ```ruby
   platform :ios, podfile_properties['ios.deploymentTarget'] || '16.4'
   ```

2. `mobile/app.json`:
   ```json
   "ios": { "deploymentTarget": "16.4" }
   ```

3. `ios/Belific.xcodeproj/project.pbxproj` (4 occurrences):
   ```bash
   sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/IPHONEOS_DEPLOYMENT_TARGET = 16.4;/g' \
     ios/Belific.xcodeproj/project.pbxproj
   ```

Also add to `post_install` in Podfile:
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

## 6. --udid flag unknown

**Symptom:** `CommandError: Unknown arguments: --udid`

**Fix:** Use `--device` not `--udid`:
```bash
npx expo run:ios --device 00008150-000438D40A92401C --configuration Release
```

---

## 7. Device locked at launch

**Symptom:** `CommandError: Cannot launch Belific on Jethro's iPhone 7 because the device is locked`

**Fix:** Unlock the device. The app is already installed — open it directly from the home screen, or re-run after unlocking.

---

## 8. ConfigError: package.json not found

**Symptom:** `ConfigError: The expected package.json path: .../ios/package.json does not exist`

**Cause:** Shell is inside `ios/` directory when running `expo` command.

**Fix:** Always run expo commands from `mobile/`:
```bash
cd /Users/jethro/Developer/belific/mobile && npx expo run:ios ...
```

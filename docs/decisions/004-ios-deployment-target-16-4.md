# Decision 004 — iOS Deployment Target 16.4

**Date:** May 2026  
**Status:** Decided

---

## Decision
Set iOS minimum deployment target to 16.4 (not the Expo default of 15.1).

## Reason
`expo-font` 56.x (required by Expo SDK 54) has a minimum deployment target of iOS 16.4.
The Expo-generated Podfile defaults to 15.1, causing a build failure:
*compiling for iOS 15.1, but module 'ExpoFont' has a minimum deployment target of iOS 16.4*

## Where This Is Set — Three Places (all must match)

1. `mobile/ios/Podfile` — platform fallback:
   ```ruby
   platform :ios, podfile_properties['ios.deploymentTarget'] || '16.4'
   ```

2. `mobile/app.json` — survives future prebuilds:
   ```json
   "ios": { "deploymentTarget": "16.4" }
   ```

3. `mobile/ios/Belific.xcodeproj/project.pbxproj` — 4 occurrences:
   ```bash
   sed -i '' 's/IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/IPHONEOS_DEPLOYMENT_TARGET = 16.4;/g' \
     ios/Belific.xcodeproj/project.pbxproj
   ```

Also bump Pods targets in `post_install` (see `docs/IOS_BUILD_NOTES.md`).

## Consequence
Drops support for iOS 15.x. iOS 16+ covers ~95%+ of active devices (2026).

---

## Related Notes
- [[IOS_BUILD_NOTES]]
- [[005-expo-font-manual-pod]]

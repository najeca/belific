# Decision 005 — expo-font Forced as Manual Pod

**Date:** May 2026  
**Status:** Decided

---

## Decision
`expo-font` is manually added to the Podfile rather than relying on autolinking.

## Reason
In this project's Expo setup, autolinking silently skips `expo-font`.
The `ExpoFontLoader` native module is absent from the binary, causing a crash on launch.
There is no error — it simply doesn't link.

## Implementation — Two Places

1. `mobile/ios/Podfile` — inside `target 'Belific' do`, after `use_expo_modules!`:
   ```ruby
   pod 'ExpoFont', :path => '../node_modules/expo-font/ios'
   ```

2. `mobile/app.json` — plugins array (survives future prebuilds):
   ```json
   "plugins": ["expo-font", "expo-router", ...]
   ```

## Consequence
Every time `expo prebuild` regenerates `ios/Podfile`, this line must be re-added manually
(or via the `/workflow/ios-build` skill which applies it automatically).

---

## Related Notes
- [[IOS_BUILD_NOTES]]
- [[004-ios-deployment-target-16-4]]

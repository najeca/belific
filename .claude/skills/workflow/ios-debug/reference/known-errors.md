# Known EAS Build / Launch Errors

## 1. EOVERRIDE
**Symptom:** `npm error EOVERRIDE`
**Cause:** `overrides` block in root `package.json` conflicts with Expo SDK 54.
**Fix:** Remove `overrides` from root `package.json`.

## 2. EUSAGE lockfile
**Symptom:** `npm error EUSAGE` referencing `package-lock.json`
**Fix:** Delete `package-lock.json`, run `npm install` from repo root.

## 3. ExpoHead.podspec nil
**Symptom:** `nil returned from podspec for ExpoHead`
**Fix:** Remove `legacy_shallowReactNativeLinking` from `app.json`; add `searchPaths` to Podfile.

## 4. @expo/metro-runtime not resolved
**Symptom:** Module not found: `@expo/metro-runtime`
**Fix:** Set `disableHierarchicalLookup: false` in `apps/mobile/metro.config.js`.

## 5. .S undefined / launch crash
**Symptom:** App crashes immediately on launch with `.S is not a function` or blank white screen.
**Root cause:** One of (a) wrong polyfill order, (b) `createClient()` at module scope, (c) missing `babel.config.js`.
**Fix:**
1. Confirm `apps/mobile/index.js` line 1: `import 'react-native-get-random-values'`
2. Confirm `apps/mobile/lib/supabase.ts` uses `getSupabase()` factory — no top-level `createClient()`
3. Confirm `apps/mobile/babel.config.js` exists with `babel-preset-expo`

## 6. Runtime 404 — mobile calls a web endpoint that does not exist
**Symptom:** Action on mobile (e.g. download, generate) shows "Request failed with status 404".
**Root cause:** A mobile hook or screen is calling a web API route path that was renamed, never created, or differs from the web client's path.
**How to find it:**
1. Search the mobile lib and screen files for the failing action's `apiFetch` or `fetch` call.
2. Check `apps/web/app/api/` to confirm the exact route path exists.
3. Compare the path in the mobile call with the actual route file path.
**Known instance (resolved):** `use-pdf-share.ts` was calling `/api/generate/pdf` — the correct path is `/api/generate/docx`.
**Fix:** Update the mobile call to match the actual web route path. Update the filename and MIME type if the format changed.

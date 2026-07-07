# Session Summary — Calendar Bug Fixes
**Date:** 2026-06-08  
**Project:** Belific mobile (`/Users/jethro/Developer/belific/mobile`)  
**Status:** Code complete, not yet built/tested on device

---

## What was done this session

### Three calendar bugs fixed — `app/(tabs)/calendar.tsx`

All three bugs are in one file. Zero TypeScript errors confirmed after fixes.

---

#### Bug 1 — Long press to edit does nothing on custom event rows

**Root cause (confirmed):** `openEditModal` set `addModalVisible = true` while `detailVisible` was still `true`. On iOS you cannot present a second `presentationStyle="pageSheet"` modal while one is already presented — the second one silently fails to appear. The `TouchableOpacity` was also using `delayLongPress={500}` inside a `ScrollView`, which is fragile because the scroll pan recogniser can win the gesture competition before 500ms elapses.

**Fix applied:**
- `openEditModal` now sets `pendingEditEvent` (new state) and calls `setDetailVisible(false)`. The edit modal opens inside `onDetailDismiss` *after* the sheet has fully closed — so iOS only ever presents one sheet at a time.
- `EventRowCompact` switched from `TouchableOpacity` to `Pressable` for the long-press case. `Pressable` uses a different gesture recogniser path that coexists more reliably with `ScrollView` on iOS.
- `delayLongPress` reduced from 500 ms → 300 ms.

---

#### Bug 2 — Calendar freezes after viewing any date and closing the detail sheet

**Root cause (confirmed):** `presentationStyle="pageSheet"` on iOS creates a native sheet the user can swipe down to dismiss. When they swipe it down, iOS dismisses the sheet natively but **`onRequestClose` is never called on iOS** — it only fires for Android's hardware back button. `detailVisible` therefore stayed `true` in React state. React Native kept the modal "active" as an invisible UIViewController on top of the screen, intercepting every touch event. The calendar grid and FAB were completely unreachable.

**Fix applied:** Added `onDismiss={onDetailDismiss}` to the detail Modal. `onDismiss` is iOS-specific and fires after *any* dismissal — swipe down, X button, or programmatic `visible=false`. The handler always calls `setDetailVisible(false)` to sync React state with native state, then checks `pendingEditEvent` to chain the edit modal if needed.

---

#### Bug 3 — FAB frozen after viewing a date

**Root cause:** Same invisible modal as Bug 2 blocking all touches.  
**Fix:** Resolves automatically with the `onDismiss` fix above.

---

## Current state of modified files

### `app/(tabs)/calendar.tsx` — MODIFIED this session
Key changes from the pre-session version:
- Added `Pressable` to imports (replacing `TouchableOpacity` for long-press rows)
- Added `pendingEditEvent: CustomEvent | null` state
- `EventRowCompact` uses `Pressable` instead of `TouchableOpacity` when `onLongPress` is provided, `delayLongPress={300}`
- `openEditModal` now sets `pendingEditEvent` and `setDetailVisible(false)` instead of directly opening the edit modal
- Added `onDetailDismiss()` function — the single close hook; handles both swipe-dismiss state sync and pending edit chaining
- Detail `Modal` has `onDismiss={onDetailDismiss}` added

### `app/components/AddEventModal.tsx` — MODIFIED (earlier session, stable)
- Added `Date` field above Start Time using `@react-native-community/datetimepicker` in `'date'` mode
- Display format: `"Mon 9 Jun"` (short weekday, bare day, short month)
- New state: `eventDate: Date` (initialised from `date` prop; updated in edit mode from `editEvent.date`)
- New state: `showDatePicker: boolean`
- `handleSave` uses `formatDateKey(eventDate)` instead of `formatDateKey(date)` — event stored against user-selected date, not always today
- Edit mode: date pre-populated from `parseDateKey(editEvent.date)`
- All three pickers (date, start time, end time) mutually exclusive — opening one closes the others

### `app/(tabs)/today.tsx` — MODIFIED (earlier session, stable)
- Replaced `getWeeklyEventsForDate` template with empty-state fallback now that `WEEKLY_SCHEDULE = {}`
- Empty state in Full Schedule: "No events scheduled" / "Tap + to add your first event"
- Long-press on custom event rows → edit modal (same Pressable pattern as calendar, but `TouchableOpacity` still used — review if same bug surface appears on Today screen)
- Tracks `customEventsList: CustomEvent[]` separately to map `ScheduleEvent.id` back to `CustomEvent` for edit
- `handleEventSaved` clears `editEvent` state on close
- FAB: `accessibilityLabel="Add event"`, `accessibilityRole="button"`

### `lib/data.ts` — MODIFIED (earlier session, stable)
- `WEEKLY_SCHEDULE` replaced with empty object `{}`
- `getWeeklyEventsForDate`: returns `[]` if no template for the day (was crashing)
- `getDayTypeForDate`: returns `nonWorkDay` default if no template

### `lib/storage.ts` — MODIFIED (earlier session, stable)
- `shouldShowStarterRoutine`: new logic — first launch + no custom events → show starter + set flag; subsequent launches no events → empty state; has events → false
- `clearAllData`: now removes `FIRST_LAUNCH` and `NOTIFICATIONS_ENABLED` keys (was missing them)
- Added `deleteCustomEvent(id)` and `updateCustomEvent(updated)`

### `lib/notifications.ts` — MODIFIED (earlier session, stable)
- Removed `STREAK_AT_RISK_ID` notification entirely (was telling users they hadn't logged activity when no activity logging exists)
- Per-notification `try-catch` in `scheduleEventNotifications` — single failure no longer aborts the whole batch

### `lib/ownerSeed.ts` — CREATED this session (earlier in session, stable)
- `seedOwnerSchedule()`: generates 12 weeks of `CustomEvent` objects from Jethro's personal weekly schedule (Mon–Sun, all events in 24-hr HH:MM format)
- Guard: reads `belific_owner_seeded` AsyncStorage key; returns immediately if already seeded (idempotent)
- IDs are deterministic: `seed-{dateKey}-{startHHMM}-{index}` — safe to call multiple times
- Category mapping: `'interview'` → `'project'` (icon `'🎯'`), `'anime'` → `'game'` (icon `'📺'`), all others map 1:1 to `CategoryKey`
- Merges with existing custom events (does not overwrite)

### `app/(tabs)/settings.tsx` — MODIFIED (multiple sessions, stable)
- Permission check on mount: reads actual iOS permission status via `Notifications.getPermissionsAsync()`; if system denied but stored as enabled, corrects stored value and shows "Tap to enable in Settings" link
- `handleNotificationsToggle` wrapped in try-catch with user-facing Alert on error
- Hidden owner section: 7 taps on the "Version" row in About → reveals OWNER section with "Load My Schedule" button
  - `ownerTapCount` ref (not state — no re-render on each tap)
  - `ownerVisible` state
  - `isSeeding` state with `ActivityIndicator` while seeding runs
  - Calls `seedOwnerSchedule()`, shows Alert on completion, hides section
- "Schedule: 2026 weekly planner" row removed from About section
- All interactive controls have `accessibilityLabel` and `accessibilityRole="button"`

### `app/_layout.tsx` — MODIFIED (earlier session, stable)
- Added `ErrorBoundary` class component wrapping `Stack` navigator
- Shows "Something went wrong" + "Try again" button on unhandled render errors
- Split into `RootLayoutInner` (hook-using) + `RootLayout` (class boundary wrapper)

### `ios/.xcode.env.local` — MODIFIED (earlier session, stable)
- Was: `export NODE_BINARY=/opt/homebrew/Cellar/node/25.9.0_2/bin/node` (stale — node 25 uninstalled)
- Now: `export NODE_BINARY=$(command -v node)`

### `ios/Podfile` — MODIFIED (earlier session, stable)
- Removed duplicate `pod 'ExpoFont', :path => '../node_modules/expo-font/ios'` (conflicted with `use_expo_modules!` autolinking)

### `package.json` — MODIFIED (earlier session, stable)
- Removed `react-native-webview` (not used anywhere in source)
- Added `expo-font ~14.0.11` as direct dependency (was only nested inside expo; needed for app.json plugin resolution)

### `lib/types.ts` — MODIFIED (earlier session, stable)
- `WeeklySchedule` changed from `Record<WeekDay, WeeklyDayTemplate>` to `Partial<Record<WeekDay, WeeklyDayTemplate>>` to allow empty `{}`

---

## What still needs to be done

### Pending: Custom notification sound
A custom notification sound has not yet been implemented. The task is:
- Add a custom `.wav` or `.caf` audio file to `ios/Belific/` (and register it in `app.json` under `expo-notifications` plugin config)
- Reference it in `notifications.ts` when scheduling event notifications: `sound: 'custom_sound.wav'` (or `.caf`)
- The `app.json` already has the notifications plugin entry:
  ```json
  ["expo-notifications", {
    "icon": "./assets/icon.png",
    "color": "#D97652",
    "sounds": []   ← ADD sound file path here
  }]
  ```
- After adding, `pod install` and rebuild are required (native change)
- This was noted as pending but not started this session

### Pending: First device test of calendar fixes
The three calendar bug fixes were written but **not yet built and tested on device**. The next step is:
```
npx expo run:ios -d 00008150-000438D40A92401C --configuration Release
```
Verify on device:
1. Long-pressing a custom event in the day detail sheet opens the edit modal (Bug 1)
2. Viewing any date, closing the sheet, then tapping other dates works normally (Bug 2)
3. FAB responds after closing the sheet (Bug 3)

### Pending: Owner seed not yet triggered
`seedOwnerSchedule()` exists but has not been called. To seed Jethro's personal schedule:
1. Build and install the app
2. Open Settings
3. Tap the "Version" row 7 times rapidly
4. Tap "Load My Schedule"
5. Restart the app

---

## Build notes

Last successful build: `npx expo run:ios -d 00008150-000438D40A92401C --configuration Release`  
Result: Build Succeeded, 0 errors, 0 warnings. Installed on device (Jethro's iPhone 7). Launch failed only because device was locked at install time.

The `--udid` flag is **not** recognised in Expo SDK 54. Use `-d` instead.

Do not use `eas build`. Do not run `expo prebuild --clean`.

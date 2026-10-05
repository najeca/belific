# Belific plan review (Opus 5.5, 2026-10-05)

Response to `docs/OPUS_PLAN_REVIEW_BRIEF.md` section 12. This is a planning document only: I wrote no application code, made no commits and ran no EAS command. I wrote this file and nothing else.

**How I verified things.** I read the code in `mobile/lib`, `mobile/app`, the migrations, the Edge Function and the installed packages in `mobile/node_modules`. I checked repository visibility with `gh`. Supabase could not be inspected (see V1). I could not read the prototype artifact from this session (it returned "not found or not shared"), so nothing below is checked against it.

Evidence labels used below: **[code]** means I read it in this repo, **[pkg]** means I read it in an installed package's source, **[live]** means a live check today, **[unverified]** means it rests on my knowledge of a library or service and must be checked before anyone builds on it.

---

## 1. Verdict

**The plan is not sound enough to execute as written.** The product direction (capture, plan, place, with desktop first) is right. The problem is that the plan stacks desktop features on a storage and sync layer that has never been verified end to end, has no live backend today, and loses data in specific ways I can reproduce on paper.

The five things most likely to cause data loss, exposure or rework if left alone, most severe first:

1. **Personal data is one `git add` away from a public repository.** `najeca/belific` is PUBLIC [live: `gh repo view`]. The seed data (`belific_template.json`, `belific_template_v2.json`, `belific_schedule_plan.md`) now sits untracked in **this** working copy at `docs/seed-data/`, and nothing in `.gitignore` covers it [code]. The brief (`OPUS_PLAN_REVIEW_BRIEF.md`) is also untracked and also holds personal context. The brief says the seed data only lives in the old folder. That is wrong.
2. **The backend is down and sync has never been proven.** The Belific project host `uucycebkpgwbktdytxvr.supabase.co` does not resolve, through either the ISP's DNS or Google DNS, while another Supabase host does [live]. The project is still paused, or worse. If 2.1.0 is live on the App Store, every signed in user's sync is failing silently right now, and `privacy.html` still says "None of this data ever leaves your device. There is no account" [code: `privacy.html:60`]. That is a compliance problem, not just stale documentation.
3. **Desktop storage would silently lose writes.** On web, AsyncStorage is `window.localStorage` [pkg: `async-storage/lib/module/AsyncStorage.js:59-65`]. Every `save*` function swallows exceptions [code: `storage.ts:92-98` and the same for every type], so a quota error drops the write without any sign. Recurring events are materialised for 365 days [code: `data.ts:304`], so the dataset grows quickly. There is no export or backup anywhere.
4. **Sync loses data in four concrete ways** (detail in V7): un-completing a routine is undone by any other device; full reconcile overwrites local writes made during the network round trip; remote reads are capped at 1000 rows (the existing owner seed alone writes about 1,800 events); and failed pushes are never retried except through a full sync that has the same gaps.
5. **The core schema is undefined.** Task to Timebox (G12), the meaning of `dueDate` once a kanban moves tasks between days (new, N9), completion pruning (G2) and XP storage (G8) all decide columns. Building panes before these are fixed guarantees rework.

---

## 2. Verified gap register

### 2.1 Items from the brief

| # | Status | Evidence and correction |
|---|---|---|
| G1 Desktop storage and origin | **CONFIRMED, worse than stated** | localStorage on web [pkg]. Writes swallow quota errors [code]. Inside Electron, a packaged `file://` load also breaks the Expo export itself: `output: single` emits absolute `/_expo/static/...` asset paths and expo-router reads `location.pathname`, so `file:///C:/.../index.html` resolves neither assets nor routes [unverified, high confidence]. A custom privileged protocol (`app://belific/`) is needed anyway, which also gives a stable origin. Recommendation: do not keep app data in localStorage on desktop at all (decision 011). |
| G2 Completions pruned to 90 days | **CONFIRMED** | `storage.ts:36`, `:367-368`. Churn also confirmed: `syncRoutineCompletions` re-downloads remote rows that are missing locally (`sync.ts:376`), and the next load prunes them again. Fix: stop pruning completions. The rows are tiny (about 10 routines × 365 = 3,650 a year). |
| G3 One account across Apple and Google | **CONFIRMED as a risk; the fix is different** | Automatic linking only matches verified identical emails, and Apple's relay address never matches Gmail [unverified, Supabase docs]. Local `config.toml` has `enable_manual_linking = false`, but the hosted setting is unknown. **Cheapest path:** Sign in with Apple on desktop through the system browser. The same Apple ID under the same team gives the same `sub`, so it reaches the same Supabase user with zero iOS changes. That needs a Services ID grouped under `com.najeca.belific` and a client secret rotated every 6 months. Google comes later, through `linkIdentity` from a signed in session (decision 012). |
| G4 OAuth inside Electron | **CONFIRMED for Google; REFUTED for the import worry** | Importing `expo-apple-authentication` on web is safe: the module falls back to a stub whose `isAvailableAsync` resolves false, and `signInAsync` throws `UnavailabilityError` [pkg: `ExpoAppleAuthentication.js`, `AppleAuthentication.js:35-38`]. The system browser plus PKCE plus a `belific://` deep link is required for any provider on desktop. `detectSessionInUrl: false` [code: `supabase.ts:27`] is fine, because the desktop flow calls `exchangeCodeForSession` itself. |
| G5 Notifications on desktop | **CONFIRMED** | The web `NotificationScheduler` has no `scheduleNotificationAsync`, so it throws `UnavailabilityError` [pkg: `NotificationScheduler.js`, `scheduleNotificationAsync.js`]. `today.tsx:280` catches it, so the failure is silent. The web permission module calls the browser `Notification.requestPermission`, which does not throw [pkg]. Desktop needs a main process scheduler (decision 017). |
| G6 Supabase health | **CONFIRMED and escalated** | DNS does not resolve [live]. Migrations, the `tasks.notes` column, advisors and logs could not be checked. Supabase's restore window for paused free projects was 90 days at last check [unverified]. Counting from 2026-09-02, that lands around 2026-12-01. Jethro should restore it from the dashboard now and read the deadline there. |
| G7 Sync correctness | **CONFIRMED with additions; one bullet REFUTED** | See V7 below. **Refuted:** "a device offline more than 90 days resurrects deleted rows". The server never prunes tombstones, and a tombstone's `updatedAt` is its deletion time (`storage.ts:139-141`), so it beats a stale device's older live row. Resurrection does happen, but for routine completions, through a different mechanism. |
| G8 XP has no home | **CONFIRMED** | No XP code exists anywhere. Note also that decision 007 says "XP/leveling system: not requested" and `NEXT_PLAN.md` P3 says "no XP". Decision 008 only addresses visuals. **No decision record has ever put XP in scope.** Decision 014 below does that explicitly. |
| G9 Seed schema mismatch | **CONFIRMED** | The seed file is a template with task definitions (label, XP, category) and a per day schedule of timed entries. None of that maps onto the current types. See N11 for the scale problem if it were imported as events. |
| G10 Labels vs Projects vs Categories | **CONFIRMED, plus a contradiction** | The nav spec's Labels delete wording ("their other labels are unaffected") implies several labels per task. `Task.projectKey` is a single value [code: `types.ts`]. Projects also have no delete path [code: `storage.ts` comment on `loadProjects`]. Decision 016 below resolves this. |
| G11 Quest vocabulary | **CONFIRMED** | The data model uses `'morning' \| 'afternoon' \| 'evening'` [code: `types.ts`]. Not rechecked against the prototype (unreadable). |
| G12 Task to Timebox link | **CONFIRMED, highest design risk** | No link field exists. `DESIGN_VISION.md` section 2 says placing a task "is the existing promote to CustomEvent action", which is a copy. Decision 015 below replaces that. |
| G13 Doc contradictions | **CONFIRMED, more than listed** | Also: `NEXT_PLAN.md` still says the multi day kanban is "explicitly not in scope", "Web version" is in the backlog and XP is out of scope. `UBIQUITOUS_LANGUAGE.md` says "5 default event Categories" when there are 14, and defines Plan as a phone segmented control. `migrations.ts` points at a test file that does not exist. |
| G14 Electron vs Tauri | **CONFIRMED: Electron** | Agree. Reasoning in decision 010. Additional web gaps found: see N3 and N4. |
| G15 iOS build gate | **CONFIRMED** | Decision 018. |
| G16 No automated tests | **CONFIRMED, and the brief is wrong** | There is **no** test file in the repository (`git ls-files` shows none). `lib/migrations.test.ts` does not exist, even though `migrations.ts:4` refers to it. Node v26.2.0 is installed, so `node --test` on `.ts` files works without a runner. |
| G17 Marketing and distribution | **CONFIRMED, lower priority** | Not on the daily driver path. Unsigned NSIS is fine for Jethro alone. |
| G18 Small items | **CONFIRMED** | `zustand` has no importer (grep of `app` and `lib` is empty). The `xpGold` arithmetic was not rechecked, and I accept the brief's figures. |

### 2.2 Verification detail for G7 (sync), all [code] in `mobile/lib`

- **V7a: completion un-toggle is undone by another device.** Device B still holds completion X locally. Device A un-completes it and the remote row is deleted. On B's next sync, X is local and not remote, so it is uploaded again (`sync.ts:375`, then the upsert). The same happens on a single device if the delete push failed offline, because `pushRoutineCompletionDelete` has no retry. **Data loss of a user action, and it will corrupt streaks and XP.**
- **V7b: full sync overwrites concurrent local writes.** `syncTable` loads local, awaits the network, then calls `saveLocal(merged)` (`sync.ts:309-346`). Any write made during that await is lost locally. `syncRoutineCompletions` does the same (`:390`). A desktop that polls widens this window a lot. Every `add*`/`update*` in `storage.ts` is also an unguarded read, modify, write, so two concurrent writes to the same key lose one.
- **V7c: 1000 row cap.** `select('*')` has no range (`sync.ts:313`). `config.toml` sets `max_rows = 1000` locally, and the hosted default is the same [unverified for this project]. The owner seed writes about 1,800 events (21 a day × 84 days, `ownerSeed.ts:193`). A second device would silently receive only 1000 of them.
- **V7d: timestamp strings.** The comparison is `localRow.updatedAt >= remoteAsLocal.updatedAt` (`:332`). Local values look like `...123Z`. PostgREST returns `timestamptz` as `...123+00:00` [unverified, high confidence]. When the instant is equal, `'Z' > '+'`, so every locally created row is "newer" and is re-uploaded on every sync, forever. At a sub second boundary the order can also flip. Fix: compare `Date.parse` values.
- **V7e: push errors are not even caught.** supabase-js returns `{ error }` rather than throwing, and `pushRow` never reads it (`:80-89`). An RLS or column error is indistinguishable from success.
- **V7f: one HTTP request per occurrence.** `addCustomEvents` pushes each materialised row on its own (`storage.ts:114`), so a daily series means 365 requests.
- **V7g: no trigger while the window stays visible.** react-native-web's `AppState` follows `document.visibilityState` [pkg: `AppState/index.js:20-58`]. A desktop window left open on a second monitor never changes state, so it never syncs.
- **V7h: the owner seed discards tombstones.** It merges with `loadCustomEvents()`, the visible rows only (`ownerSeed.ts:222`), and saves, which drops every local tombstone before it has synced. It also never pushes the seeded rows.
- **V7i: delete-account is not atomic.** It deletes table by table and returns early on error (`delete-account/index.ts`), while `auth.ts` claims "atomically". It also handles no CORS preflight, so `functions.invoke` from the desktop origin will fail [unverified, high confidence]. The cascade in the migration does cover the tables as a fallback.

### 2.3 Gaps the brief missed

| # | Severity | Gap | Evidence |
|---|---|---|---|
| N1 | Critical | Public repo plus untracked personal files that no ignore rule covers | Verdict item 1 |
| N2 | Critical | The live app's privacy policy contradicts its behaviour while accounts ship | `privacy.html:60` |
| N3 | High | `Alert.alert` is a **no-op** on web | [pkg] `react-native-web/dist/exports/Alert/index.js`. There are 14 call sites. Delete account, clear data and error messages all do nothing on desktop. The rule for desktop: no `Alert`, use inline confirmations. |
| N4 | High | `DateTimePicker` renders **null** on web | [pkg] `datetimepicker/src/datetimepicker.js`. Used in `TaskForm` and `AddEventModal`, so date and time fields simply vanish on desktop. Use a web branch that renders `<input type="date">` / `<input type="time">`. |
| N5 | High | No write serialisation in the storage layer (V7b) | [code] |
| N6 | High | No outbox: a failed push is never retried, only papered over by full sync | [code] |
| N7 | Medium | `__DEV__` dev seed writes 13 fake events into real storage | [code] `devSeed.ts`. Daily driving the desktop dev server would seed Jethro's real data, and the fake rows would sync. Desktop dev mode must use a separate data directory. |
| N8 | Medium | Files under `app/components/` are expo-router routes | [code] They have default exports, so on web `/components/AddEventModal` is a navigable URL. Move them to `mobile/components/` when next touched. |
| N9 | High | `dueDate` is overloaded | The kanban "assigns a task to a day" by writing `dueDate`, which iOS treats as a deadline (overdue first sorting in Top 3). Decision 015 resolves this. |
| N10 | Medium | The `useIsDesktop` width flip | If an Electron window is snapped below 1024px, the layout switches to phone tabs mid session. Set Electron `minWidth: 1024`. |
| N11 | High | The materialised event model does not scale to a real weekly schedule | A realistic weekly schedule has dozens of timed blocks. Materialised as 365 day series, that is thousands of `custom_events` rows a year: thousands of requests on creation, a large local JSON payload, and old app clients capped at 1000 rows. Do not import the weekly schedule as event series (see decision 015 and the seed note in section 4). |
| N12 | Low | `signOut` keeps local data and has no outbox to clear | Acceptable for a single user. Document it. |

---

## 3. Decision records (ready to save under `docs/decisions/`)

Each record follows the house format. I set every status to "Proposed": Jethro confirms each one before it is saved as "Decided".

### 010: Desktop shell is Electron

**Status:** Proposed. **Date:** 2026-10-05.

**Decision.** The Windows app is Electron loading the static `expo export --platform web` output through a privileged custom protocol (`app://belific/`), never `file://` and never a public URL. electron-builder produces an unsigned NSIS installer. No auto update until the installer is signed.

**Reason.** Everything stays in JavaScript (main process storage, notifications, tray, deep links), and Jethro's stack is JavaScript. Tauri's smaller installer does not matter for one user, and its main process work would be in Rust. The custom protocol gives a stable origin and an index.html fallback for expo-router.

**Rules.** `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. A preload exposes only a named allow list (`kv`, `backup`, `app.version`, later `notify` and `auth`). The window has `minWidth: 1024`. Use a single instance lock. Block `will-navigate` and new windows, and open https links in the system browser. Set a CSP through protocol response headers, with `connect-src` limited to the Belific Supabase host. Dev mode loads the Expo dev server **with a separate userData directory** (N7).

**Not in scope.** Code signing, auto update, macOS builds.

### 011: Desktop storage lives in the main process, with backups

**Status:** Proposed.

**Decision.** A new `mobile/lib/kv.ts` exposes `getItem`, `setItem`, `removeItem` and `multiRemove`. When `globalThis.belificDesktop` exists it calls the preload IPC, and otherwise it calls AsyncStorage, so iOS behaviour is unchanged. `storage.ts`, `ownerSeed.ts`, `devSeed.ts` and the Supabase auth storage all go through it. The Electron main process stores one file per key in `userData/data/`, written atomically (write a temp file, then rename), with writes queued per key. Keys must match `^[A-Za-z0-9_.-]{1,128}$`.

**Safety.** On launch and every 24 hours, copy `data/` to `backups/YYYY-MM-DD/` and keep 14 of them. The File menu gets "Export data…" (one JSON file of all keys plus the app version) and "Open backups folder". Import comes in a later checkpoint, and until then restoring means copying a backup folder back while the app is closed.

**Also:** write failures stop being silent on desktop. The main process logs them to `userData/logs/`, and the renderer shows a persistent error line.

**Reason.** localStorage is origin bound, quota limited, and fails silently in this codebase. A file store survives origin changes, is inspectable, and can be backed up.

### 012: Account and identity strategy

**Status:** Proposed.

**Decision.** Desktop works fully signed out (local first, as on iOS). The first desktop sign in provider is **Sign in with Apple through the system browser** (Supabase `signInWithOAuth`, PKCE, redirect to `belific://auth-callback`, handled by `app.setAsDefaultProtocolClient` and the `second-instance` event). Because the user id is the same Apple `sub`, desktop reaches the same Supabase user as the iPhone, with no iOS release needed. Google is deferred. When it is added, it is linked from an already signed in session with `linkIdentity`, which needs manual linking enabled in the dashboard. A fresh Google sign in is never offered to a user who already has an Apple account.

**Setup Jethro must do.** Create an Apple Services ID grouped with the primary App ID `com.najeca.belific`, add the Supabase callback URL to it, generate the client secret, and add the Services ID to the Supabase Apple provider client id list next to the bundle id. Put a calendar reminder for secret rotation 5 months out. Add `belific://auth-callback` to the redirect allow list.

**Verify before building** [unverified]: that a Services ID under the same team returns the same `sub` as the native flow. Test with a throwaway Apple ID first.

### 013: Sync model

**Status:** Proposed. Applies to iOS and desktop (it is shared code).

1. **Outbox.** Replace fire and forget `pushRow` with a persisted outbox (one kv key). Every local mutation appends `{table, op, key, row}`. The outbox drains in order, retries on the next trigger, and checks `error` on every response (V7e). Batch upserts in groups of up to 500 rows (fixes V7f).
2. **Write lock.** One async mutex around every storage read, modify, write and around the merge step of a sync. The merge re-reads local state inside the lock (fixes V7b).
3. **Pull.** Add a server side column `server_updated_at timestamptz not null default now()`, maintained by a trigger on insert and update. Pull with `.gt('server_updated_at', cursor).order('server_updated_at').range()` in pages of 1000, and store the cursor per table only after the page has been saved. Pulling by the server clock means client clock skew cannot skip rows. Conflict resolution stays last write wins on the client `updatedAt`, compared with `Date.parse` (V7d). If a device's clock is more than 5 minutes from the server `Date` header, show it in the sync status.
4. **Routine completions** keep hard deletes, because 2.1.0 clients read them. The fix for V7a: store `lastFullSyncAt`. A completion that exists locally but not remotely, with `completedAt` before `lastFullSyncAt`, was deleted elsewhere, so drop it locally instead of uploading it. Pending deletes go through the outbox.
5. **Triggers.** App start, sign in, the `visibilitychange` foreground event, the Electron window `focus` event (sent over IPC), and every 120 seconds while the window is visible. No Realtime for now: polling is simpler, and one user does not need second level latency.
6. **Visibility.** A sync status object `{lastSuccessAt, lastError, pending}`. On desktop it is shown as one quiet line in the Profile dropdown, and in red only when the last error is less than 24 hours old. On iOS it is shown in Settings. This replaces `NEXT_PLAN.md` P1.2's "silent is correct". Silent is right for transient failures but wrong for a daily driver that has stopped syncing.
7. **Accepted limits** (write them down): row level last write wins with no field merge, and tombstones kept on the server forever.

### 014: XP and level model

**Status:** Proposed. **Build only after the daily driver checkpoints.** The record exists now because it decides G2.

- **What earns XP:** a routine completion (the whole routine only, never a single step, consistent with decision 007's "done or not") and a task completion. Events never earn XP.
- **Routine base XP:** a routine has `xpBase`. For a routine with steps it defaults to the sum of per step values the user typed. This keeps the seed's numbers without rewarding partial progress.
- **Task XP:** 10 flat, or 20 for high priority. Optional duration scaling is deferred.
- **Multiplier:** per routine, `1 + 0.01 × streak`, **capped at ×1.50** (proposed default), and always shown as the number.
- **Storage:** an append only synced ledger `xp_events` with a **deterministic id** `routine:{routineId}:{date}` or `task:{taskId}:{completedAt date}`. Two devices awarding the same completion therefore upsert one row. Un-completing tombstones the row. The ledger stores `amount`, so a later formula change never rewrites history. Lifetime XP is the sum of live ledger rows. A reconcile pass on any new client creates missing rows for completions logged by 2.1.0 clients.
- **Levels:** XP to go from level n to n+1 is `500 × n`, so the cumulative total for level n is `250 × n × (n − 1)`. At about 2,000 XP a week, level 10 arrives in about 11 weeks and level 20 in about a year.
- **Retention:** completions are no longer pruned (G2). Streaks and longest streak are derived from completions. The XP history feed reads the ledger.

### 015: Task to Timebox link and the meaning of a task's day

**Status:** Proposed. **This is the most important record here.**

**Decision.** A Task is placed on Timebox by giving it a time, not by copying it into an event.

- `dueDate` is redefined as **the day the task is planned for** ("Day" in the UI), not a deadline. The kanban moves tasks by changing it. Existing iOS behaviour (Top 3 sorts past days first) still makes sense under that reading. Hard deadlines are not modelled now, and if they are ever needed they become a separate `deadline` field.
- New `Task.startTime?: 'HH:mm'` and `Task.durationMinutes?: number`. A task appears on Timebox when it has both a `dueDate` and a `startTime`. Block height comes from `durationMinutes`, defaulting to 30. Duration chips 15m, 30m, 1h and 2h+ write 15, 30, 60 and 120, and resizing a block writes any value in 15 minute steps.
- Dragging a block to another day changes `dueDate`, so the kanban follows automatically. Unplacing clears `startTime`. Completing the task on any surface completes the one row. Nothing is double counted, because there is only one row.
- **CustomEvents** stay as they are, for fixed commitments: work shifts, appointments, the weekly schedule. Timebox renders both events and placed tasks. Promote from Brain Dump to event keeps its copy semantics.
- The 2.1.0 iOS app ignores the new columns, and its partial upserts preserve them on the server (verify this once, see section 4).

**Rejected:** a `taskId` link on CustomEvent. It means two rows, cascade rules in app code, sync conflicts across two rows, and double counting.

### 016: Labels

**Status:** Proposed.

**Decision.** A Label is a Project plus a colour. The table stays `projects` and the type stays `Project` in code. "Label" is the UI word, and the glossary records the mapping. A task has **one** label, and the nav spec wording about "other labels" is removed. New `projects.color` text holds a **palette key**, not a hex value: six keys defined once in `mobile/lib/theme.ts` as `LABEL_SWATCHES`. Delete is a tombstone. Tasks keep the dangling `projectKey`, and every reader treats an unknown key as "no label". A placed task's Timebox block uses its label colour, or a neutral border when it has none. Events keep category colours. Custom Categories remain event only and are not merged with Labels.

### 017: Notification strategy on desktop

**Status:** Proposed. Decision 002 (local only) still holds.

**Decision.** The Electron main process owns scheduling. The renderer sends the next 48 hours of notifiable items over IPC whenever data changes. The main process keeps timers and fires `new Notification()`. Notifiable items: CustomEvent starts (as on iOS) and placed tasks at `startTime` (both user set commitments). One toggle each. The app keeps running in the tray when the window is closed, if Jethro agrees, so timers survive. Start with Windows is an opt-in toggle, off by default. Call `app.setAppUserModelId` so toasts appear [unverified: dev mode toast behaviour].

**Dropped:** the "weekly summary email" toggle in the desktop Settings spec. It contradicts the removal of the weekly summary, and no email infrastructure exists. "Routine check-ins" becomes the quiet badge from addendum 3, not a notification.

### 018: iOS build gate while developing on Windows

**Status:** Proposed, pending Jethro's answer on the Mac Mini.

**Decision.** Every commit that touches `mobile/` must pass, on Windows:
1. `npx tsc --noEmit`
2. `node --test mobile/lib/**/*.test.ts`
3. `npx expo export --platform ios --output-dir %TEMP%/ios-check`, a JavaScript bundle check that catches web only imports leaking into native [unverified that it runs cleanly on Windows; check it once]

A GitHub Actions workflow runs the same three checks on push. It is free for public repositories. A real device Release build happens in batches, before any TestFlight or EAS build, on the Mac Mini if it is kept. "Done" for shared code means gates 1 to 3 pass. "Shipped to iOS" means a device test as well.

---

## 4. Schema and migration plan

**Compatibility rules while 2.1.0 is in the wild** (it pushes partial rows and pulls with `select('*')`):

1. Additive nullable columns only. Never rename or drop a column, and never add `NOT NULL` without a default.
2. Never write a new value into an existing enum column that 2.1.0 reads (`tasks.priority`, `routines.time_of_day`, `custom_events.recurrence`).
3. `routine_completions` keeps its current semantics (presence means done, hard delete).
4. After the first migration, verify once with a test row that a 2.1.0 style upsert which omits the new columns leaves them intact. supabase-js upsert sends `Prefer: resolution=merge-duplicates`, which should only update the supplied columns [unverified].
5. The server is migrated **before** any client writes the new fields. Client mappers carry the new fields **before** desktop sync is switched on, otherwise `fromRemote` drops them.

**Order:**

| Step | Migration | Contents | Client change in the same checkpoint |
|---|---|---|---|
| 0 | none | Jethro restores the project. Check that remote migrations match the two local files and that `tasks.notes` exists. Run the security and performance advisors. | none |
| 1 | `..._sync_hardening.sql` | Add `server_updated_at timestamptz not null default now()` plus a `before insert or update` trigger setting it to `now()` on the six timestamped tables **and** `routine_completions`. Add index `(user_id, server_updated_at)` on each. | Decision 013 items 1 to 6, all in `sync.ts`. Edge Function: add CORS (an `OPTIONS` response plus `Access-Control-Allow-Origin` on every response) and keep the table list in one constant. |
| 2 | `..._task_pipeline.sql` | `tasks`: `start_time text check (start_time ~ '^[0-2][0-9]:[0-5][0-9]$')`, `duration_minutes int check (duration_minutes between 5 and 1440)`. `projects`: `color text`. | `Task` and `Project` types, `taskToRemote`/`taskFromRemote`, `projectToRemote`/`projectFromRemote`. |
| 3 | `..._routine_schedule.sql` | `routines`: `recurrence text`, `recurrence_days text[]`, `active_during_vacation boolean`, `xp_base int`. New `user_settings (user_id uuid primary key references auth.users on delete cascade, vacation_start text, vacation_end text, updated_at timestamptz not null, server_updated_at ...)`. | Routine mappers, plus a settings sync that is a single row with last write wins. |
| 4 | `..._routine_steps.sql` | `routine_steps (user_id, id text, routine_id text, title text, order_index int, created_at, updated_at, deleted_at, server_updated_at, pk (user_id, id))` and `routine_step_checks (user_id, step_id text, date text, routine_id text, checked_at timestamptz, updated_at, deleted_at, server_updated_at, pk (user_id, step_id, date))`. These are new tables, so they use soft delete. | The spec never said where "step 2 is checked today" lives. This table is that answer. |
| 5 | `..._xp_ledger.sql` | `xp_events (user_id, id text, source_type text check in ('routine','task'), source_id text, date text, base int, multiplier numeric(4,2), amount int, created_at, updated_at, deleted_at, server_updated_at, pk (user_id, id))` | The ledger and its reconcile pass. |

Every new table gets RLS enabled and the same `owner_full_access` policy, is added to the Edge Function's table list in the same commit, and gets cascade on `user_id`. Recurring Tasks get a later additive migration (`tasks.recurrence`, `tasks.recurrence_days`), with regeneration on completion using a deterministic next id `{taskId}:{nextDate}` so that two devices completing the same task cannot create duplicates.

**Seed data import (G9).** Do not import the weekly schedule as materialised event series (N11). Map it this way: morning, afternoon and evening routines become Routines with steps (variants that differ by day of the week become separate routines with complementary `recurrence_days`). Fixed commitments become CustomEvent series. Recurring goals and projects become Tasks placed on Timebox week by week through the kanban. Unstructured open time slots are not imported. Weekly targets and rules are "not now". Run the import as a local script, never committed, that writes through the app's kv so it syncs normally.

---

## 5. Re-ordered build plan

The checkpoints are sized for one session each. Each one ends with something working. Each one passes the decision 018 gates. Nothing else starts while one is open.

**Must not cut:** the file store and backups (checkpoint 1), sync hardening and sync status **before** desktop sign in (checkpoint 5), and the ignore rules (checkpoint 0).

**Cut or defer to reach the daily driver:** XP, levels, Progress, Recurring quests form, vacation, the badge, the Labels page (use existing projects without colour until checkpoint 8), the Settings page, Google sign in, Timebox week mode, installer and auto update, marketing site, mobile Plan view, recurring Tasks, Routine steps.

| CP | Scope | Main files | Acceptance and tests | Stop condition |
|---|---|---|---|---|
| **0** (15 min, docs only) | Ignore rules for `docs/seed-data/` and the brief. Add `.gitattributes` and renormalise in its own commit. Apply the doc patches from section 6. Jethro restores Supabase (dashboard). | `.gitignore`, `.gitattributes`, docs | `git status` shows the seed folder as ignored. Only line ending noise disappears. | Docs agree with each other and with this review. |
| **1** | Electron shell over the static export through `app://`, the `kv.ts` indirection and main process file store, backups and export, plus a **real Brain Dump pane** (capture, inline edit, hover delete with an inline confirm). The other two panes stay placeholders. | `desktop/*` (new), `mobile/lib/kv.ts` (new), `storage.ts`, `supabase.ts`, `ownerSeed.ts`, `devSeed.ts`, `_layout.tsx` (skip `requestPermissions` on web), `components/desktop/BrainDumpPane.tsx` | Jethro captures items, closes the app, rebuilds the export, reopens, and the items are still there. A backup folder exists. Export writes a JSON file. Unit tests for the main process store (atomic write, key validation). The three gates pass. | **Jethro is capturing into a real desktop app.** |
| **2** | Forward only week board: a pinned Unscheduled column plus the days of the displayed week (Monday based; the current week shows today to Sunday, future weeks Monday to Sunday; no past days or weeks), week arrows, "This week" and a jump date input. **Tasks are created only in the Brain Dump pane** ("Make task" or "New task"), never on the board; the form has name, duration chips, priority, label, notes, Day (min today) and, from 2.6.0, Repeat (recurrence set there only). "Move to day" menu (Unscheduled, Today, Tomorrow, a date). Complete a task. Local only. | `KanbanPane.tsx`, `TaskModal.tsx` (desktop), `BrainDumpPane.tsx`, `types.ts` (`durationMinutes`, `startTime`, `recurrence`, `recurrenceDays`), `lib/kanban.ts`, `lib/recurrence.ts` | Create a task from Brain Dump, plan it on the board, complete a repeating task and see the next one. Tests for week maths, column bucketing and next occurrence. | Jethro plans his week on desktop. |
| **3** | Timebox day pane: CustomEvents plus placed tasks, previous and next day, a date dropdown, and a "Schedule at…" action on a task (time input) without drag. Clicking a block opens edit inline. | `TimeboxPane.tsx`, layout helper | Tests for block layout (overlap columns, top and height maths). | Jethro runs one real day from the Timebox. |
| **4** | Drag: starts with a 30 minute spike on whether RNW Views accept pointer events with dnd-kit, or whether a hand written pointer hook is needed. Then kanban to kanban, kanban to Timebox hour, move and resize blocks in 15 minute snaps. The wheel to horizontal hook. Also: drag a Brain Dump item onto a kanban day or the Unscheduled column (the same function as Make task, so it opens the form with the Day pre-filled and removes the item on save) and, optionally, onto a Timebox hour. Decide how to change week while dragging (for example, hover the week arrows). | `useDrag*.ts`, the panes | Snap and drop target maths tested as pure functions. | Drag works in all three directions. |
| **5** | Sync hardening (decision 013) plus migrations 1 and 2, the Edge Function's CORS and table list, sync status UI, and stopping completion pruning. The P1.1 scenarios are run and **recorded**, against the iOS 2.1.0 build as well. **Also map `recurrence` and `recurrenceDays` with the other Task fields, and make the iOS app complete tasks through `lib/taskActions.ts` `setTaskCompleted`, otherwise a recurring task completed on the phone never creates its next occurrence.** | `sync.ts`, `storage.ts`, migrations, the function | Tests for the merge, the completion "deleted elsewhere" rule, timestamp comparison and outbox ordering. The live scenarios are recorded in `docs/sessions/`. | Sync is proven, its state is visible, and no known data loss path remains. |
| **6** | Desktop sign in with Apple through the system browser (decision 012). | `desktop/main` deep link, `lib/auth.ts` web branch | The same account shows the iPhone's data on desktop. | Phone and desktop share one dataset. |
| **7** | Notifications (decision 017), tray, and an opt-in start with Windows. Unsigned NSIS installer. | `desktop/*` | An event start toast fires with the window closed to tray. | Installed app, daily driver complete. |
| **8 onwards** | Labels page and colour. Routines in the Quests panel. Routine recurrence and vacation (migration 3). Steps (migration 4). Streaks. XP (migration 5). Progress. Settings page. Recurring Tasks. Google linking. Then an iOS release catching up the shared features. | | | |

---

## 6. Doc patch list

| File | Change |
|---|---|
| `docs/CLAUDE.md` | "What Belific is": delete "with a Pomodoro timer", and add iOS plus a Windows desktop (Electron) from one codebase. Mobile stack: replace "5 tabs: Today, Inbox, Calendar, Focus, Settings" with "3 tabs: Today, Brain Dump (`inbox.tsx`), Calendar; Settings and Tasks are pushed screens". Decision 2: add "desktop schedules through the Electron main process (017)". **Decision 3: replace** with "Optional accounts: Sign in with Apple plus Supabase sync (006); local only use stays fully supported." Decision 5: scope it to mobile. Add decision 9 "Desktop rules: no `Alert.alert` and no `DateTimePicker` on web paths (react-native-web no-ops them); no app data in localStorage (011)." Session protocol: read `docs/CURRENT_TRUTH.md` instead of `current-state-audit.md`. Remove the `features/webview` paragraph once that skill is deleted. Add: "The repository is public. Never commit `docs/seed-data/`, `.env`, or personal schedules." |
| `docs/architecture.md` | Replace the header with a pointer to `CURRENT_TRUTH.md`, and mark the body "historical, 2026-07-30". |
| `docs/current-state-audit.md` | The same: a header pointer, marked as superseded. |
| `docs/DESIGN_VISION.md` | Section 2: replace "Place… is the existing promote to CustomEvent action" with decision 015, and redefine `dueDate` as Day. Section 5.4: replace with "Superseded by addendum 3: quiet badge, no modal." Section 8: Plan view becomes "desktop kanban decided (009); mobile Plan deferred". The dev machine note points at 018. |
| `docs/ROUTINE_GAMIFICATION_SPEC.md` | Section 3: strike the trigger, settings toggle and frequency guard, and keep only the content block. Section 0: add the `routine_step_checks` table. Section 2: `VacationRange` syncs in `user_settings`. Build order: drop step 3's modal. Add an XP section pointing at 014. Replace the "no flame, muted only" visual lines with a pointer to 008. |
| `docs/DESKTOP_HOME_NAV_SPEC.md` | Remove "No desktop codebase exists yet". Labels: one label per task, remove the "other labels" wording, palette keys in `theme.ts`. Settings notifications: event starts, task starts, start with Windows. **Delete the weekly summary email.** Quest panel: hide the Level and XP module until 014 ships. Recurring quests means Routines with recurrence (G11), and the add form is RoutineForm. Morning and Night versus Afternoon and Evening: aligned to the data model unless Jethro says otherwise (question 6). |
| `docs/TIMEBOX_AND_NAV_SPEC.md` | Mark items 1 and 2 done (2.1.0). Timebox renders events **and placed tasks** (015). The desktop drag mechanism is not `react-native-gesture-handler` (checkpoint 4 spike). |
| `docs/NEXT_PLAN.md` | Replace with a pointer to this review's section 5. Keep the six constraints, with rule 6 amended by 018. |
| `docs/UBIQUITOUS_LANGUAGE.md` | Add **Label** (UI word for `Project`, one per task, with a colour), **Day** (a task's `dueDate`, the planned day), **Placed task** (a task with `startTime`), **Quest** (UI word for any Routine, shown in the Quests panel), **XP event**, **Level**, **Desktop Home**, **Kanban** (the desktop Plan). Fix "5 default event Categories" to 14. Plan: "desktop kanban; the mobile Plan view is deferred". Promote to Task and to Custom Event are unchanged. |
| `privacy.html` | Rewrite (the P2.1 content in `NEXT_PLAN.md` is right) plus: desktop stores data locally in the app's data folder with local backups, the optional account syncs to Supabase (EU or US region: check in the dashboard), no analytics, no telemetry, and deletion. Jethro reviews it, then updates the App Store privacy answers to match. |
| `mobile/lib/migrations.ts:4` | The comment points at a test file that does not exist. Fix it when checkpoint 1 adds tests. |

**Proposed `.gitattributes`:**

```
* text=auto eol=lf
*.bat text eol=crlf
*.cmd text eol=crlf
*.ps1 text eol=crlf
*.png binary
*.jpg binary
*.jpeg binary
*.ico binary
*.icns binary
*.wav binary
*.ttf binary
*.otf binary
```

Then run `git add --renormalize .` in its own commit. The current `M` entries are pure CRLF noise (`git diff --ignore-cr-at-eol` is empty), so they disappear.

**Proposed `.gitignore` additions:** `docs/seed-data/`, `docs/OPUS_PLAN_REVIEW_BRIEF.md`, `desktop/node_modules/`, `desktop/dist/`, `desktop/out/`.

**Proposed `docs/CURRENT_TRUTH.md`** (one page, replaces the audit in the session protocol):

```markdown
# Belific: current truth (update at every session close)

Last verified: 2026-10-05 against commit 9d316f7.

## Shipped
- iOS 2.1.0: Today, Brain Dump, Calendar tabs; Tasks and Settings pushed screens;
  local notifications; optional Sign in with Apple plus Supabase sync (7 tables).
- Desktop: Expo web shell with placeholder panes only. No Electron yet.

## Backend
- Supabase ref uucycebkpgwbktdytxvr. Status: PAUSED (host does not resolve, 2026-10-05).
- Migrations: 2 local files. Remote state unverified.
- Sync: never verified end to end. Known data loss paths listed in OPUS_PLAN_REVIEW.md V7.

## Not built
Timebox, kanban, task duration and start time, labels colour, routine steps,
streaks, vacation, XP, Progress, desktop Settings, Google sign in, notifications on desktop.

## Active decisions
001 superseded. 002, 004, 005, 006, 007 (visuals by 008), 008, 009 active.
003 partly superseded by 006. 010 to 018 proposed (see OPUS_PLAN_REVIEW.md).

## Build plan
OPUS_PLAN_REVIEW.md section 5. Current checkpoint: 0.

## Hazards
- Repository is PUBLIC. Never commit docs/seed-data or personal schedules.
- react-native-web: Alert.alert and DateTimePicker do nothing on desktop.
- Never run eas build, submit or update without Jethro saying "ready for EAS build".
```

---

## 7. Open questions for Jethro

Each has a default that applies if it goes unanswered, so none of them blocks checkpoints 0 to 4.

1. **Restore the Supabase project now** and note the restore deadline shown in the dashboard. *(This is an action, not a question, and it blocks checkpoint 5 onwards.)*
2. **Is 2.1.0 live on the App Store with users other than you?** Default: assume yes, so the privacy policy rewrite moves into checkpoint 0.
3. **Mac Mini: keep it for iOS builds?** Default: keep it until the CI in 018 runs green for a month.
4. **A task's date means "the day I plan to do it", not a deadline (decision 015).** Default: yes.
5. **One label per task (decision 016).** Default: yes.
6. **Routine groups on desktop: Morning, Afternoon, Evening (as stored), or rename Evening to Night in the UI?** Default: keep Evening.
7. **Tray and start with Windows.** Default: close to tray, start with Windows off.
8. **XP:** routines plus tasks, ×1.50 multiplier cap, level curve `500 × n` (decision 014). Default: as proposed, built at checkpoint 8 or later.

The brief's question 1 (is the repository public) is answered: yes. Its questions about the Plan view on mobile, weekly targets, the desktop account requirement and Recurring quests are settled by defaults in sections 3 to 5 (deferred, not now, not required, and Routine with recurrence, respectively).

---

## 8. Sonnet execution prompt for checkpoint 1

```text
You are Claude Code working in A:\coding_projects\developer\belific-fresh on branch v2-redesign.

READ FIRST, in this order, before touching anything:
1. docs/CLAUDE.md, especially "Desktop app vs. marketing website".
2. docs/OPUS_PLAN_REVIEW.md: sections 1, 3 (decisions 010, 011, 013 item 2) and 5 (checkpoints 0 and 1).
3. mobile/lib/storage.ts, mobile/lib/supabase.ts, mobile/lib/ownerSeed.ts, mobile/lib/devSeed.ts,
   mobile/app/_layout.tsx, mobile/app/index.tsx, mobile/app/components/desktop/DesktopHome.tsx,
   mobile/app/(tabs)/inbox.tsx (for Brain Dump behaviour to match).
Then summarise your plan in under 15 lines and wait for Jethro's go-ahead.

GOAL: Jethro can launch a real Windows desktop window, capture Brain Dump items into it,
quit, relaunch, and find them still there, with automatic backups. Nothing else.

SCOPE, as separate commits in this order:
A. .gitignore: add docs/seed-data/, docs/OPUS_PLAN_REVIEW_BRIEF.md, desktop/node_modules/, desktop/dist/, desktop/out/.
   No version bump for this commit.
B. mobile/lib/kv.ts: getItem, setItem, removeItem, multiRemove. If globalThis.belificDesktop?.kv exists,
   use it; otherwise use AsyncStorage. Route storage.ts, ownerSeed.ts, devSeed.ts and the Supabase
   auth storage option through it. No behaviour change on iOS. In _layout.tsx, skip requestPermissions()
   when Platform.OS === 'web'. Bump mobile/app.json to 2.1.1 and add a CHANGELOG entry in this commit.
C. desktop/ (new top-level folder, its own package.json, electron and electron-builder as exact-pinned devDependencies):
   - main process: register privileged scheme "app" (standard, secure, supportFetchAPI) before ready;
     serve mobile/dist through protocol.handle with a path traversal guard and an index.html fallback for
     unknown paths; load app://belific/.
   - BrowserWindow: minWidth 1024, contextIsolation true, sandbox true, nodeIntegration false,
     preload script only. Single instance lock. Block will-navigate and window.open; open https links
     with shell.openExternal. CSP in protocol response headers: default-src 'self';
     style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self' https://uucycebkpgwbktdytxvr.supabase.co
   - KV store in main: one file per key under app.getPath('userData')/data/, key must match
     ^[A-Za-z0-9_.-]{1,128}$, writes are temp file plus rename, queued per key. Failures are logged to
     userData/logs/ and returned as errors (never swallowed in main).
   - preload: contextBridge exposes belificDesktop = { kv: {getItem,setItem,removeItem,multiRemove}, version }.
     Nothing else.
   - Backups: on launch and every 24h, copy data/ to backups/YYYY-MM-DD/, keep the newest 14.
     Application menu File > "Export data…" (save dialog, one JSON of all keys plus app version) and
     File > "Open backups folder".
   - Dev mode (npm run desktop:dev): loads http://localhost:8081 and MUST call
     app.setPath('userData', <default userData> + '-dev') before ready, so dev never touches real data.
   - Scripts: "desktop" = run `npx expo export --platform web` in ../mobile, then launch Electron on the
     export. "desktop:dev" as above. Add a desktop/README.md with exactly these two commands.
   - Unit tests with node --test for key validation and atomic write (desktop/test/*.test.js).
D. Brain Dump pane: replace the left placeholder in DesktopHome with mobile/app/components/desktop/BrainDumpPane.tsx
   using the existing storage.ts functions (loadBrainDumpItems, addBrainDumpItem, updateBrainDumpItem,
   deleteBrainDumpItem). Pinned input at the top (Enter adds). Flat list with hairline dividers. Click a title
   to edit inline (Enter saves, Escape cancels). Hover shows a delete icon; delete asks inline
   ("Delete? Yes / No" in the row). Quiet Function tokens from lib/theme.ts only. No shadows.
   Bump app.json to 2.2.0 and add a CHANGELOG entry in this commit.

CONSTRAINTS:
- Do not use Alert.alert or DateTimePicker anywhere on desktop paths (they are no-ops on react-native-web).
- Do not use localStorage for app data. Do not add sync, sign in, notifications, kanban or Timebox code.
- Do not change sync.ts. Do not touch the legacy PWA at the repo root. Do not touch Landis or its Supabase.
- Never run eas build, eas submit or eas update. Do not deploy the Edge Function. Make no Supabase calls.
- The web export is an internal build step. Never host it, never create a public URL, never add GitHub Pages config.
- Ask before any global npm install. Install only inside desktop/.
- Toyota Yaris: no abstractions beyond what is listed.
- UK spelling in docs and UI copy.

GATES, all must pass before each commit that touches mobile/:
  cd mobile && npx tsc --noEmit
  cd mobile && npx expo export --platform ios --output-dir "%TEMP%\ios-check"   (JS bundle check only)
  cd desktop && node --test
If the iOS bundle check fails for an environment reason, stop and report it. Do not work around it.

COMMIT RULES: stage files by explicit path only. Never git add -A, git add ., or git commit -a.
Never commit docs/seed-data/, any .env, mobile/dist/, or docs/OPUS_PLAN_REVIEW_BRIEF.md.
Run git status before every commit and show it. Do not push unless Jethro asks.

STOP CONDITION: stop after commit D, when Jethro has run `npm run desktop`, added items, quit,
run it again and seen the items, and a backup folder exists. Then write a short docs/sessions/ entry
of what was observed and stop. If the session runs long, stop cleanly after any completed commit (A to D)
with the app still launching. Never leave a half-finished commit.
```

---

*Optional next step: publish this review as a private page for easier reading. Not done, since it was not asked for.*

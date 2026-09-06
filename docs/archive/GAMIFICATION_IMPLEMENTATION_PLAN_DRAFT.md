# Belific Routines Gamification — Codebase Implementation Plan

*Companion to `belific_gamification_design.md`. This one is specific to the actual repo at `~/Developer/belific/mobile` and assumes the decision to override the existing no-streak-guilt rule, made 2026-08-21.*

## 0. What this reverses, and what still stands

Three things from the locked design-identity rules are being explicitly overridden: real "streak" terminology is back in (the ubiquitous-language ban on the word is lifted), visible loss-framing is allowed when a streak breaks (Duolingo-style "you lost your streak" messaging), and the "Streak at Risk"-style notification concept returns — but smarter than its previous incarnation (per-routine, only fires if genuinely at risk, uses the real streak count, not an unconditional 8pm blast to everyone regardless of state).

Two things from the research doc are *not* being overridden and should still hold: no variable/random-reward mechanics anywhere (XP stays deterministic and transparent), and the "reversible/pausable, never mandatory" principle stays as a good default even though the loss-framing ban is lifted — a Settings toggle to turn off the auto-popup and/or the check-in notifications is cheap to build and costs nothing to keep.

## 1. Data model — `mobile/lib/types.ts`

No new fields are needed on `Routine` or `RoutineCompletion` for the streak/XP math itself — see §2, streak and XP are derived, not stored, which keeps this consistent with the existing "'done today' is a lookup, nothing more" philosophy already in the `RoutineCompletion` comment. Two additions are needed:

```typescript
// Add to Routine — optional per-routine override of when its check-in
// notification fires. Absent means "use the timeOfDay bucket's default
// hour" (see TIME_OF_DAY_DEFAULT_HOUR in notifications.ts), so existing
// routines and the RoutineForm need no changes to keep working.
export interface Routine {
  id: string;
  title: string;
  timeOfDay: TimeOfDay;
  reminderHour?: number; // 0-23, local time; absent = bucket default
  createdAt: string;
  updatedAt: string;
  deletedAt?: string;
}
```

```typescript
// New — one row per (routine, milestone-day) freeze consumed. Only
// needed if the freeze mechanic ships (recommended, see §6 Phase B);
// skip this type entirely for a Phase A/MVP cut.
export interface StreakFreeze {
  id: string;
  routineId: string;
  earnedAt: string;      // when the milestone that granted it was hit
  usedOnDate?: string;    // date it covered a miss; absent = still banked
}
```

## 2. Core logic — new file `mobile/lib/gamification.ts`

This is the one genuinely new module. Streak length and total XP are both pure functions over `Routine[]` + `RoutineCompletion[]` — the same data already loaded by `today.tsx` and already synced via `sync.ts`. That means **no new Supabase table and no new sync wiring is needed for streaks or XP in Phase A** — they fall out of data that's already cross-device. (A `StreakFreeze` table, if you build Phase B, does need its own sync — it's stateful, not derivable.)

```typescript
import type { Routine, RoutineCompletion } from './types';
import { formatDateKey } from './data';

// --- Streak ---

// Consecutive-day count for one routine, walking backward from today.
// If today isn't completed yet, counting starts from yesterday — a
// streak isn't broken until the day actually ends with nothing logged,
// matching how "done today" already works as a same-day-reversible toggle.
export function computeRoutineStreak(
  routineId: string,
  completions: RoutineCompletion[],
  today: Date = new Date(),
): number {
  const days = new Set(
    completions.filter((c) => c.routineId === routineId).map((c) => c.date),
  );
  const cursor = new Date(today);
  if (!days.has(formatDateKey(today))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(formatDateKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

// --- XP ---

export const BASE_XP_PER_COMPLETION = 10;
export const STREAK_BONUS_PER_DAY = 2;
export const STREAK_BONUS_CAP_DAYS = 20; // bonus plateaus at 40 XP so long streaks stay meaningful without the daily reward spiralling
export const MILESTONE_DAYS = [7, 30, 50, 100, 365];
export const MILESTONE_BONUS_XP = 50;

export function xpForCompletion(streakLengthAfterThisCompletion: number): number {
  const bonus = Math.min(streakLengthAfterThisCompletion, STREAK_BONUS_CAP_DAYS) * STREAK_BONUS_PER_DAY;
  const milestone = MILESTONE_DAYS.includes(streakLengthAfterThisCompletion) ? MILESTONE_BONUS_XP : 0;
  return BASE_XP_PER_COMPLETION + bonus + milestone;
}

// Total XP across every routine's full completion history — recomputed
// from source data rather than incrementally stored, so undo (toggling
// a completion off) can never let XP drift from what completions
// actually justify. Cheap at personal-app scale (hundreds of rows).
export function computeTotalXp(completions: RoutineCompletion[]): number {
  const byRoutine = new Map<string, string[]>();
  for (const c of completions) {
    (byRoutine.get(c.routineId) ?? byRoutine.set(c.routineId, []).get(c.routineId)!).push(c.date);
  }
  let totalXp = 0;
  for (const dates of byRoutine.values()) {
    const sorted = [...new Set(dates)].sort();
    let streak = 0;
    let prev: Date | null = null;
    for (const dateStr of sorted) {
      const d = new Date(`${dateStr}T00:00:00`);
      streak = prev && Math.round((d.getTime() - prev.getTime()) / 86_400_000) === 1 ? streak + 1 : 1;
      totalXp += xpForCompletion(streak);
      prev = d;
    }
  }
  return totalXp;
}

// --- Level ---

const LEVEL_BASE_XP = 30;
const LEVEL_EXPONENT = 1.5; // fast early levels, slower later — see design doc §2.4 for why

export function xpForLevel(level: number): number {
  return Math.round(LEVEL_BASE_XP * Math.pow(level, LEVEL_EXPONENT));
}

export function levelForTotalXp(totalXp: number): { level: number; xpIntoLevel: number; xpForNextLevel: number } {
  let level = 1;
  let remaining = totalXp;
  let needed = xpForLevel(level);
  while (remaining >= needed) {
    remaining -= needed;
    level++;
    needed = xpForLevel(level);
  }
  return { level, xpIntoLevel: remaining, xpForNextLevel: needed };
}

// --- Copy ---

export function checkInNotificationBody(routineTitle: string, currentStreak: number): string {
  return currentStreak > 0
    ? `🔥 Don't lose your ${currentStreak}-day streak — ${routineTitle}`
    : `${routineTitle} is ready when you are.`;
}

export function streakBrokenMessage(routineTitle: string, lostStreak: number): string {
  return `You lost your ${lostStreak}-day streak for "${routineTitle}." Start a new one today?`;
}
```

## 3. Storage — `mobile/lib/storage.ts` additions

Nothing needs to change in `addRoutineCompletion`/`deleteRoutineCompletion` themselves — since XP/level/streak are all derived (§2), the existing reversible toggle in `today.tsx` already keeps them correct for free. What's needed is a thin read helper for the UI:

```typescript
// Add near the other Routine helpers.
import { computeTotalXp, levelForTotalXp, computeRoutineStreak } from './gamification';

export async function loadProgressSummary() {
  const completions = await loadRoutineCompletions();
  const totalXp = computeTotalXp(completions);
  return { ...levelForTotalXp(totalXp), totalXp, completions };
}
```

If Phase B's `StreakFreeze` ships, it follows the exact same load/save/`pushLater` pattern already used for `Routine` (see `addRoutine`/`updateRoutine` in the current file) — new `KEYS.STREAK_FREEZES` key, a `syncTable` entry in `sync.ts` mirroring the `routines` one, and a `streak_freezes` remote table (`user_id, routine_id, earned_at, used_on_date`).

## 4. Notifications — `mobile/lib/notifications.ts` additions

Still fully local (Decision 002 stands — no backend needed for any of this). One new notification type, scheduled and cancelled the same way `scheduleEventNotifications`/`cancelEventNotifications` already work for events:

```typescript
import { checkInNotificationBody } from './gamification';
import { formatDateKey } from './data';
import type { Routine, TimeOfDay } from './types';

const ROUTINE_NOTIFICATION_PREFIX = 'belific-routine-';

const TIME_OF_DAY_DEFAULT_HOUR: Record<TimeOfDay, number> = {
  morning: 9,
  afternoon: 14,
  evening: 20,
};

export async function scheduleRoutineCheckIns(
  routines: Routine[],
  completedRoutineIds: Set<string>,
  streaksByRoutineId: Record<string, number>,
  today: Date = new Date(),
): Promise<void> {
  await cancelRoutineCheckIns();
  const now = new Date();
  for (const routine of routines) {
    if (completedRoutineIds.has(routine.id)) continue;
    const hour = routine.reminderHour ?? TIME_OF_DAY_DEFAULT_HOUR[routine.timeOfDay];
    const triggerDate = new Date(today);
    triggerDate.setHours(hour, 0, 0, 0);
    if (triggerDate <= now) continue;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `${ROUTINE_NOTIFICATION_PREFIX}${formatDateKey(today)}-${routine.id}`,
        content: {
          title: 'Belific',
          body: checkInNotificationBody(routine.title, streaksByRoutineId[routine.id] ?? 0),
          sound: 'notification.wav',
          data: { type: 'routine-checkin', routineId: routine.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: triggerDate },
      });
    } catch {
      // Skip individual notification failures silently — matches scheduleEventNotifications
    }
  }
}

export async function cancelRoutineCheckIns(): Promise<void> {
  const all = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    all
      .filter((n) => n.identifier.startsWith(ROUTINE_NOTIFICATION_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}
```

One notification per due-and-incomplete routine per day, capped by construction (there's exactly one trigger per routine, never a repeating chain) — this avoids the old flat "8pm unconditionally" problem: nothing fires for a routine that's already done, and the copy reflects the real streak instead of generic urgency text.

Deep-linking the tap: `_layout.tsx` already owns notification-permission setup per `architecture.md`; add a `Notifications.addNotificationResponseReceivedListener` there that reads `response.notification.request.content.data`, and on `type === 'routine-checkin'` calls `router.push('/')` (Today tab) — the check-in modal in §5 picks it up from there since it re-evaluates on focus.

## 5. Auto-popup check-in — new `mobile/app/components/RoutineCheckInModal.tsx`

Same `Modal` / `pageSheet` pattern as `RoutineFormModal` in the sibling `RoutineForm.tsx`. Shows once per calendar day, first time Today is opened after at least one due-and-incomplete routine exists — not on every single app open, so it doesn't nag:

```typescript
interface RoutineCheckInModalProps {
  visible: boolean;
  dueRoutines: Routine[];               // due-and-incomplete, computed by caller
  streaksByRoutineId: Record<string, number>;
  onConfirm: (routine: Routine) => void; // wraps existing toggleRoutine
  onDismiss: () => void;
}
```

Body: one row per due routine, `[title] [🔥 streak]  [Not yet] [Done ✓]` — "Done" calls the existing `toggleRoutine`/`addRoutineCompletion` path unchanged, so it inherits the same reversibility today's inline list already has. "Not yet" just closes that row without penalty; nothing breaks until the day actually ends (§2's streak logic already handles that).

Gating logic in `today.tsx`, inside `loadRoutinesData`:

```typescript
const LAST_PROMPT_KEY = 'belific_last_checkin_prompt_date';

async function maybeShowCheckIn(dueRoutines: Routine[]) {
  if (dueRoutines.length === 0) return;
  const lastPrompted = await AsyncStorage.getItem(LAST_PROMPT_KEY);
  if (lastPrompted === dateKey) return; // already prompted today
  setCheckInVisible(true);
}

function dismissCheckIn() {
  setCheckInVisible(false);
  AsyncStorage.setItem(LAST_PROMPT_KEY, dateKey);
}
```

"Due" means the routine's `timeOfDay` bucket has started (current hour ≥ its default/override hour, same table as §4) and it isn't in `completedRoutineIds`. A user can still always mark a routine done or undone from the plain inline list on Today, exactly as today — the modal is a convenience layer on top, never the only path, which is what keeps it "never mandatory" even with loss-framing now allowed elsewhere.

## 6. Today.tsx display changes

Two additions to the existing routine row rendering (around line 439-464 of the current file):

A streak badge next to the title, shown only once it's actually meaningful (a lone "🔥 1" reads as noise, not encouragement):
```typescript
const streak = computeRoutineStreak(routine.id, completions);
// ...
{streak >= 2 && <Text style={styles.streakBadge}>🔥 {streak}</Text>}
```

A level/XP pill in the header row, next to the date subtitle — pulls from `loadProgressSummary()` (§3):
```typescript
<Text style={styles.levelPill}>Lv. {level} · {xpIntoLevel}/{xpForNextLevel} XP</Text>
```

And wiring the new modal in alongside the existing `RoutineFormModal` at the bottom of the component:
```typescript
<RoutineCheckInModal
  visible={checkInVisible}
  dueRoutines={dueRoutines}
  streaksByRoutineId={streaksByRoutineId}
  onConfirm={toggleRoutine}
  onDismiss={dismissCheckIn}
/>
```

On a streak break, show the `streakBrokenMessage` from §2 once, the next time the user opens the app and that routine's row renders with a reset streak — a lightweight inline banner or toast is enough; this doesn't need to be a blocking alert.

## 7. Suggested build order (mirrors your existing Phase 1–4 pattern)

Phase A (MVP, one PR): `gamification.ts`, the streak badge + level pill on Today, `RoutineCheckInModal` gated on the daily-prompt-tracking above, `scheduleRoutineCheckIns`/`cancelRoutineCheckIns` wired into the same `useFocusEffect` that already calls `scheduleEventNotifications`. No new Supabase table required.

Phase B (polish): streak freezes (`StreakFreeze` type + sync table from §3), milestone celebration animation at day 7/30/50/100/365, a Settings toggle to disable the auto-popup and/or check-in notifications independently (keeps the "reversible/pausable" principle alive even though loss-framing itself is no longer restricted).

## 8. Docs that need updating to match this decision

These are locked/"do not change" files per `CLAUDE.md`'s own instructions — flagging exact replacement text so whoever does this (you, or a future Claude Code session) doesn't have to reconstruct the reasoning:

**`.claude/skills/design-identity/SKILL.md`** — replace the first bullet under "Design Principles":
> ~~No streak-guilt or loss-framing anywhere in the UI. Missed routines/tasks roll over silently, no red warnings, no "you broke your streak" language.~~
> Streaks and XP are real, visible mechanics (decision reversed 2026-08-21 — see `docs/decisions/006-reintroduce-streaks-and-xp.md`). Loss-framing is allowed when a streak actually breaks (real numbers, no fabricated urgency). Still no variable/random-reward mechanics, and the auto-popup check-in and its notifications must stay toggleable in Settings.

**`docs/UBIQUITOUS_LANGUAGE.md`** — remove the `"streak"` row from "What Not To Call Things"; add to Core Terms: `**Streak** | Consecutive-day completion count for one Routine, derived from RoutineCompletion (see mobile/lib/gamification.ts) — not stored directly.`

**`.claude/skills/features/notifications/SKILL.md`** — this file is already stale (describes the removed Weekly Summary and the old unconditional Streak at Risk as if live) independent of this decision; rewrite its table to the real three-then-four types: Custom Reminder, Event start, and the new Routine Check-in (§4) — drop Weekly Summary entirely, it's gone and isn't coming back under this plan.

**New `docs/decisions/006-reintroduce-streaks-and-xp.md`** — same format as 001-005: date, decision (streaks/XP/auto-popup check-ins reintroduced, real loss-framing permitted), reason (informed this time by the research in `belific_gamification_design.md` — freezes, transparent deterministic XP, per-routine targeted notifications instead of the old unconditional blast), consequences (design-identity and ubiquitous-language docs updated per above), do-not-change-unless clause.

**`docs/current-state-audit.md`** — add a "Phase 5 — Gamification" row once this actually ships, following the same Phase 1-4 write-up style already in that file.

## 9. One open item worth deciding before writing code

Per-routine streaks (this plan) versus one combined Routines-section streak is still worth a quick gut-check now that loss-framing is real — a combined streak means one missed routine can visibly "break" everything shown to the user in a single red moment, which is a stronger effect than per-routine streaks quietly resetting just that one row. Per-routine is what's specified above; flip to combined only if that's actually the feel you want.
